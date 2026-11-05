export type CallDisposition = 'ANSWERED' | 'NO ANSWER' | 'ABANDON' | 'OTHER';
export type CallRecord = { id: number; initTime: string; direction: 'Recebida' | 'Efetuada' | 'Entre ramais'; disposition: CallDisposition };
export type Period = 'today' | 'yesterday' | 'last7' | 'month' | 'custom';
export type Granularity = 'hour' | 'day' | 'month';
export type Bucket = { key: string; label: string; answered: number; unanswered: number; abandoned: number; other: number; total: number };
export type Summary = { answered: number; unanswered: number; abandoned: number; other: number; total: number; answerRate: number | null };
export const TIME_ZONE = 'America/Sao_Paulo';
const parts = (date: Date) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
const localDate = (date: Date) => { const p = parts(date); return `${p.year}-${p.month}-${p.day}`; };
const addDays = (day: string, count: number) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + count); return d.toISOString().slice(0, 10); };
const daysBetweenInclusive = (start: string, end: string) => Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000) + 1;
export function resolvePeriod(period: Period, now: Date, customStart = '', customEnd = '') {
 const today = localDate(now);
 if (period === 'today') return { start: today, end: today, granularity: 'hour' as Granularity };
 if (period === 'yesterday') { const yesterday = addDays(today, -1); return { start: yesterday, end: yesterday, granularity: 'hour' as Granularity }; }
 if (period === 'last7') return { start: addDays(today, -6), end: today, granularity: 'day' as Granularity };
 if (period === 'month') return { start: today.slice(0, 7) + '-01', end: today, granularity: 'day' as Granularity };
 if (!/^\d{4}-\d{2}-\d{2}$/.test(customStart) || !/^\d{4}-\d{2}-\d{2}$/.test(customEnd) || customStart > customEnd || !Number.isFinite(Date.parse(customStart)) || !Number.isFinite(Date.parse(customEnd))) throw new Error('Selecione um intervalo de datas válido.');
 const days = daysBetweenInclusive(customStart, customEnd);
 return { start: customStart, end: customEnd, granularity: (days === 1 ? 'hour' : days <= 62 ? 'day' : 'month') as Granularity };
}
const blank = (key: string, label: string): Bucket => ({ key, label, answered: 0, unanswered: 0, abandoned: 0, other: 0, total: 0 });
export function aggregateCalls(records: CallRecord[], period: ReturnType<typeof resolvePeriod>, now: Date) {
 const buckets: Bucket[] = [];
 if (period.granularity === 'hour') for (let h = 0; h < 24; h++) buckets.push(blank(`${period.start}T${String(h).padStart(2, '0')}`, `${String(h).padStart(2, '0')}h`));
 else if (period.granularity === 'day') for (let day = period.start; day <= period.end; day = addDays(day, 1)) buckets.push(blank(day, day.slice(8, 10) + '/' + day.slice(5, 7)));
 else for (let month = period.start.slice(0, 7); month <= period.end.slice(0, 7); month = addDays(month + '-01', 32).slice(0, 7)) buckets.push(blank(month, month.slice(5, 7) + '/' + month.slice(0, 4)));
 const byKey = new Map(buckets.map(bucket => [bucket.key, bucket]));
 const seen = new Set<number>();
 for (const record of records) {
  if (record.direction !== 'Recebida' || seen.has(record.id)) continue;
  const date = new Date(record.initTime);
  if (Number.isNaN(date.getTime()) || date > now) continue;
  const p = parts(date), day = `${p.year}-${p.month}-${p.day}`;
  if (day < period.start || day > period.end) continue;
  const key = period.granularity === 'hour' ? `${day}T${p.hour}` : period.granularity === 'day' ? day : day.slice(0, 7);
  const bucket = byKey.get(key);
  if (!bucket) continue;
  seen.add(record.id);
  bucket.total++;
  if (record.disposition === 'ANSWERED') bucket.answered++;
  else if (record.disposition === 'NO ANSWER') bucket.unanswered++;
  else if (record.disposition === 'ABANDON') bucket.abandoned++;
  else bucket.other++;
 }
 const summary = buckets.reduce<Summary>((s, b) => ({ answered: s.answered + b.answered, unanswered: s.unanswered + b.unanswered, abandoned: s.abandoned + b.abandoned, other: s.other + b.other, total: s.total + b.total, answerRate: null }), { answered: 0, unanswered: 0, abandoned: 0, other: 0, total: 0, answerRate: null });
 summary.answerRate = summary.total ? summary.answered / summary.total * 100 : null;
 return { buckets, summary };
}
export function createDemoCalls(now: Date): CallRecord[] {
 const today = localDate(now), records: CallRecord[] = [];
 let id = 1;
 for (let d = 0; d < 100; d++) {
  const day = addDays(today, -d);
  for (let h = 0; h < 24; h++) for (let i = 0; i < (h >= 8 && h <= 19 ? 5 : 1); i++) {
   const stamp = new Date(day + 'T12:00:00Z');
   const dateParts = parts(stamp);
   const offsetHours = Number(dateParts.hour) - stamp.getUTCHours();
   const localHourUtc = (h - offsetHours + 24) % 24;
   const utcDayShift = Math.floor((h - offsetHours) / 24);
   const utcDay = addDays(day, utcDayShift);
   const instant = new Date(`${utcDay}T${String(localHourUtc).padStart(2, '0')}:15:00Z`);
   if (instant > now) continue;
   records.push({ id: id++, initTime: instant.toISOString(), direction: 'Recebida', disposition: ((i + h + d) % 11 < 7 ? 'ANSWERED' : (i + h + d) % 11 < 9 ? 'NO ANSWER' : 'ABANDON') });
  }
 }
 return records;
}
