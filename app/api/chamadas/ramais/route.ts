import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/server/auth-session';
import { verifySupabaseUser } from '@/lib/server/verify-supabase-user';
import { isCivilDate, validateRange } from '@/lib/call-chart-data';
import { parseExtensionResponse } from '@/lib/ligsim-report-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const start = params.get('start'), end = params.get('end');
  if (!isCivilDate(start) || !isCivilDate(end)) return NextResponse.json({ error: 'Periodo invalido.' }, { status: 400, headers });
  try { validateRange({ start, end }); }
  catch { return NextResponse.json({ error: 'Periodo invalido.' }, { status: 400, headers }); }

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: 'Sessao necessaria.' }, { status: 401, headers });
  try {
    const user = await verifySupabaseUser(token);
    if (!user || user.role !== 'administrador') return NextResponse.json({ error: 'Acesso nao autorizado.' }, { status: 403, headers });
    const rawBase = process.env.LIGSIM_API_BASE_URL?.trim();
    const secret = process.env.LIGSIM_INTEGRATION_KEY?.trim();
    if (!rawBase || !secret) return NextResponse.json({ error: 'Integracao de ramais nao configurada.' }, { status: 503, headers });
    const url = new URL(rawBase);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
        !url.pathname.endsWith('/v2') || !url.hostname) throw new Error('Configuracao LigSim invalida');
    // The documented chartcallsipdst API uses date path segments.
    const endpoint = new URL(url.href.replace(/\/$/, '') + '/reports/chartcallsipdst/' + start + '/' + end);
    const upstream = await fetch(endpoint, {
      headers: { Accept: 'application/json', integrationkey: secret },
      cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    if (!upstream.ok) return NextResponse.json({ error: 'Consulta de ramais indisponivel.' }, { status: 502, headers });
    const payload: unknown = await upstream.json();
    const rows = parseExtensionResponse(payload);
    return NextResponse.json({ rows, source: 'LigSim', period: { start, end } }, { headers });
  } catch {
    return NextResponse.json({ error: 'Nao foi possivel validar os dados por ramal.' }, { status: 503, headers });
  }
}
