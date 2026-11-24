import 'server-only';

import { getSupabaseServerConfig } from './supabase-config';
import { parseQueueSnapshot } from '@/lib/ligsim-queue-snapshot';

const MAX_STALENESS_MS = 3 * 60 * 60 * 1000;
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;
const BATCH_WINDOW_MS = 5 * 60 * 1000;

/** Denials from the already restricted RPC must not become ordinary 503s. */
export class QueueSnapshotDeniedError extends Error {
 constructor() {
  super('Acesso a filas negado pelo Supabase.');
 }
}

export type ValidatedQueueSnapshot = {
 rows: ReturnType<typeof parseQueueSnapshot>['rows'];
 summary: ReturnType<typeof parseQueueSnapshot>['summary'];
 sourceUpdatedAt: string;
};

/**
 * Shared validation contract for both the legacy Call Center and admin preview.
 * This is a mutable batch of filas, NEVER a time series or a daily CDR total.
 */
export function validateQueueBatch(payload: unknown): ValidatedQueueSnapshot {
 if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
  throw new Error('Resposta de filas invalida');
 }
 const data = payload as Record<string, unknown>;
 if (!Array.isArray(data.rows) || data.snapshotKind !== 'latest_successful_batch'
   || typeof data.sourceUpdatedAt !== 'string') {
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
  if (!Number.isFinite(updated) || updated > latest || latest - updated > BATCH_WINDOW_MS) {
   throw new Error('Fila fora da ultima coleta');
  }
 }
 const parsed = parseQueueSnapshot(data.rows);
 return { ...parsed, sourceUpdatedAt: new Date(latest).toISOString() };
}

/**
 * Uses the same admin-restricted, fixed RPC as /api/chamadas/filas.
 * The caller MUST authenticate/authorize before invoking this function.
 * No unrestricted SELECT, service_role, raw SQL or user-selected source.
 */
export async function fetchValidatedQueueSnapshot(token: string): Promise<ValidatedQueueSnapshot> {
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
  throw new QueueSnapshotDeniedError();
 }
 if (!upstream.ok) throw new Error('Fonte de filas indisponivel ou ainda nao configurada.');
 const payload: unknown = await upstream.json();
 return validateQueueBatch(payload);
}
