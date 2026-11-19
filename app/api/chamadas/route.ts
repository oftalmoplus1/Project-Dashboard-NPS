import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/server/auth-session';
import { verifySupabaseUser } from '@/lib/server/verify-supabase-user';
import { getSupabaseServerConfig } from '@/lib/server/supabase-config';
import { isCivilDate, validateRange } from '@/lib/call-chart-data';
import { AggregateRequestError, fetchCallAggregates } from '@/lib/server/fetch-call-aggregates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const start = params.get('start');
  const end = params.get('end');
  if (!isCivilDate(start) || !isCivilDate(end)) {
    return NextResponse.json({ error: 'Periodo invalido.' }, { status: 400, headers });
  }
  try { validateRange({ start, end }); }
  catch { return NextResponse.json({ error: 'Periodo invalido.' }, { status: 400, headers }); }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: 'Sessao necessaria.' }, { status: 401, headers });
  try {
    const user = await verifySupabaseUser(token);
    if (!user || user.role !== 'administrador') {
      return NextResponse.json({ error: 'Acesso nao autorizado.' }, { status: 403, headers });
    }
    const rows = await fetchCallAggregates(getSupabaseServerConfig(), token, { start, end });
    return NextResponse.json({ rows }, { headers });
  } catch (error) {
    return NextResponse.json({ error: 'Nao foi possivel obter todas as chamadas do periodo.' }, {
      status: error instanceof AggregateRequestError ? error.status : 503, headers,
    });
  }
}
