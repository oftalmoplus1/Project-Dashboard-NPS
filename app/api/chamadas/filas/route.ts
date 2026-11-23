import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/server/auth-session';
import { verifySupabaseUser } from '@/lib/server/verify-supabase-user';
import { getSupabaseServerConfig } from '@/lib/server/supabase-config';
import { parseQueueSnapshot } from '@/lib/ligsim-queue-snapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

/** Current snapshot only. Never accept arbitrary table names, SQL or date ranges. */
export async function GET() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: 'Sessao necessaria.' }, { status: 401, headers });
  try {
    const user = await verifySupabaseUser(token);
    if (!user || user.role !== 'administrador') {
      return NextResponse.json({ error: 'Acesso nao autorizado.' }, { status: 403, headers });
    }
    const { url, publishableKey } = getSupabaseServerConfig();
    const query = new URLSearchParams({
      select: 'id,name,received,answered,abandon_more_30s,abandon_less_30s,waiting_calls',
      order: 'id.asc',
      limit: '200',
    });
    const upstream = await fetch(url + '/rest/v1/listar_filas?' + query, {
      headers: {
        apikey: publishableKey,
        Authorization: 'Bearer ' + token,
        Accept: 'application/json',
        Prefer: 'count=exact',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (upstream.status === 401 || upstream.status === 403) {
      return NextResponse.json({ error: 'Acesso a listar_filas negado pelo Supabase.' }, {
        status: 403, headers,
      });
    }
    if (!upstream.ok) {
      return NextResponse.json({ error: 'Fonte listar_filas indisponivel.' }, { status: 503, headers });
    }
    const contentRange = upstream.headers.get('Content-Range');
    const match = contentRange?.match(/^\d+-\d+\/(\d+)$/);
    if (!match || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) > 200) {
      return NextResponse.json({ error: 'Nao foi possivel comprovar a integridade da lista de filas.' }, {
        status: 502, headers,
      });
    }
    const payload: unknown = await upstream.json();
    const parsed = parseQueueSnapshot(payload);
    if (parsed.rows.length !== Number(match[1])) {
      return NextResponse.json({ error: 'Consulta de filas incompleta.' }, { status: 502, headers });
    }
    return NextResponse.json({
      ...parsed, source: 'listar_filas', kind: 'latest_snapshot', consultedAt: new Date().toISOString(),
      note: 'Instantaneo da ultima coleta disponivel; nao e historico diario nem horario.',
    }, { headers });
  } catch {
    return NextResponse.json({ error: 'Nao foi possivel validar os dados atuais das filas.' }, {
      status: 503, headers,
    });
  }
}
