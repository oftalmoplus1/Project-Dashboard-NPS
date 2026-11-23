import { allowedMutationOrigin } from '@/lib/server/public-origin';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/server/auth-session';
import { verifySupabaseUser } from '@/lib/server/verify-supabase-user';
import { getSupabaseServerConfig } from '@/lib/server/supabase-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validSlug = (value: string) => value.length <= 120 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value);

async function rpc(token: string, name: string, params: Record<string, string>) {
 const { url, publishableKey } = getSupabaseServerConfig();
 return fetch(`${url}/rest/v1/rpc/${name}`, {
  method: 'POST',
  headers: { apikey: publishableKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify(params),
  cache: 'no-store', signal: AbortSignal.timeout(12000)
 });
}

async function context(request: Request, slug: string) {
 if (!validSlug(slug)) return { error: NextResponse.json({ error: 'Tópico inválido.' }, { status: 400, headers }) };
 try {
  if (!allowedMutationOrigin(request)) return { error: NextResponse.json({ error: 'Origem inválida.' }, { status: 403, headers }) };
 } catch {
  return { error: NextResponse.json({ error: 'Origem pública configurada incorretamente.' }, { status: 503, headers }) };
 }
 if (!request.headers.get('content-type')?.includes('application/json'))
  return { error: NextResponse.json({ error: 'Formato inválido.' }, { status: 415, headers }) };
 const token = (await cookies()).get(SESSION_COOKIE)?.value;
 if (!token) return { error: NextResponse.json({ error: 'Sessão necessária.' }, { status: 401, headers }) };
 const user = await verifySupabaseUser(token);
 if (!user || user.role !== 'administrador') return {
  error: NextResponse.json({ error: 'Somente administradores podem modificar tópicos.' }, { status: 403, headers })
 };
 return { token };
}

async function upstreamError(result: Response) {
 const data: unknown = await result.json().catch(() => null);
 const code = data && typeof data === 'object' && 'code' in data ? (data as { code?: unknown }).code : null;
 const status = result.status === 401 || result.status === 403 || code === '42501' ? 403
  : code === '23505' || result.status === 409 ? 409
  : code === 'P0002' ? 404 : 503;
 const message = status === 409 ? 'Já existe outro tópico com esse nome.'
  : status === 404 ? 'Tópico não encontrado.' : status === 403 ? 'Acesso negado pelo catálogo.'
  : 'Operação indisponível. Verifique a instalação das funções administrativas.';
 return NextResponse.json({ error: message }, { status, headers });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
 const { slug } = await params;
 const auth = await context(request, slug);
 if (auth.error) return auth.error;
 let body: unknown;
 try { body = await request.json(); } catch { body = null; }
 if (!body || typeof body !== 'object' || Array.isArray(body))
  return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400, headers });
 const nome = (body as Record<string, unknown>).nome;
 if (typeof nome !== 'string' || nome.trim().length < 1 || nome.trim().length > 120)
  return NextResponse.json({ error: 'Informe um nome entre 1 e 120 caracteres.' }, { status: 400, headers });
 try {
  const result = await rpc(auth.token!, 'dashboard_catalogo_atualizar_topico', { p_slug: slug, p_nome: nome.trim() });
  if (!result.ok) return upstreamError(result);
  const id: unknown = await result.json();
  if (typeof id !== 'string' || !UUID.test(id)) return NextResponse.json({ error: 'Retorno inesperado do catálogo.' }, { status: 502, headers });
  return NextResponse.json({ id }, { headers });
 } catch {
  return NextResponse.json({ error: 'Não foi possível atualizar o tópico.' }, { status: 503, headers });
 }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string }> }) {
 const { slug } = await params;
 const auth = await context(request, slug);
 if (auth.error) return auth.error;
 let body: unknown;
 try { body = await request.json(); } catch { body = null; }
 const confirmation = body && typeof body === 'object' && !Array.isArray(body)
  ? (body as Record<string, unknown>).confirmar_slug : null;
 if (confirmation !== slug) return NextResponse.json({
  error: 'Confirmação inválida. Digite o identificador do tópico.'
 }, { status: 400, headers });
 try {
  const result = await rpc(auth.token!, 'dashboard_catalogo_excluir_topico', { p_slug: slug, p_confirmar_slug: slug });
  if (!result.ok) return upstreamError(result);
  const outcome: unknown = await result.json();
  if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)
   || (outcome as Record<string, unknown>).slug !== slug
   || (outcome as Record<string, unknown>).dashboards_originais_preservados !== true)
   return NextResponse.json({ error: 'Retorno inesperado do catálogo.' }, { status: 502, headers });
  return NextResponse.json({ result: outcome }, { headers });
 } catch {
  return NextResponse.json({ error: 'Não foi possível excluir o tópico.' }, { status: 503, headers });
 }
}
