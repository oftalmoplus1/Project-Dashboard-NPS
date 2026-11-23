import { annualRanges, isCivilDate, parseAggregateRows, sumCounts, type AggregateRow, type CallCounts, type ChartMetric } from './call-chart-data';

export function comparableCutoff(year: number, asOf: string): string {
  if (!isCivilDate(asOf) || !Number.isInteger(year) || year < 1900 || year > Number(asOf.slice(0, 4))) {
    throw new Error('Ano de comparacao invalido.');
  }
  if (year < Number(asOf.slice(0, 4))) return year + '-12-31';
  return asOf;
}

export function comparisonWindows(year: number, asOf: string) {
  const currentEnd = comparableCutoff(year, asOf);
  const previousYear = year - 1;
  if (previousYear < 1900) throw new Error('Ano anterior indisponivel.');
  const previousDate = year < Number(asOf.slice(0, 4)) ? previousYear + '-12-31' :
    previousYear + '-' + asOf.slice(5);
  const month = Number(previousDate.slice(5, 7));
  const lastDay = new Date(Date.UTC(previousYear, month, 0)).getUTCDate();
  const previousEnd = previousDate.slice(0, 8) + String(Math.min(Number(previousDate.slice(8)), lastDay)).padStart(2, '0');
  return {
    current: { year, end: currentEnd, ranges: annualRanges(year, currentEnd) },
    previous: { year: previousYear, end: previousEnd, ranges: annualRanges(previousYear, previousEnd) },
    partial: year === Number(asOf.slice(0, 4)),
  };
}

export function annualMetrics(rows: unknown, year: number, end: string): CallCounts {
  if (!isCivilDate(end) || end.slice(0, 4) !== String(year)) throw new Error('Corte anual invalido.');
  const parsed = parseAggregateRows(rows, { start: year + '-01-01', end });
  return sumCounts(parsed);
}

export function percentageVariation(current: number, previous: number): number | null {
  if (![current, previous].every(v => Number.isSafeInteger(v) && v >= 0)) throw new Error('Variacao invalida.');
  return previous === 0 ? null : (current - previous) * 100 / previous;
}

export function annualComparison(current: CallCounts, previous: CallCounts) {
  const metrics: ChartMetric[] = ['total', 'atendidas', 'abandonadas'];
  return metrics.map(key => ({
    key,
    current: current[key],
    previous: previous[key],
    variation: percentageVariation(current[key], previous[key]),
    mean: (current[key] + previous[key]) / 2,
  }));
}

/**
 * Media aritmetica dos totais anuais efetivamente observados.
 * Com apenas um ano, retorna o proprio valor como referencia descritiva;
 * nao representa uma media de comparacao entre dois anos.
 */
export function availableAnnualMean(
  current: number, previous: number, hasCurrent: boolean, hasPrevious: boolean,
): number | null {
  if (![current, previous].every(value => Number.isSafeInteger(value) && value >= 0)) {
    throw new Error('Volume anual invalido.');
  }
  const count = Number(hasCurrent) + Number(hasPrevious);
  if (!count) return null;
  return ((hasCurrent ? current : 0) + (hasPrevious ? previous : 0)) / count;
}

export type ExtensionCount = { extension: string; answered: number };
export function parseExtensionResponse(payload: unknown): ExtensionCount[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Resposta de ramais invalida.');
  const envelope = payload as Record<string, unknown>;
  const inner = envelope.data;
  if (!inner || typeof inner !== 'object' || Array.isArray(inner)) throw new Error('Dados de ramais ausentes.');
  const list = (inner as Record<string, unknown>).data;
  if (!Array.isArray(list) || list.length > 500) throw new Error('Quantidade de ramais invalida.');
  const seen = new Set<string>();
  const out = list.map((raw): ExtensionCount => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Ramal invalido.');
    const row = raw as Record<string, unknown>;
    const label = row.answered;
    const volume = row.total;
    if (typeof label !== 'string' || !/^[A-Za-z0-9_.+@:-]{1,40}$/.test(label) ||
        seen.has(label) || typeof volume !== 'number' || !Number.isSafeInteger(volume) || volume < 0) {
      throw new Error('Identificador ou quantidade de ramal invalido.');
    }
    seen.add(label);
    return { extension: label, answered: volume };
  });
  return out.sort((a, b) => b.answered - a.answered || a.extension.localeCompare(b.extension));
}

/** Validate the sanitized response returned by our own authenticated route. */
export function parsePublicExtensionRows(payload: unknown): ExtensionCount[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Resposta interna de ramais invalida.');
  const rows = (payload as Record<string, unknown>).rows;
  if (!Array.isArray(rows)) throw new Error('Lista de ramais ausente.');
  const mapped = rows.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Ramal invalido.');
    const row = raw as Record<string, unknown>;
    return { answered: row.extension, total: row.answered };
  });
  return parseExtensionResponse({ data: { data: mapped } });
}
