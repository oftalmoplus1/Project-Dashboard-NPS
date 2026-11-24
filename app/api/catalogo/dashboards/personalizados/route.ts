import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { allowedMutationOrigin } from '@/lib/server/public-origin';
import { SESSION_COOKIE } from '@/lib/server/auth-session';
import { verifySupabaseUser } from '@/lib/server/verify-supabase-user';
import { getSupabaseServerConfig } from '@/lib/server/supabase-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'private, no-store' };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const slug = /^[a-z0-9]+(-[a-z0-9]+)*$/;

type Personalized = {
 id: string;
 nome: string;
 descricao: string | null;
 estado: 'rascunho' | 'publicado';
 topico_slug: string;
 topico_nome: string;
 criado_em: string;
};

function validPersonalized(value: unknown): value is Personalized {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
 const item = value as Record<string, unknown>;
 return typeof item.id === 'string' && uuid.test(item.id)
  && typeof item.nome === 'string' && item.nome.trim().length > 0 && item.nome.length <= 120
  && (item.descricao === null || (typeof item.descricao === 'string' && item.descricao.length <= 500))
  && (item.estado === 'rascunho' || item.estado === 'publicado')
  && typeof item.topico_slug === 'string' && item.topico_slug.length <= 120 && slug.test(item.topico_slug)
  && typeof item.topico_nome === 'string' && item.topico_nome.length > 0 && item.topico_nome.length <= 120
  && typeof item.criado_em === 'string' && Number.isFinite(Date.parse(item.criado_em));
}

async function rpc(token: string, name: string, payload: Record<string, string | null>) {
 const { url, publishableKey } = getSupabaseServerConfig();
 return fetch(`${url}/rest/v1/rpc/${name}`, {
  method: 'POST',
  headers: {
   apikey: publishableKey,
   Authorization: `Bearer ${token}`,
   Accept: 'application/json',
   'Content-Type': 'application/json'
  },
  body: JSON.stringify(payload),
  cache: 'no-store',
  signal: AbortSignal.timeout(12000)
 });
}

const unauthorized = () =>
 NextResponse.json({ error: 'Somente administradores podem gerenciar rascunhos.' }, { status: 403, headers: noStore });

/** Inventário separado: nao altera o contrato das visualizacoes legadas. */
export async function GET() {
 const token = (await cookies()).get(SESSION_COOKIE)?.value;
 if (!token) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401, headers: noStore });
 try {
  const user = await verifySupabaseUser(token);
  if (!user || user.role !== 'administrador') return unauthorized();

  const response = await rpc(token, 'dashboard_catalogo_listar_personalizados', {});
  if (!response.ok) return NextResponse.json(
   { error: 'Cadastro de dashboards personalizados ainda não disponível neste ambiente.' },
   { status: response.status === 401 || response.status === 403 ? 403 : 503, headers: noStore }
  );
  const rows: unknown = await response.json();
  if (!Array.isArray(rows) || !rows.every(validPersonalized)) {
   return NextResponse.json({ error: 'Resposta inconsistente do catálogo personalizado.' }, { status: 502, headers: noStore });
  }
  return NextResponse.json({ rows }, { headers: noStore });
 } catch {
  return NextResponse.json({ error: 'Não foi possível consultar os dashboards personalizados.' }, { status: 503, headers: noStore });
 }
}

/** A criacao eh atomica na RPC e nunca concede acesso de visualizacao. */
export async function POST(request: Request) {
 try {
  if (!allowedMutationOrigin(request)) {
   return NextResponse.json({ error: 'Origem inválida.' }, { status: 403, headers: noStore });
  }
 } catch {
  return NextResponse.json({ error: 'Origem pública configurada incorretamente.' }, { status: 503, headers: noStore });
 }
 if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
  return NextResponse.json({ error: 'Formato inválido.' }, { status: 415, headers: noStore });
 }
 const bodySize = Number(request.headers.get('content-length'));
 if (Number.isFinite(bodySize) && bodySize > 8192) {
  return NextResponse.json({ error: 'Dados excedem o limite permitido.' }, { status: 413, headers: noStore });
 }
 const token = (await cookies()).get(SESSION_COOKIE)?.value;
 if (!token) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401, headers: noStore });

 let input: unknown;
 try {
  const raw = await request.text();
  if (raw.length > 8192) return NextResponse.json({ error: 'Dados excedem o limite permitido.' }, { status: 413, headers: noStore });
  input = JSON.parse(raw);
 } catch {
  return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400, headers: noStore });
 }
 if (!input || typeof input !== 'object' || Array.isArray(input)) {
  return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400, headers: noStore });
 }
 const obj = input as Record<string, unknown>;
 const keys = Object.keys(obj);
 if (keys.some(key => !['nome', 'descricao', 'topico_slug'].includes(key))
  || typeof obj.nome !== 'string' || typeof obj.topico_slug !== 'string'
  || (obj.descricao !== undefined && obj.descricao !== null && typeof obj.descricao !== 'string')) {
  return NextResponse.json({ error: 'Campos inválidos.' }, { status: 400, headers: noStore });
 }
 const nome = obj.nome.trim();
 const topico = obj.topico_slug.trim();
 const descricao = typeof obj.descricao === 'string' ? obj.descricao.trim() : '';
 if (!nome || nome.length > 120 || descricao.length > 500 || !slug.test(topico) || topico.length > 120) {
  return NextResponse.json({ error: 'Informe nome, tópico e descrição válidos.' }, { status: 400, headers: noStore });
 }

 try {
  const user = await verifySupabaseUser(token);
  if (!user || user.role !== 'administrador') return unauthorized();

  const response = await rpc(token, 'dashboard_catalogo_criar_personalizado', {
   p_nome: nome, p_descricao: descricao || null, p_topico_slug: topico
  });
  if (!response.ok) {
   const errorData: unknown = await response.json().catch(() => null);
   const errorCode = errorData && typeof errorData === 'object' && 'code' in errorData
    ? (errorData as { code?: unknown }).code : null;
   const status = errorCode === 'P0002' ? 404
    : errorCode === '22023' ? 400
    : errorCode === '42501' || response.status === 401 || response.status === 403 ? 403 : 503;
   return NextResponse.json({
    error: status === 404 ? 'Tópico não encontrado.'
     : status === 400 ? 'Dados inválidos.'
     : status === 403 ? 'Acesso não autorizado para criar rascunhos.'
     : 'Não foi possível criar o rascunho. Verifique se a migração foi instalada.'
   }, { status, headers: noStore });
  }
  const id: unknown = await response.json();
  if (typeof id !== 'string' || !uuid.test(id)) {
   return NextResponse.json({ error: 'Resposta inesperada da criação do rascunho.' }, { status: 502, headers: noStore });
  }
  return NextResponse.json({ id, estado: 'rascunho' }, { status: 201, headers: noStore });
 } catch {
  return NextResponse.json({ error: 'Não foi possível criar o rascunho.' }, { status: 503, headers: noStore });
 }
}
