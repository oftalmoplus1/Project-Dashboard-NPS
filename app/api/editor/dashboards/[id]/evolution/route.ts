import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/server/auth-session';
import { allowedMutationOrigin } from '@/lib/server/public-origin';
import { getSupabaseServerConfig } from '@/lib/server/supabase-config';
import { verifySupabaseUser } from '@/lib/server/verify-supabase-user';
import { resolveEvolutionPeriod } from '@/lib/editor-evolution';
import {
 parseEvolutionConfig, projectVerifiedEvolution,
} from '@/lib/editor-evolution-verified';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maxRequestBytes = 8192;
const maxResponseBytes = 8 * 1024 * 1024;
type Context = { params: Promise<{ id: string }> };

function failure(error: string, status: number) {
 return NextResponse.json({ error }, { status, headers: noStore });
}

/**
 * Draft-only preview. The upstream RPC MUST re-check auth.users
 * app_metadata, dashboard draft status and per-queue permissions.
 * This route never selects relatorio_chamadas or listar_filas directly.
 */
export async function POST(request: Request, context: Context) {
 try {
  if (!allowedMutationOrigin(request)) return failure('Origem não autorizada.', 403);
 } catch {
  return failure('Origem da aplicação inválida.', 503);
 }
 if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
  return failure('Formato inválido.', 415);
 }
 const contentLength = Number(request.headers.get('content-length'));
 if (Number.isFinite(contentLength) && contentLength > maxRequestBytes) {
  return failure('Configuração muito grande.', 413);
 }
 const { id } = await context.params;
 if (!uuid.test(id)) return failure('Dashboard inválido.', 400);
 const token = (await cookies()).get(SESSION_COOKIE)?.value;
 if (!token) return failure('Sessão necessária.', 401);

 try {
  const user = await verifySupabaseUser(token);
  if (!user || user.role !== 'administrador') return failure('Acesso negado.', 403);
 } catch {
  return failure('Não foi possível validar a sessão.', 503);
 }

 const evaluationTime = new Date();
 let config;
 try {
  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > maxRequestBytes) return failure('Configuração muito grande.', 413);
  config = parseEvolutionConfig(JSON.parse(raw), evaluationTime);
 } catch {
  return failure('Configuração inválida.', 400);
 }

 // Explicit opt-in only AFTER live source, event semantics, ACL and draft
 // scope have been audited in the real self-hosted Supabase instance.
 if (process.env.EDITOR_EVOLUTION_SOURCE_VERIFIED !== 'true') {
  return failure('Histórico de entradas em filas ainda não homologado.', 503);
 }

 const period = resolveEvolutionPeriod(config.period, evaluationTime);
 try {
  const { url, publishableKey } = getSupabaseServerConfig();
  const upstream = await fetch(url + '/rest/v1/rpc/dashboard_editor_filas_evolucao', {
   method: 'POST',
   headers: {
    apikey: publishableKey,
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json',
    Accept: 'application/json',
   },
   cache: 'no-store',
   signal: AbortSignal.timeout(15000),
   body: JSON.stringify({
    p_dashboard_id: id,
    p_inicio: period.start,
    p_fim: period.end,
    p_agrupamento: config.grouping,
    p_todas_filas: config.queues.mode === 'all',
    p_fila_ids: config.queues.mode === 'selected' ? config.queues.ids : [],
   }),
  });
  if (!upstream.ok) {
   // PostgREST errors may contain internal function and schema names.
   // Return stable, non-diagnostic errors to the browser instead.
   if ([401, 403].includes(upstream.status)) return failure('Acesso negado.', 403);
   return failure('Fonte histórica de filas indisponível.', 503);
  }
  const length = Number(upstream.headers.get('content-length'));
  if (Number.isFinite(length) && length > maxResponseBytes) {
   return failure('Resposta histórica excedeu o limite seguro.', 502);
  }
  const raw = await upstream.text();
  if (Buffer.byteLength(raw, 'utf8') > maxResponseBytes) {
   return failure('Resposta histórica excedeu o limite seguro.', 502);
  }
  let projected;
  try {
   const rows: unknown = JSON.parse(raw);
   if (!Array.isArray(rows) || rows.length !== 1) {
    return failure('Resposta histórica inválida.', 502);
   }
   projected = projectVerifiedEvolution(config, rows[0], evaluationTime);
  } catch {
   return failure('Resposta histórica inválida.', 502);
  }
  return NextResponse.json({ ...projected, source: 'verified_queue_entries' }, { headers: noStore });
 } catch {
  return failure('Não foi possível consultar o histórico de filas.', 503);
 }
}
