import { isCivilDate, localToday } from './call-chart-data';

/**
 * Domain model for evolution charts. It does NOT read tables or authorize users.
 * Input entries must be individually verified queue visits from an authenticated
 * server-side source. listar_filas snapshots and aggregate CDR totals do not
 * satisfy that contract.
 */
export type EvolutionMetric = 'received' | 'answered' | 'abandoned';
export type EvolutionGrouping = 'day' | 'week' | 'month';
export type EvolutionPreset =
  | 'last7' | 'last30' | 'last90'
  | 'currentMonth' | 'previousMonth' | 'currentYear' | 'previousYear';

export type EvolutionPeriod =
  | { kind: 'fixed'; start: string; end: string }
  | { kind: 'dynamic'; preset: EvolutionPreset };

export type QueueSelection =
  | { mode: 'all' }
  | { mode: 'selected'; ids: string[] };

export type EvolutionConfig = {
  chart: 'line' | 'bar';
  period: EvolutionPeriod;
  grouping: EvolutionGrouping;
  metrics: EvolutionMetric[];
  queues: QueueSelection;
  presentation: 'consolidated' | 'byQueue';
  limit: 5 | 10 | 20 | 'all';
  sort: { field: 'name' | 'metric'; direction: 'asc' | 'desc' };
};

export type AuthorizedQueue = { id: string; name: string };
export type QueueVisit = {
  queueId: string;
  /** ISO 8601 timestamp with explicit UTC or numeric offset, for the entry time. */
  enteredAt: string;
  /** Outcome of THIS visit, not the final outcome of the whole call. */
  outcome: 'answered' | 'abandoned' | 'transferred' | 'other';
};

export type ResolvedEvolutionPeriod = {
  start: string;
  end: string;
  empty: boolean;
  partial: boolean;
};
export type EvolutionSeries = { id: string; label: string; values: number[] };
export type EvolutionResult = {
  state: 'ready' | 'empty';
  period: ResolvedEvolutionPeriod;
  buckets: string[];
  series: EvolutionSeries[];
  shownQueues: string[];
};

const METRICS: readonly EvolutionMetric[] = ['received', 'answered', 'abandoned'];
const PRESETS: readonly EvolutionPreset[] = [
  'last7', 'last30', 'last90', 'currentMonth', 'previousMonth', 'currentYear', 'previousYear',
];
const MAX_BUCKETS = 4000;
const TZ = 'America/Sao_Paulo';
const localFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});

function offset(date: string, delta: number): string {
  const value = new Date(date + 'T00:00:00Z');
  value.setUTCDate(value.getUTCDate() + delta);
  return value.toISOString().slice(0, 10);
}

function firstOfMonth(date: string): string { return date.slice(0, 7) + '-01'; }
function firstOfYear(date: string): string { return date.slice(0, 4) + '-01-01'; }

export function resolveEvolutionPeriod(period: EvolutionPeriod, now: Date = new Date()): ResolvedEvolutionPeriod {
  const today = localToday(now);
  if (period.kind === 'fixed') {
    if (!isCivilDate(period.start) || !isCivilDate(period.end) || period.end < period.start) {
      throw new Error('Intervalo fixo invalido.');
    }
    return { start: period.start, end: period.end, empty: false, partial: period.end >= today };
  }
  if (period.kind !== 'dynamic' || !PRESETS.includes(period.preset)) {
    throw new Error('Periodo dinamico invalido.');
  }
  const yesterday = offset(today, -1);
  let start: string;
  let end = yesterday;
  switch (period.preset) {
    case 'last7': start = offset(today, -7); break;
    case 'last30': start = offset(today, -30); break;
    case 'last90': start = offset(today, -90); break;
    case 'currentMonth': start = firstOfMonth(today); break;
    case 'previousMonth':
      end = offset(firstOfMonth(today), -1);
      start = firstOfMonth(end);
      break;
    case 'currentYear': start = firstOfYear(today); break;
    case 'previousYear':
      start = String(Number(today.slice(0, 4)) - 1).padStart(4, '0') + '-01-01';
      end = start.slice(0, 4) + '-12-31';
      break;
  }
  return { start, end, empty: start > end, partial: false };
}

function localDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(iso)) {
    throw new Error('Data de entrada na fila sem fuso valido.');
  }
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) throw new Error('Data de entrada na fila invalida.');
  const values = Object.fromEntries(localFormatter.formatToParts(date).map(p => [p.type, p.value]));
  return values.year + '-' + values.month + '-' + values.day;
}

function bucketFor(date: string, grouping: EvolutionGrouping): string {
  if (grouping === 'day') return date;
  if (grouping === 'month') return date.slice(0, 7);
  const timestamp = Date.parse(date + 'T00:00:00Z');
  const dayOfWeek = new Date(timestamp).getUTCDay();
  return offset(date, -(dayOfWeek + 6) % 7); // Monday of ISO calendar week
}

function bucketKeys(start: string, end: string, grouping: EvolutionGrouping): string[] {
  if (start > end) return [];
  const keys: string[] = [];
  const seen = new Set<string>();
  let cursor = start;
  while (cursor <= end) {
    const key = bucketFor(cursor, grouping);
    if (!seen.has(key)) {
      keys.push(key);
      seen.add(key);
      if (keys.length > MAX_BUCKETS) throw new Error('Intervalo grande demais para este agrupamento.');
    }
    if (grouping === 'day') cursor = offset(cursor, 1);
    else if (grouping === 'week') cursor = offset(cursor, 7);
    else {
      const [year, month] = cursor.slice(0, 7).split('-').map(Number);
      cursor = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
    }
  }
  // For a week beginning in the middle of the selected interval, also
  // enumerate the last partial week when the start was not a Monday.
  if (grouping === 'week' && keys.length) {
    const lastKey = bucketFor(end, grouping);
    if (!seen.has(lastKey)) {
      if (keys.length >= MAX_BUCKETS) throw new Error('Intervalo grande demais para este agrupamento.');
      keys.push(lastKey);
    }
  }
  return keys;
}

function assertConfig(config: EvolutionConfig): void {
  if (!['line', 'bar'].includes(config.chart)
    || !['day', 'week', 'month'].includes(config.grouping)
    || !['consolidated', 'byQueue'].includes(config.presentation)
    || ![5, 10, 20, 'all'].includes(config.limit)
    || !['name', 'metric'].includes(config.sort.field)
    || !['asc', 'desc'].includes(config.sort.direction)
    || !Array.isArray(config.metrics) || config.metrics.length < 1
    || config.metrics.length > 3 || new Set(config.metrics).size !== config.metrics.length
    || config.metrics.some(metric => !METRICS.includes(metric))
    || (config.presentation === 'byQueue' && config.metrics.length !== 1)
    || !config.queues || !['all', 'selected'].includes(config.queues.mode)) {
    throw new Error('Configuracao de evolucao invalida.');
  }
  if (config.queues.mode === 'selected'
    && (!Array.isArray(config.queues.ids) || !config.queues.ids.length
      || config.queues.ids.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_:-]{1,64}$/.test(id))
      || new Set(config.queues.ids).size !== config.queues.ids.length)) {
    throw new Error('Selecao de filas invalida.');
  }
}

/**
 * Pure calculation over verified queue visits.
 * Empty results are not zero series. Missing buckets in a non-empty result are zeros.
 * Filtering authorizations MUST also happen in the server query/RPC.
 */
