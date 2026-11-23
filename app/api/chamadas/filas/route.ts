import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/server/auth-session';
import { verifySupabaseUser } from '@/lib/server/verify-supabase-user';
import { getSupabaseServerConfig } from '@/lib/server/supabase-config';
import { parseQueueSnapshot } from '@/lib/ligsim-queue-snapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
const MAX_STALENESS_MS = 3 * 60 * 60 * 1000;
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;
const BATCH_WINDOW_MS = 5 * 60 * 1000;

function validatedBatch(payload: unknown): {
  rows: ReturnType<typeof parseQueueSnapshot>['rows'];
  summary: ReturnType<typeof parseQueueSnapshot>['summary'];
  sourceUpdatedAt: string;
} {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Resposta de filas invalida');
  }
  const data = payload as Record<string, unknown>;
  if (!Array.isArray(data.rows) || data.snapshotKind !== 'latest_successful_batch' ||
      typeof data.sourceUpdatedAt !== 'string') {
    throw new Error('Formato ou coorte de filas invalido');
  }
  const latest = Date.parse(data.sourceUpdatedAt);
  const age = Date.now() - latest;
  if (!Number.isFinite(latest) || age > MAX_STALENESS_MS || age < -MAX_FUTURE_CLOCK_SKEW_MS) {
    throw new Error('Fonte de filas desatualizada');
  }
  for (const raw of data.rows) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('Registro de fila invalido');
    }
    const timestamp = (raw as Record<string, unknown>).updated_at;
    if (typeof timestamp !== 'string') throw new Error('Horario de fila ausente');
    const updated = Date.parse(timestamp);
    if (!Number.isFinite(updated) || updated > latest ||
        latest - updated > BATCH_WINDOW_MS) {
      throw new Error('Fila fora da ultima coleta');
    }
  }
  const parsed = parseQueueSnapshot(data.rows);
  return { ...parsed, sourceUpdatedAt: new Date(latest).toISOString() };
}

/** Admin-only RPC: no raw table grants, no service_role and no agent/member data. */
export async function GET() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: 'Sessao necessaria.' }, { status: 401, headers });
  try {
    const user = await verifySupabaseUser(token);
    if (!user || user.role !== 'administrador') {
      return NextResponse.json({ error: 'Acesso nao autorizado.' }, { status: 403, headers });
    }
    const { url, publishableKey } = getSupabaseServerConfig();
    const upstream = await fetch(url + '/rest/v1/rpc/dashboard_ligsim_filas_ativas', {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        Authorization: 'Bearer ' + token,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: '{}',
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (upstream.status === 401 || upstream.status === 403) {
      return NextResponse.json({ error: 'Acesso a filas negado pelo Supabase.' }, {
        status: 403, headers,
      });
    }
    if (!upstream.ok) {
      return NextResponse.json({ error: 'Fonte de filas indisponivel ou ainda nao configurada.' }, {
        status: 503, headers,
      });
    }
    const payload: unknown = await upstream.json();
    const parsed = validatedBatch(payload);
    return NextResponse.json({
      ...parsed, source: 'listar_filas', kind: 'latest_snapshot',
      consultedAt: new Date().toISOString(),
      note: 'Contadores da ultima coleta validada, sem historico horario.',
    }, { headers });
  } catch {
    return NextResponse.json({
      error: 'Nao foi possivel validar os dados atuais das filas.',
    }, { status: 503, headers });
  }
}
