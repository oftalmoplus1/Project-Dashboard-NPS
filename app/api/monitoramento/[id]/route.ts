import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/server/auth-session';
import { verifySupabaseUser } from '@/lib/server/verify-supabase-user';
import { monitoramentoRpc } from '@/lib/server/monitoramento-rpc';
import { parsePublishedDashboard } from '@/lib/monitoramento-contract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Context = { params: Promise<{ id: string }> };

/** A request to a guessed UUID is indistinguishable from an unshared dashboard. */
export async function GET(_request: Request, context: Context) {
 const token = (await cookies()).get(SESSION_COOKIE)?.value;
 if (!token) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401, headers });
 const { id } = await context.params;
 if (!uuid.test(id)) {
  // Diagnostico temporario somente no upstream sintetico do CI.
  if (process.env.SUPABASE_PUBLISHABLE_KEY === 'monitor-test-only') {
   console.error('MONITOR_TEST_INVALID_ID', JSON.stringify({ id, path: new URL(_request.url).pathname }));
  }
  return NextResponse.json({ error: 'Identificador inválido.' }, { status: 400, headers });
 }
 try {
  const user = await verifySupabaseUser(token);
  if (!user) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403, headers });
  const upstream = await monitoramentoRpc(token, 'dashboard_monitoramento_obter', { p_dashboard_id: id });
  if (!upstream.ok) {
   let code: unknown = null;
   try { const body: unknown = await upstream.json(); if (body && typeof body === 'object' && 'code' in body) code = body.code; } catch { /* sem corpo */ }
   const denied = upstream.status === 401 || upstream.status === 403 || code === '42501';
   const missing = code === 'P0002';
   const status = denied ? 403 : missing ? 404 : 503;
   return NextResponse.json({ error: denied ? 'Acesso negado.' : missing
    ? 'Dashboard não encontrado ou sem acesso.' : 'Dashboard publicado indisponível.' }, { status, headers });
  }
  const payload: unknown = await upstream.json();
  if (!Array.isArray(payload) || payload.length !== 1) {
   return NextResponse.json({ error: 'Versão publicada inconsistente.' }, { status: 502, headers });
  }
  const row = parsePublishedDashboard(payload[0]);
  if (!row || row.dashboard_id !== id) return NextResponse.json({
   error: 'Versão publicada inválida ou incompleta.',
  }, { status: 502, headers });
  return NextResponse.json(row, { headers });
 } catch {
  return NextResponse.json({ error: 'Não foi possível consultar o dashboard publicado.' }, { status: 503, headers });
 }
}
