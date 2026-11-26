import { isCivilDate } from './call-chart-data';
import {
 resolveEvolutionPeriod, type EvolutionConfig, type EvolutionGrouping,
 type EvolutionMetric, type EvolutionResult, type AuthorizedQueue,
} from './editor-evolution';

/**
 * Validation and projection of aggregates from a VERIFIED, authorized,
 * per-queue-entry RPC. No raw call or telephone records reach the browser.
 * This module never treats listar_filas snapshots as event history.
 */
export type EvolutionAggregateRow = {
 queueId: string;
 bucket: string; // ISO local civil date; month uses YYYY-MM-01, week is Monday
 received: number;
 answered: number;
 abandoned: number;
};

const metrics = ['received', 'answered', 'abandoned'] as const;
const presets = ['last7', 'last30', 'last90', 'currentMonth',
 'previousMonth', 'currentYear', 'previousYear'] as const;
const maxQueueCount = 200;
const maxAggregateRows = 75000;
const dayMs = 86400000;

function object(value: unknown): value is Record<string, unknown> {
 return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function keys(value: Record<string, unknown>, required: string[]): boolean {
 return Object.keys(value).sort().join('|') === required.slice().sort().join('|');
}

function validId(value: unknown): value is string {
 return typeof value === 'string' && /^[a-zA-Z0-9_:-]{1,64}$/.test(value);
}

function validNonnegativeInteger(value: unknown): value is number {
 return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function offset(day: string, amount: number): string {
 const utc = new Date(day + 'T00:00:00Z');
 utc.setUTCDate(utc.getUTCDate() + amount);
 return utc.toISOString().slice(0, 10);
}

function bucketOf(date: string, grouping: EvolutionGrouping): string {
 if (grouping === 'day') return date;
 if (grouping === 'month') return date.slice(0, 7) + '-01';
 const weekday = new Date(date + 'T00:00:00Z').getUTCDay();
 return offset(date, -((weekday + 6) % 7));
}

function nextBucket(bucket: string, grouping: EvolutionGrouping): string {
 if (grouping === 'day') return offset(bucket, 1);
 if (grouping === 'week') return offset(bucket, 7);
 const year = Number(bucket.slice(0, 4));
 const month = Number(bucket.slice(5, 7));
 return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}

function bucketsFor(start: string, end: string, grouping: EvolutionGrouping): string[] {
 const buckets: string[] = [];
 if (start > end) return buckets;
 let day = bucketOf(start, grouping);
 const last = bucketOf(end, grouping);
 while (day <= last) {
  if (buckets.length >= 366) throw new Error('Agrupamento excede o limite.');
  buckets.push(day);
  day = nextBucket(day, grouping);
 }
 return buckets;
}

/** Exact whitelist: never accept table names, SQL, expressions or extra fields. */
export function parseEvolutionConfig(input: unknown, now: Date = new Date()): EvolutionConfig {
 if (!object(input) || !keys(input, ['chart', 'period', 'grouping', 'metrics',
  'queues', 'presentation', 'limit', 'sort'])) throw new Error('Configuração inválida.');
 const { chart, period, grouping, metrics: selected, queues, presentation, limit, sort } = input;
 if (!['line', 'bar'].includes(String(chart))
  || !['day', 'week', 'month'].includes(String(grouping))
  || !['consolidated', 'byQueue'].includes(String(presentation))
  || ![5, 10, 20, 'all'].includes(limit as string | number)
  || !Array.isArray(selected) || selected.length < 1 || selected.length > 3
  || selected.some(value => !metrics.includes(value))
  || new Set(selected).size !== selected.length
  || (presentation === 'byQueue' && selected.length !== 1)
  || !object(sort) || !keys(sort, ['field', 'direction'])
  || !['name', 'metric'].includes(String(sort.field))
  || !['asc', 'desc'].includes(String(sort.direction))) {
  throw new Error('Configuração inválida.');
 }
 if (!object(queues) || !['all', 'selected'].includes(String(queues.mode))) {
  throw new Error('Filtro de filas inválido.');
 }
 if (queues.mode === 'all') {
  if (!keys(queues, ['mode'])) throw new Error('Filtro de filas inválido.');
 } else {
  if (!keys(queues, ['mode', 'ids']) || !Array.isArray(queues.ids)
   || queues.ids.length === 0 || queues.ids.length > maxQueueCount
   || queues.ids.some(id => !validId(id))
   || new Set(queues.ids).size !== queues.ids.length) {
   throw new Error('Filtro de filas inválido.');
  }
 }
 if (!object(period) || !['fixed', 'dynamic'].includes(String(period.kind))) {
  throw new Error('Período inválido.');
 }
 if (period.kind === 'fixed') {
  if (!keys(period, ['kind', 'start', 'end'])
   || !isCivilDate(period.start) || !isCivilDate(period.end)) {
   throw new Error('Período inválido.');
  }
 } else if (!keys(period, ['kind', 'preset']) || !presets.includes(period.preset as typeof presets[number])) {
  throw new Error('Período inválido.');
 }
 const config = input as EvolutionConfig;
 const resolved = resolveEvolutionPeriod(config.period, now);
 if ((Date.parse(resolved.end) - Date.parse(resolved.start)) / dayMs > 365) {
  throw new Error('Período maior que 366 dias.');
 }
 return config;
}

export type VerifiedEvolutionPayload = {
 queues: AuthorizedQueue[];
 rows: EvolutionAggregateRow[];
};

/**
 * RPC contract is aggregated-only and contains no phone number, agent or call
 * identifier. The RPC must enforce queue authorization AND draft ownership.
 */
export function parseVerifiedEvolutionPayload(value: unknown): VerifiedEvolutionPayload {
 if (!object(value) || !keys(value, ['queues', 'rows'])
  || !Array.isArray(value.queues) || value.queues.length > maxQueueCount
  || !Array.isArray(value.rows) || value.rows.length > maxAggregateRows) {
  throw new Error('Resposta agregada inválida.');
 }
 const seen = new Set<string>();
 const queues: AuthorizedQueue[] = [];
 for (const entry of value.queues) {
  if (!object(entry) || !keys(entry, ['id', 'name']) || !validId(entry.id)
   || typeof entry.name !== 'string' || !entry.name.trim()
   || entry.name.length > 100 || seen.has(entry.id)) {
   throw new Error('Catálogo de filas inválido.');
  }
  seen.add(entry.id);
  queues.push({ id: entry.id, name: entry.name });
 }
 const rowKeys = new Set<string>();
 const rows: EvolutionAggregateRow[] = [];
 for (const entry of value.rows) {
  if (!object(entry) || !keys(entry, ['queueId', 'bucket', 'received', 'answered', 'abandoned'])
   || !validId(entry.queueId) || !seen.has(entry.queueId)
   || !isCivilDate(entry.bucket)
   || !validNonnegativeInteger(entry.received)
   || !validNonnegativeInteger(entry.answered)
   || !validNonnegativeInteger(entry.abandoned)
   || entry.answered + entry.abandoned > entry.received
   || rowKeys.has(entry.queueId + ':' + entry.bucket)) {
   throw new Error('Agregação inválida ou duplicada.');
  }
  rowKeys.add(entry.queueId + ':' + entry.bucket);
  rows.push({
   queueId: entry.queueId, bucket: entry.bucket, received: entry.received,
   answered: entry.answered, abandoned: entry.abandoned,
  });
 }
 return { queues, rows };
}

/**
 * Validates all buckets and only fills missing buckets with zero if at least
 * one visit was observed. Missing source != empty result.
 */
export function projectVerifiedEvolution(
 input: unknown, payload: unknown, now: Date = new Date(),
): EvolutionResult {
 const config = parseEvolutionConfig(input, now);
 const { queues, rows } = parseVerifiedEvolutionPayload(payload);
 const period = resolveEvolutionPeriod(config.period, now);
 const empty: EvolutionResult = { state: 'empty', period, buckets: [], series: [], shownQueues: [] };
 const authorized = new Map(queues.map(queue => [queue.id, queue]));
 const selected = config.queues.mode === 'all' ? queues :
  config.queues.ids.map(id => {
   const queue = authorized.get(id);
   if (!queue) throw new Error('Fila ausente do conjunto autorizado.');
   return queue;
  });
 if (period.empty || selected.length === 0) {
  if (rows.length) throw new Error('Dados presentes em período vazio.');
  return empty;
 }
 const selectedIds = new Set(selected.map(queue => queue.id));
 const buckets = bucketsFor(period.start, period.end, config.grouping);
 const index = new Map(buckets.map((bucket, i) => [bucket, i]));
 const data = new Map<string, Record<EvolutionMetric, number>[]>();
 for (const queue of selected) {
  data.set(queue.id, buckets.map(() => ({ received: 0, answered: 0, abandoned: 0 })));
 }
 let hasMovement = false;
 for (const row of rows) {
  if (!selectedIds.has(row.queueId) || row.bucket !== bucketOf(row.bucket, config.grouping)) {
   throw new Error('Fila ou agrupamento inesperado.');
  }
  const i = index.get(row.bucket);
  if (i === undefined) throw new Error('Período agregado fora do intervalo.');
  const target = data.get(row.queueId)![i];
  for (const metric of metrics) target[metric] = row[metric];
  if (row.received > 0) hasMovement = true;
 }
 if (!hasMovement) return empty;
 const mainMetric = config.metrics[0];
 selected.sort((a, b) => {
  const byName = a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id);
  if (config.sort.field === 'name') return config.sort.direction === 'asc' ? byName : -byName;
  const total = (id: string) => data.get(id)!.reduce((sum, row) => sum + row[mainMetric], 0);
  const difference = total(a.id) - total(b.id);
  return difference !== 0 ? (config.sort.direction === 'asc' ? difference : -difference) : byName;
 });
 const visible = config.presentation === 'byQueue' && config.limit !== 'all'
  ? selected.slice(0, config.limit) : selected;
 const labels: Record<EvolutionMetric, string> = {
  received: 'Chamadas recebidas', answered: 'Chamadas atendidas',
  abandoned: 'Chamadas abandonadas',
 };
 const series = config.presentation === 'byQueue'
  ? visible.map(queue => ({
   id: queue.id, label: queue.name, values: data.get(queue.id)!.map(row => row[mainMetric]),
  }))
  : config.metrics.map(metric => ({
   id: metric, label: labels[metric],
   values: buckets.map((_, i) => selected.reduce((sum, queue) => sum + data.get(queue.id)![i][metric], 0)),
  }));
 if (series.some(s => s.values.some(v => !Number.isSafeInteger(v)))) {
  throw new Error('Contagem excedeu o limite seguro.');
 }
 return { state: 'ready', period, buckets, series, shownQueues: visible.map(q => q.id) };
}
