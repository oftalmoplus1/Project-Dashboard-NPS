import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { getAuthorizedUser, SESSION_COOKIE } from '@/lib/server/auth-session';
import { getSupabaseServerConfig } from '@/lib/server/supabase-config';
import DashboardVisualEditor from '@/components/dashboard-visual-editor';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type DraftRow = {
 id: string;
 nome: string;
 descricao: string | null;
 estado: 'rascunho' | 'publicado';
 topico_slug: string;
 topico_nome: string;
};

function isDraftRow(value: unknown): value is DraftRow {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
 const row = value as Record<string, unknown>;
 return typeof row.id === 'string'
  && typeof row.nome === 'string' && row.nome.trim().length > 0 && row.nome.length <= 120
  && (row.descricao === null || typeof row.descricao === 'string')
  && (row.estado === 'rascunho' || row.estado === 'publicado')
  && typeof row.topico_slug === 'string' && typeof row.topico_nome === 'string';
}

/** Acesso direto a URL exige admin e cadastro existente no catalogo privado. */
export default async function DashboardEditorPage({
 params,
}: {
 params: Promise<{ id: string }>;
}) {
 const user = await getAuthorizedUser();
 if (!user) redirect('/login');
 if (user.role !== 'administrador') notFound();

 const { id } = await params;
 if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
  notFound();
 }
 const token = (await cookies()).get(SESSION_COOKIE)?.value;
 if (!token) redirect('/login');

 let rows: unknown;
 try {
  const { url, publishableKey } = getSupabaseServerConfig();
  const response = await fetch(url + '/rest/v1/rpc/dashboard_catalogo_listar_personalizados', {
   method: 'POST',
   headers: {
    apikey: publishableKey,
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json',
    Accept: 'application/json',
   },
   body: '{}',
   cache: 'no-store',
   signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error('catalog unavailable');
  rows = await response.json();
 } catch {
  return <main style={{ padding: 32 }} role="alert">
   Não foi possível consultar o catálogo de rascunhos. Tente novamente pela Administração.
  </main>;
 }
 if (!Array.isArray(rows) || !rows.every(isDraftRow)) notFound();
 const draft = rows.find((row: DraftRow) => row.id === id && row.estado === 'rascunho');
 if (!draft) notFound();

 return <DashboardVisualEditor dashboard={{
  id: draft.id, nome: draft.nome, topicoNome: draft.topico_nome
 }}/>;
}
