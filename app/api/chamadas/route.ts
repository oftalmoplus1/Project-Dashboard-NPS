import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/server/auth-session';
import { verifySupabaseUser } from '@/lib/server/verify-supabase-user';
import { getSupabaseServerConfig } from '@/lib/server/supabase-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 365;

function parseDate(value: string | null): number | null {
  if (!value || !DATE_PATTERN.test(value)) return null;
  const timestamp = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
    ? timestamp : null;
}

type AggregateRow = {
  periodo_inicio: string;
  total: number;
  atendidas: number;
  nao_atendidas: number;
  abandonadas: number;
  outras: number;
};

function isAggregateRow(value: unknown): value is AggregateRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.periodo_inicio === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(row.periodo_inicio)
    && ['total', 'atendidas', 'nao_atendidas', 'abandonadas', 'outras'].every(
      key => typeof row[key] === 'number' && Number.isSafeInteger(row[key]) && (row[key] as number) >= 0
    );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');
  const startTime = parseDate(start);
  const endTime = parseDate(end);

  if (startTime === null || endTime === null || endTime < startTime
      || (endTime - startTime) / 86400000 > MAX_DAYS) {
    return NextResponse.json({ error: 'Período inválido.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 });

  try {
    const user = await verifySupabaseUser(token);
    if (!user) return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 403 });

    const { url: supabaseUrl, publishableKey } = getSupabaseServerConfig();
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/dashboard_chamadas_agregadas`, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ p_inicio: start, p_fim: end }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Não foi possível consultar os indicadores.' },
        { status: response.status === 401 || response.status === 403 ? 403 : 502 });
    }

    const payload: unknown = await response.json();
    if (!Array.isArray(payload) || !payload.every(isAggregateRow)) {
      return NextResponse.json({ error: 'Formato inesperado dos indicadores.' }, { status: 502 });
    }

    return NextResponse.json({ rows: payload }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Serviço de indicadores indisponível.' }, { status: 503 });
  }
}
