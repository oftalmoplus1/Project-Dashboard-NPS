import type { QueueSnapshot } from './ligsim-queue-snapshot';

/**
 * Presentation of the latest validated listar_filas snapshot.
 * Never converts updated_at into a call timestamp or invents history.
 */
export type SnapshotMetric = 'received' | 'answered' | 'abandoned';
export type SnapshotLimit = 5 | 10 | 20 | 'all';
export type SnapshotQueueRow = Pick<QueueSnapshot, 'id'|'name'|'received'|'answered'|'abandoned'> & {
 answerRate: number | null;
};

function safeSum(a: number, b: number): number {
 const total = a + b;
 if (!Number.isSafeInteger(total)) throw new Error('Soma de filas fora do limite.');
 return total;
}

export function buildEditorSnapshotView(
 rows: readonly QueueSnapshot[],
 limit: SnapshotLimit = 10,
): {
 rows: SnapshotQueueRow[];
 totalQueues: number;
 truncated: boolean;
 totals: { received: number; answered: number; abandoned: number; answerRate: number | null };
} {
 if (!Array.isArray(rows) || rows.length < 1 || rows.length > 200
   || ![5,10,20,'all'].includes(limit)) throw new Error('Snapshot inválido ou indisponível.');
 const seen = new Set<number>();
 const sorted = rows.map((row): SnapshotQueueRow => {
  if (!row || !Number.isSafeInteger(row.id) || row.id < 1 || seen.has(row.id)
   || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 120
   || ![row.received,row.answered,row.abandoned].every(value =>
    Number.isSafeInteger(value) && value >= 0)
   || row.answered + row.abandoned > row.received) {
   throw new Error('Fila ou contadores inválidos.');
  }
  seen.add(row.id);
  return {
   id: row.id, name: row.name, received: row.received,
   answered: row.answered, abandoned: row.abandoned,
   answerRate: row.received === 0 ? null : row.answered / row.received * 100,
  };
 });
 sorted.sort((a,b) => a.name.localeCompare(b.name,'pt-BR') || a.id - b.id);
 const totals = sorted.reduce((sum,row)=>({
  received: safeSum(sum.received,row.received),
  answered: safeSum(sum.answered,row.answered),
  abandoned: safeSum(sum.abandoned,row.abandoned),
 }), {received:0,answered:0,abandoned:0});
 return {
  rows: limit === 'all' ? sorted : sorted.slice(0,limit),
  totalQueues: sorted.length,
  truncated: limit !== 'all' && sorted.length > limit,
  totals: {
   ...totals, answerRate: totals.received === 0 ? null : totals.answered / totals.received * 100,
  },
 };
}

export function editorMetricLabel(metric: SnapshotMetric): string {
 switch(metric) {
  case 'received': return 'Recebidas';
  case 'answered': return 'Atendidas';
  case 'abandoned': return 'Abandonadas';
 }
}

export const SNAPSHOT_METRICS: readonly SnapshotMetric[] = ['received','answered','abandoned'];
