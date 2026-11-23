import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/server/auth-session';
import { verifySupabaseUser } from '@/lib/server/verify-supabase-user';
import { getSupabaseServerConfig } from '@/lib/server/supabase-config';
import { existingDashboards, isDashboardItem } from '@/lib/dashboard-registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'private, no-store' };

type Topic = { slug: string; nome: string };
type Entry = {
 codigo: string;
 nome: string;
 estado: 'disponivel' | 'rascunho' | 'publicado';
 topicos: Topic[];
};

function validTopic(value: unknown): value is Topic {
 if (!value || typeof value !== 'object') return false;
 const obj = value as Record<string, unknown>;
 return typeof obj.nome === 'string' && obj.nome.trim().length > 0
  && typeof obj.nome === 'string' && obj.nome.length <= 120
  && typeof obj.slug === 'string' && obj.slug.length <= 120
  && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(obj.slug);
}

async function rpc(token: string, name: string, params: Record<string, string>): Promise<unknown> {
 const { url, publishableKey } = getSupabaseServerConfig();
 const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
  method: 'POST',
  headers: { apikey: publishableKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify(params), cache: 'no-store', signal: AbortSignal.timeout(12000)
 });
 if (!response.ok) throw new Error('catalogo-indisponivel');
 return response.json();
}

/** Catalogo do aplicativo + associacoes reais. Disponivel nao significa publicado. */
export async function GET() {
 const token = (await cookies()).get(SESSION_COOKIE)?.value;
 if (!token) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401, headers: noStore });
 try {
  const user = await verifySupabaseUser(token);
  if (!user || user.role !== 'administrador') return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 403, headers: noStore });

  const topics: unknown = await rpc(token, 'dashboard_catalogo_listar_topicos', {});
  if (!Array.isArray(topics) || !topics.every(validTopic)) {
   return NextResponse.json({ error: 'Catálogo de tópicos inconsistente.' }, { status: 502, headers: noStore });
  }
  const links = await Promise.all((topics as Topic[]).map(async topic => {
   const rows: unknown = await rpc(token, 'dashboard_catalogo_listar_dashboards_topico', { p_slug: topic.slug });
   if (!Array.isArray(rows) || !rows.every(isDashboardItem)) throw new Error('associacoes-invalidas');
   return { topic, rows };
  }));
  const map = new Map<string, Entry>(
   existingDashboards.map(item => [item.codigo, { codigo: item.codigo, nome: item.nome, estado: 'disponivel' as const, topicos: [] }])
  );
  for (const { topic, rows } of links) {
   for (const linked of rows) {
    const entry = map.get(linked.codigo);
    if (!entry) throw new Error('codigo-invalido');
    if (entry.estado !== 'disponivel' && entry.estado !== linked.estado) throw new Error('estado-divergente');
    entry.nome = linked.nome;
    entry.estado = linked.estado;
    entry.topicos.push({ slug: topic.slug, nome: topic.nome });
   }
  }
  return NextResponse.json({
   rows: Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
   note: 'O inventário inclui as cinco visualizações implementadas; outras definições dependem do editor visual.'
  }, { headers: noStore });
 } catch {
  return NextResponse.json({ error: 'Não foi possível carregar o catálogo completo. Nenhuma lista parcial foi exibida.' }, { status: 503, headers: noStore });
 }
}
