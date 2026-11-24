import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/server/auth-session';
import { verifySupabaseUser } from '@/lib/server/verify-supabase-user';
import { allowedMutationOrigin } from '@/lib/server/public-origin';
import { getSupabaseServerConfig } from '@/lib/server/supabase-config';
import { parseEditorBlocks, parseEditorLayoutSnapshot } from '@/lib/editor-layout-contract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'private, no-store' };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PAYLOAD_BYTES = 131072;

type Context = { params: Promise<{ id: string }> };

const failure = (error: string, status: number) =>
 NextResponse.json({ error }, { status, headers: noStore });

async function callRpc(token: string, name: string, input: Record<string, unknown>) {
 const { url, publishableKey } = getSupabaseServerConfig();
 return fetch(url + '/rest/v1/rpc/' + name, {
  method: 'POST',
  headers: {
   apikey: publishableKey,
   Authorization: 'Bearer ' + token,
   'Content-Type': 'application/json',
   Accept: 'application/json',
  },
  body: JSON.stringify(input),
  cache: 'no-store',
  signal: AbortSignal.timeout(12000),
 });
}

async function contextAdmin(context: Context) {
 const { id } = await context.params;
 if (!uuid.test(id)) return { status: 400 as const, token: null, id };
 const token = (await cookies()).get(SESSION_COOKIE)?.value;
 if (!token) return { status: 401 as const, token: null, id };
 const user = await verifySupabaseUser(token);
 if (!user || user.role !== 'administrador') return { status: 403 as const, token: null, id };
 return { status: 200 as const, token, id };
}

function failForRpc(response: Response, code: unknown) {
 if (response.status === 401 || response.status === 403 || code === '42501') {
  return failure('Acesso ao rascunho negado.', 403);
 }
 if (code === 'P0002') return failure('Rascunho não encontrado ou já publicado.', 404);
 if (code === '40001') {
  return failure('O layout foi alterado em outra sessão. Recarregue antes de editar novamente.', 409);
 }
 if (code === '22023') return failure('Conteúdo do layout inválido.', 400);
 return failure('Persistência do editor indisponível neste ambiente.', 503);
}

async function upstreamError(response: Response) {
 const payload: unknown = await response.json().catch(() => null);
 const code = payload && typeof payload === 'object' && 'code' in payload
  ? (payload as { code: unknown }).code : null;
 return failForRpc(response, code);
}

/** Read-only, admin-only view of a *draft*. No raw access to any table. */
export async function GET(_request: Request, context: Context) {
 try {
  const auth = await contextAdmin(context);
  if (auth.status !== 200 || !auth.token) {
   return failure(auth.status === 400 ? 'Identificador inválido.' : 'Sessão ou permissão necessária.', auth.status);
  }
  const result = await callRpc(auth.token, 'dashboard_editor_layout_ler', {
   p_dashboard_id: auth.id,
  });
  if (!result.ok) return upstreamError(result);
  const rows: unknown = await result.json();
  if (!Array.isArray(rows) || rows.length !== 1) return failure('Layout retornado inválido.', 502);
  const snapshot = parseEditorLayoutSnapshot({
   revision: rows[0]?.revisao, blocks: rows[0]?.blocos,
  });
  if (!snapshot) return failure('Layout retornado inválido.', 502);
  return NextResponse.json(snapshot, { headers: noStore });
 } catch {
  return failure('Não foi possível consultar o layout.', 503);
 }
}

/**
 * Compare-and-swap. Every write checks auth, origin, strict schema and the
 * DB revision. Conflict must never be retried blindly, even on timeout.
 */
export async function PUT(request: Request, context: Context) {
 try {
  if (!allowedMutationOrigin(request)) return failure('Origem inválida.', 403);
 } catch {
  return failure('Origem pública configurada incorretamente.', 503);
 }
 if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
  return failure('Formato inválido.', 415);
 }
 const indicated = Number(request.headers.get('content-length'));
 if (Number.isFinite(indicated) && indicated > MAX_PAYLOAD_BYTES) {
  return failure('Layout excede o limite permitido.', 413);
 }
 let input: unknown;
 try {
  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_PAYLOAD_BYTES) {
   return failure('Layout excede o limite permitido.', 413);
  }
  input = JSON.parse(raw);
 } catch {
  return failure('JSON inválido.', 400);
 }
 if (!input || typeof input !== 'object' || Array.isArray(input)) return failure('Layout inválido.', 400);
 const body = input as Record<string, unknown>;
 if (Object.keys(body).sort().join(',') !== 'blocks,revision') return failure('Campos inválidos.', 400);
 if (!Number.isSafeInteger(body.revision) || (body.revision as number) < 0) {
  return failure('Revisão inválida.', 400);
 }
 const blocks = parseEditorBlocks(body.blocks);
 if (blocks === null) return failure('Componentes inválidos ou sobrepostos.', 400);

 try {
  const auth = await contextAdmin(context);
  if (auth.status !== 200 || !auth.token) {
   return failure(auth.status === 400 ? 'Identificador inválido.' : 'Sessão ou permissão necessária.', auth.status);
  }
  const result = await callRpc(auth.token, 'dashboard_editor_layout_salvar', {
   p_dashboard_id: auth.id, p_revisao_esperada: body.revision, p_blocos: blocks,
  });
  if (!result.ok) return upstreamError(result);
  const rows: unknown = await result.json();
  if (!Array.isArray(rows) || rows.length !== 1) return failure('Confirmação do layout inválida.', 502);
  const saved = parseEditorLayoutSnapshot({ revision: rows[0]?.revisao, blocks: rows[0]?.blocos });
  if (!saved || saved.revision !== (body.revision as number) + 1
   || JSON.stringify(saved.blocks) !== JSON.stringify(blocks)) {
   return failure('Confirmação do layout inválida. Recarregue antes de salvar novamente.', 502);
  }
  return NextResponse.json(saved, { headers: noStore });
 } catch {
  return failure('Não foi possível confirmar a gravação. Recarregue o rascunho antes de tentar novamente.', 503);
 }
}
