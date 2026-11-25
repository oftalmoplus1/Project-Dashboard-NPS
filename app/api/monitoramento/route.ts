import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/server/auth-session';
import { verifySupabaseUser } from '@/lib/server/verify-supabase-user';
import { monitoramentoRpc } from '@/lib/server/monitoramento-rpc';
import { parsePublishedGallery } from '@/lib/monitoramento-contract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

/** Only personalized dashboards with a published snapshot and effective ACL. */
export async function GET() {
 const token = (await cookies()).get(SESSION_COOKIE)?.value;
 if (!token) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401, headers });
 try {
  const user = await verifySupabaseUser(token);
  if (!user) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403, headers });
  const upstream = await monitoramentoRpc(token, 'dashboard_monitoramento_listar', {});
  if (!upstream.ok) return NextResponse.json({
   error: upstream.status === 401 || upstream.status === 403
    ? 'Acesso ao monitoramento negado.' : 'Catálogo publicado indisponível neste ambiente.',
  }, { status: upstream.status === 401 || upstream.status === 403 ? 403 : 503, headers });
  const rows = parsePublishedGallery(await upstream.json());
  if (!rows) return NextResponse.json({ error: 'Catálogo publicado inconsistente.' }, { status: 502, headers });
  return NextResponse.json({ rows }, { headers });
 } catch {
  return NextResponse.json({ error: 'Não foi possível consultar o monitoramento.' }, { status: 503, headers });
 }
}
