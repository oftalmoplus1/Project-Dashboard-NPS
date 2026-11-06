import type { Bucket, Granularity, Summary } from './call-dashboard';

export type RpcRow = {
  periodo_inicio: string;
  total: number;
  atendidas: number;
  nao_atendidas: number;
  abandonadas: number;
  outras: number;
};

export type DateRange = { start: string; end: string; granularity: Granularity };

const addDays = (day: string, count: number) => {
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
};
const empty = (key: string, label: string): Bucket =>
  ({ key, label, answered: 0, unanswered: 0, abandoned: 0, other: 0, total: 0 });

export function buildAggregateDashboard(rows: RpcRow[], range: DateRange) {
  const buckets: Bucket[] = [];
  if (range.start === range.end) {
    for (let hour = 0; hour < 24; hour += 2) {
      const h = String(hour).padStart(2, '0');
      buckets.push(empty(`${range.start}T${h}`, `${h}h–${String(hour + 2).padStart(2, '0')}h`));
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
  const visited = new Set<string>();
  for (const row of rows) {
    const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):/.exec(row.periodo_inicio);
    if (!match) throw new Error('Formato de período inválido.');
    const day = match[1];
    if (day < range.start || day > range.end) throw new Error('Período fora do filtro.');
    const hour = Number(match[2]);
    if (hour > 23 || (range.start === range.end && hour % 2 !== 0)) throw new Error('Faixa horária inválida.');
    const key = range.start === range.end ? `${day}T${match[2]}` :
      range.granularity === 'month' ? day.slice(0, 7) : day;
    const unique = `${day}T${match[2]}`;
    if (visited.has(unique)) throw new Error('Intervalo duplicado.');
    visited.add(unique);
    if (row.total !== row.atendidas + row.nao_atendidas + row.abandonadas + row.outras)
      throw new Error('Contagens inconsistentes.');
    const bucket = lookup.get(key);
    if (!bucket) throw new Error('Faixa não reconhecida.');
    bucket.total += row.total;
    bucket.answered += row.atendidas;
    bucket.unanswered += row.nao_atendidas;
    bucket.abandoned += row.abandonadas;
    bucket.other += row.outras;
  }
  const summary = buckets.reduce<Summary>((s, b) => ({
    total: s.total + b.total, answered: s.answered + b.answered,
    unanswered: s.unanswered + b.unanswered, abandoned: s.abandoned + b.abandoned,
    other: s.other + b.other, answerRate: null,
  }), { total: 0, answered: 0, unanswered: 0, abandoned: 0, other: 0, answerRate: null });
  summary.answerRate = summary.total ? summary.answered / summary.total * 100 : null;
  return { buckets, summary, range };
}
