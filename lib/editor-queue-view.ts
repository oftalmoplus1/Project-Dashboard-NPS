import type { QueueSnapshot } from './ligsim-queue-snapshot';

/**
 * Pure presentation model for an authorized latest queue snapshot.
 * This module does not query the database, grant permissions or create history.
 */
export type QueueMetric = 'received' | 'answered' | 'abandoned' | 'answerRate';
export type QueueSort = 'name' | QueueMetric;
export type QueueViewConfig = {
  selection: { mode: 'all' } | { mode: 'selected'; ids: number[] };
  metric: QueueMetric;
  sortBy: QueueSort;
  direction: 'asc' | 'desc';
  limit: 5 | 10 | 20 | 'all';
  includeInactive: boolean;
  display: 'table' | 'bar';
  orientation: 'vertical' | 'horizontal';
};
export type QueueViewRow = {
  id: number;
  name: string;
  received: number;
  answered: number;
  abandoned: number;
  answerRate: number | null;
  value: number | null;
};
export const DEFAULT_QUEUE_VIEW: QueueViewConfig = {
  selection: { mode: 'all' },
  metric: 'received',
  sortBy: 'received',
  direction: 'desc',
  limit: 10,
  includeInactive: true,
  display: 'table',
  orientation: 'horizontal',
};

function safeCounter(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function assertConfig(config: QueueViewConfig): void {
  if (!['received', 'answered', 'abandoned', 'answerRate'].includes(config.metric) ||
      !['name', 'received', 'answered', 'abandoned', 'answerRate'].includes(config.sortBy) ||
      !['asc', 'desc'].includes(config.direction) ||
      ![5, 10, 20, 'all'].includes(config.limit) ||
      !['table', 'bar'].includes(config.display) ||
      !['vertical', 'horizontal'].includes(config.orientation) ||
      typeof config.includeInactive !== 'boolean' ||
      !config.selection || !['all', 'selected'].includes(config.selection.mode)) {
    throw new Error('Configuracao de filas invalida.');
  }
  if (config.selection.mode === 'selected' &&
      (!Array.isArray(config.selection.ids) ||
       config.selection.ids.length > 200 ||
       config.selection.ids.some(id => !Number.isSafeInteger(id) || id < 1) ||
       new Set(config.selection.ids).size !== config.selection.ids.length)) {
    throw new Error('Identificadores de filas invalidos.');
  }
}

/**
 * Only pass rows that the server has already authorized for this user.
 * 'all' includes new authorized queues automatically. A selected queue that
 * is no longer authorized is never inserted artificially.
 * A zero-volume queue is included when present in the authorized snapshot.
 */
export function buildQueueView(
  authorizedRows: readonly QueueSnapshot[],
  config: QueueViewConfig,
): QueueViewRow[] {
  assertConfig(config);
  const ids = new Set<number>();
  for (const row of authorizedRows) {
    if (!Number.isSafeInteger(row.id) || row.id < 1 || ids.has(row.id) ||
        typeof row.name !== 'string' || !row.name.trim() || row.name.length > 120 ||
        !safeCounter(row.received) || !safeCounter(row.answered) ||
        !safeCounter(row.abandoned) || row.answered + row.abandoned > row.received) {
      throw new Error('Snapshot autorizado invalido.');
    }
    ids.add(row.id);
  }
  const chosen = config.selection.mode === 'selected' ? new Set(config.selection.ids) : null;
  const rows = authorizedRows.filter(row =>
    (!chosen || chosen.has(row.id)) &&
    (config.includeInactive || row.received > 0 || row.answered > 0 || row.abandoned > 0)
  ).map(row => {
    const answerRate = row.received > 0 ? row.answered / row.received * 100 : null;
    const metric = config.metric;
    return {
      id: row.id, name: row.name,
      received: row.received, answered: row.answered, abandoned: row.abandoned,
      answerRate,
      value: metric === 'answerRate' ? answerRate : row[metric],
    };
  });
  rows.sort((a, b) => {
    const key = config.sortBy;
    let comparison = key === 'name'
      ? a.name.localeCompare(b.name, 'pt-BR')
      : (a[key] === null && b[key] === null ? 0 :
          a[key] === null ? 1 : b[key] === null ? -1 :
          (a[key] as number) - (b[key] as number));
    // Unknown rates stay last in both directions.
    if (key !== 'name' && (a[key] === null || b[key] === null)) {
      return comparison || a.name.localeCompare(b.name, 'pt-BR') || a.id - b.id;
    }
    if (config.direction === 'desc') comparison *= -1;
    return comparison || a.name.localeCompare(b.name, 'pt-BR') || a.id - b.id;
  });
  return config.limit === 'all' ? rows : rows.slice(0, config.limit);
}