export function buildEvolution(
  config: EvolutionConfig,
  authorizedQueues: readonly AuthorizedQueue[],
  visits: readonly QueueVisit[],
  now: Date = new Date(),
): EvolutionResult {
  assertConfig(config);
  const period = resolveEvolutionPeriod(config.period, now);
  if (!Array.isArray(authorizedQueues) || !Array.isArray(visits) || authorizedQueues.length > 200) {
    throw new Error('Conjunto de filas invalido.');
  }
  const authorized = new Map<string, AuthorizedQueue>();
  for (const queue of authorizedQueues) {
    if (!queue || typeof queue.id !== 'string' || !/^[A-Za-z0-9_:-]{1,64}$/.test(queue.id)
      || typeof queue.name !== 'string' || !queue.name.trim() || queue.name.length > 100
      || authorized.has(queue.id)) throw new Error('Catalogo de filas invalido.');
    authorized.set(queue.id, queue);
  }
  const selectedIds = config.queues.mode === 'all'
    ? new Set(authorized.keys())
    : new Set(config.queues.ids);
  for (const id of selectedIds) if (!authorized.has(id)) throw new Error('Fila nao autorizada.');
  if (period.empty || !selectedIds.size) {
    return { state: 'empty', period, buckets: [], series: [], shownQueues: [] };
  }
  const buckets = bucketKeys(period.start, period.end, config.grouping);
  const indexes = new Map(buckets.map((key, index) => [key, index]));
  const counters = new Map<string, Record<EvolutionMetric, number>[]>();
  for (const id of selectedIds) {
    counters.set(id, buckets.map(() => ({ received: 0, answered: 0, abandoned: 0 })));
  }
  let found = false;
  for (const visit of visits) {
    if (!visit || !authorized.has(visit.queueId)
      || !['answered', 'abandoned', 'transferred', 'other'].includes(visit.outcome)) {
      throw new Error('Ocorrencia de fila invalida ou nao autorizada.');
    }
    const date = localDate(visit.enteredAt);
    if (!selectedIds.has(visit.queueId) || date < period.start || date > period.end) continue;
    const index = indexes.get(bucketFor(date, config.grouping));
    if (index === undefined) throw new Error('Agrupamento de ocorrencia ausente.');
    const row = counters.get(visit.queueId)?.[index];
    if (!row) throw new Error('Fila sem agregacao.');
    row.received++;
    if (visit.outcome === 'answered') row.answered++;
    if (visit.outcome === 'abandoned') row.abandoned++;
    if (!Number.isSafeInteger(row.received)) throw new Error('Contagem fora do limite seguro.');
    found = true;
  }
  if (!found) return { state: 'empty', period, buckets: [], series: [], shownQueues: [] };
  const selectedQueues = [...selectedIds].map(id => authorized.get(id)!);
  const metric = config.metrics[0];
  selectedQueues.sort((a, b) => {
    const nameCompare = a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id);
    if (config.sort.field === 'name') return config.sort.direction === 'asc' ? nameCompare : -nameCompare;
    const total = (id: string) => counters.get(id)!.reduce((sum, row) => sum + row[metric], 0);
    const diff = total(a.id) - total(b.id);
    return diff ? (config.sort.direction === 'asc' ? diff : -diff) : nameCompare;
  });
  const shown = config.presentation === 'byQueue' && config.limit !== 'all'
    ? selectedQueues.slice(0, config.limit) : selectedQueues;
  const labels: Record<EvolutionMetric, string> = {
    received: 'Chamadas recebidas',
    answered: 'Chamadas atendidas',
    abandoned: 'Chamadas abandonadas',
  };
  const series: EvolutionSeries[] = config.presentation === 'byQueue'
    ? shown.map(queue => ({
      id: queue.id, label: queue.name, values: counters.get(queue.id)!.map(row => row[metric]),
    }))
    : config.metrics.map(key => ({
      id: key, label: labels[key],
      values: buckets.map((_, index) => selectedQueues.reduce((sum, queue) =>
        sum + counters.get(queue.id)![index][key], 0)),
    }));
  if (series.some(item => item.values.some(value => !Number.isSafeInteger(value)))) {
    throw new Error('Contagem fora do limite seguro.');
  }
  return { state: 'ready', period, buckets, series, shownQueues: shown.map(queue => queue.id) };
}
