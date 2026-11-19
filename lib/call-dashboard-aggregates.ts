import type { Bucket, Granularity, Summary } from './call-dashboard';
import { abandonmentRate, parseAggregateRows, sumCounts, type AggregateRow } from './call-chart-data';

export type RpcRow = AggregateRow;
export type DateRange = { start: string; end: string; granularity: Granularity };
const addDays = (day: string, count: number) => {
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
};
const empty = (key: string, label: string): Bucket =>
  ({ key, label, answered: 0, unanswered: 0, abandoned: 0, other: 0, total: 0 });

export function buildAggregateDashboard(rows: RpcRow[], range: DateRange) {
  const parsed = parseAggregateRows({ rows }, range);
  const counts = sumCounts(parsed);
  const buckets: Bucket[] = [];
  if (range.start === range.end) {
    for (let hour = 0; hour < 24; hour += 2) {
      const h = String(hour).padStart(2, '0');
      buckets.push(empty(`${range.start}T${h}`, `${h}h\u2013${String(hour + 2).padStart(2, '0')}h`));
    }
  } else if (range.granularity === 'month') {
    for (let month = range.start.slice(0, 7); month <= range.end.slice(0, 7);
      month = addDays(month + '-01', 32).slice(0, 7)) {
      buckets.push(empty(month, month.slice(5) + '/' + month.slice(0, 4)));
    }
  } else {
    for (let day = range.start; day <= range.end; day = addDays(day, 1)) {
      buckets.push(empty(day, day.slice(8) + '/' + day.slice(5, 7)));
    }
  }
  const lookup = new Map(buckets.map(bucket => [bucket.key, bucket]));
  for (const row of parsed) {
    const day = row.periodo_inicio.slice(0, 10);
    const key = range.start === range.end ? row.periodo_inicio.slice(0, 13) :
      range.granularity === 'month' ? day.slice(0, 7) : day;
    const bucket = lookup.get(key);
    if (!bucket) throw new Error('Faixa nao reconhecida.');
    bucket.total += row.total;
    bucket.answered += row.atendidas;
    bucket.unanswered += row.nao_atendidas;
    bucket.abandoned += row.abandonadas;
    bucket.other += row.outras;
  }
  const summary: Summary & { abandonRate: number | null } = {
    total: counts.total, answered: counts.atendidas, unanswered: counts.nao_atendidas,
    abandoned: counts.abandonadas, other: counts.outras,
    answerRate: counts.total ? counts.atendidas / counts.total * 100 : null,
    abandonRate: abandonmentRate(counts.abandonadas, counts.total),
  };
  return { buckets, summary, range };
}
