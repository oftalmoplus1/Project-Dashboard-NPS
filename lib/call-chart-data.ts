/** Validated CDR aggregates. Timestamps are local SQL timestamps, not UTC. */
export type CallCounts = {
  total: number;
  atendidas: number;
  nao_atendidas: number;
  abandonadas: number;
  outras: number;
};
export type AggregateRow = CallCounts & { periodo_inicio: string };
export type HourRow = CallCounts & { hora: number };
export type ChartMetric = 'total' | 'atendidas' | 'abandonadas';
export type DateRange = { start: string; end: string };
export type MonthRow = CallCounts & {
  month: number;
  status: 'recorded' | 'partial' | 'no-records' | 'future';
};
const fields = ['total', 'atendidas', 'nao_atendidas', 'abandonadas', 'outras'] as const;
export const zeroCounts = (): CallCounts => ({ total: 0, atendidas: 0, nao_atendidas: 0, abandonadas: 0, outras: 0 });

export function isCivilDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
export function validateRange(range: DateRange): void {
  if (!isCivilDate(range.start) || !isCivilDate(range.end) || range.end < range.start ||
      (Date.parse(range.end) - Date.parse(range.start)) / 86400000 > 365) {
    throw new Error('Periodo invalido.');
  }
}
function counts(value: unknown): CallCounts {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Contagens invalidas.');
  const row = value as Record<string, unknown>;
  for (const field of fields) {
    if (typeof row[field] !== 'number' || !Number.isSafeInteger(row[field]) || row[field] < 0) {
      throw new Error('Contagens invalidas.');
    }
  }
  const result = Object.fromEntries(fields.map(field => [field, row[field]])) as CallCounts;
  const sum = result.atendidas + result.nao_atendidas + result.abandonadas + result.outras;
  if (!Number.isSafeInteger(sum) || result.total !== sum) throw new Error('Contagens inconsistentes.');
  return result;
}
function payloadRows(payload: unknown): unknown[] {
  if (!payload || typeof payload !== 'object' || !('rows' in payload) || !Array.isArray(payload.rows)) {
    throw new Error('Resposta de chamadas invalida.');
  }
  return payload.rows;
}
export function parseAggregateRows(payload: unknown, range: DateRange): AggregateRow[] {
  validateRange(range);
  const seen = new Set<string>();
  return payloadRows(payload).map(value => {
    const c = counts(value);
    const stamp = (value as Record<string, unknown>).periodo_inicio;
    // Contract: timestamp WITHOUT time zone, in America/Sao_Paulo, every two hours.
    const match = typeof stamp === 'string' && /^(\d{4}-\d{2}-\d{2})T(\d{2}):00:00(?:\.0+)?$/.exec(stamp);
    if (!match || !isCivilDate(match[1]) || match[1] < range.start || match[1] > range.end ||
        Number(match[2]) > 23 || Number(match[2]) % 2 !== 0) throw new Error('Intervalo agregado invalido.');
    const key = match[1] + 'T' + match[2];
    if (seen.has(key)) throw new Error('Intervalo agregado duplicado.');
    seen.add(key);
    return { ...c, periodo_inicio: stamp as string };
  });
}
export function parseHourlyRows(payload: unknown): HourRow[] {
  const seen = new Set<number>();
  const rows = payloadRows(payload).map(value => {
    const c = counts(value);
    const hour = (value as Record<string, unknown>).hora;
    if (typeof hour !== 'number' || !Number.isInteger(hour) || hour < 0 || hour > 23 || seen.has(hour)) {
      throw new Error('Faixa horaria invalida ou duplicada.');
    }
    seen.add(hour);
    return { ...c, hora: hour };
  });
  // The installed RPC explicitly returns generate_series(0,23). Missing rows are NOT zeros.
  if (rows.length !== 24) throw new Error('Resposta horaria incompleta: esperadas 24 horas.');
  return rows.sort((a, b) => a.hora - b.hora);
}
export function sumCounts(rows: readonly CallCounts[]): CallCounts {
  const total = zeroCounts();
  for (const raw of rows) {
    const row = counts(raw);
    for (const field of fields) {
      total[field] += row[field];
      if (!Number.isSafeInteger(total[field])) throw new Error('Contagem acima do limite seguro.');
    }
  }
  return total;
}
export function abandonmentRate(abandoned: number, received: number): number | null {
  if (![abandoned, received].every(v => Number.isSafeInteger(v) && v >= 0) || abandoned > received) {
    throw new Error('Base de abandono invalida.');
  }
  return received === 0 ? null : abandoned / received * 100;
}
export function localToday(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
export function annualRanges(year: number, asOf: string): DateRange[] {
  if (!Number.isInteger(year) || year < 1900 || year > 9999 || !isCivilDate(asOf)) throw new Error('Ano invalido.');
  const last = `${year}-12-31` < asOf ? `${year}-12-31` : asOf;
  const ranges: DateRange[] = [];
  for (let month = 1; month <= 12; month += 2) {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    if (start > last) break;
    const candidate = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
    ranges.push({ start, end: candidate < last ? candidate : last });
  }
  return ranges;
}
export function monthlyData(rows: readonly AggregateRow[], year: number, asOf: string) {
  annualRanges(year, asOf);
  const parsed = parseAggregateRows({ rows }, { start: `${year}-01-01`, end: `${year}-12-31` });
  const buckets: MonthRow[] = Array.from({ length: 12 }, (_, month) => ({
    ...zeroCounts(), month, status: `${year}-${String(month + 1).padStart(2, '0')}` > asOf.slice(0, 7) ? 'future' : 'no-records',
  }));
  for (const row of parsed) {
    if (row.periodo_inicio.slice(0, 10) > asOf) throw new Error('Registro posterior ao corte da consulta.');
    const bucket = buckets[Number(row.periodo_inicio.slice(5, 7)) - 1];
    Object.assign(bucket, sumCounts([bucket, row]));
    bucket.status = row.periodo_inicio.slice(0, 7) === asOf.slice(0, 7) ? 'partial' : 'recorded';
  }
  // Calendar-closed months with records; this is NOT proof of ingestion completeness.
  const included = buckets.filter(bucket => bucket.status === 'recorded');
  const totals = sumCounts(included);
  const averages: Record<ChartMetric, number | null> = {
    total: included.length ? totals.total / included.length : null,
    atendidas: included.length ? totals.atendidas / included.length : null,
    abandonadas: included.length ? totals.abandonadas / included.length : null,
  };
  return { buckets, averages, meanMonthCount: included.length };
}
