import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'call-data-test-'));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compiler = createRequire(import.meta.url).resolve('typescript/lib/tsc.js');
execFileSync(process.execPath, [compiler, 'lib/call-chart-data.ts', 'lib/server/fetch-call-aggregates.ts',
  '--target', 'ES2022', '--module', 'commonjs', '--strict', '--skipLibCheck', '--lib', 'ES2022,DOM', '--outDir', out], { cwd: root });
const { default: lib } = await import(pathToFileURL(path.join(out, 'call-chart-data.js')).href);
const { default: reader } = await import(pathToFileURL(path.join(out, 'server/fetch-call-aggregates.js')).href);
const { fetchCallAggregates } = reader;
after(() => fs.rmSync(out, { recursive: true, force: true }));
const range = { start: '2026-01-01', end: '2026-12-31' };
const row = (day = '2026-01-02', hour = '00', extra = {}) => ({ periodo_inicio: `${day}T${hour}:00:00`,
  total: 120, atendidas: 80, nao_atendidas: 25, abandonadas: 10, outras: 5, ...extra });
const parse = rows => lib.parseAggregateRows({ rows }, range);
const hours = () => Array.from({ length: 24 }, (_, hora) => ({ ...lib.zeroCounts(), hora }));

test('abandonment uses every received call, not answered + abandoned', () => {
  assert.equal(lib.abandonmentRate(10, 120), 10 / 120 * 100);
  assert.notEqual(lib.abandonmentRate(10, 120), 10 / 90 * 100);
});
test('zero denominator is unavailable, not zero percent', () => assert.equal(lib.abandonmentRate(0, 0), null));
test('valid zero abandonment and full abandonment', () => {
  assert.equal(lib.abandonmentRate(0, 120), 0); assert.equal(lib.abandonmentRate(120, 120), 100);
});
for (const pair of [[-1, 2], [3, 2], [0.5, 2], [NaN, 2], [1, Infinity]]) {
  test(`invalid rate input ${pair}`, () => assert.throws(() => lib.abandonmentRate(...pair)));
}
for (const date of ['2026-02-30', '2026-13-01', '2026-00-01', '2026-1-01', 'invalid', null]) {
  test(`reject invalid civil date ${date}`, () => assert.equal(lib.isCivilDate(date), false));
}
test('leap dates and Sao Paulo midnight', () => {
  assert.ok(lib.isCivilDate('2024-02-29')); assert.ok(!lib.isCivilDate('2025-02-29'));
  assert.equal(lib.localToday(new Date('2026-11-19T02:59:59Z')), '2026-11-18');
  assert.equal(lib.localToday(new Date('2026-11-19T03:00:00Z')), '2026-11-19');
});
test('reject reversed and too long range', () => {
  assert.throws(() => lib.validateRange({ start: '2026-03-01', end: '2026-02-28' }));
  assert.throws(() => lib.validateRange({ start: '2025-01-01', end: '2026-12-31' }));
});
test('parse valid aggregate and keep other statuses in total', () => assert.deepEqual(parse([row()]), [row()]));
test('reject duplicate buckets even with differing zero fractions', () => {
  assert.throws(() => parse([row(), row('2026-01-02', '00', { periodo_inicio: '2026-01-02T00:00:00.000' })]));
});
for (const extra of [{ total: 119 }, { outras: -1 }, { total: '120' }, { total: NaN }, { total: Infinity }, { atendidas: 80.5 }]) {
  test(`reject invalid counts ${JSON.stringify(extra)}`, () => assert.throws(() => parse([row('2026-01-02', '00', extra)])));
}
for (const stamp of ['2026-02-30T00:00:00', '2027-01-01T00:00:00', '2026-01-02T03:00:00',
  '2026-01-02T24:00:00', '2026-01-02T02:30:00', '2026-01-02T00:00:00Z', '2026-01-02T00:00:00-03:00']) {
  test(`reject invalid local SQL bucket ${stamp}`, () => assert.throws(() => parse([row('2026-01-02', '00', { periodo_inicio: stamp })])));
}
test('empty but valid aggregate remains empty', () => assert.deepEqual(parse([]), []));
test('reject non-array or null payload', () => {
  assert.throws(() => lib.parseAggregateRows(null, range)); assert.throws(() => parse([null]));
});
test('safe integer overflow is not silently displayed', () => {
  const max = { ...lib.zeroCounts(), total: Number.MAX_SAFE_INTEGER, atendidas: Number.MAX_SAFE_INTEGER };
  assert.throws(() => lib.sumCounts([max, max]));
});
test('hourly contract requires all 24 hours and sorts', () => {
  assert.deepEqual(lib.parseHourlyRows({ rows: hours().reverse() }).map(r => r.hora), Array.from({ length: 24 }, (_, i) => i));
});
test('missing hourly values are not filled with fake zeros', () => assert.throws(() => lib.parseHourlyRows({ rows: hours().slice(0, 23) })));
test('empty hourly response is unavailable, not 24 zero rows', () => assert.throws(() => lib.parseHourlyRows({ rows: [] })));
test('duplicate hour is rejected', () => { const rows = hours(); rows[23].hora = 0; assert.throws(() => lib.parseHourlyRows({ rows })); });
test('monthly averages exclude gaps, future and ongoing month', () => {
  const result = lib.monthlyData([row('2026-01-02'), row('2026-03-02'), row('2026-11-02')], 2026, '2026-11-19');
  assert.equal(result.buckets[1].status, 'no-records'); assert.equal(result.buckets[10].status, 'partial');
  assert.equal(result.buckets[11].status, 'future'); assert.equal(result.meanMonthCount, 2);
  assert.equal(result.averages.total, 120); assert.equal(result.averages.atendidas, 80);
});
test('empty year has no invented mean', () => assert.equal(lib.monthlyData([], 2026, '2026-11-19').averages.total, null));
test('future record relative to query cutoff is rejected', () => assert.throws(() => lib.monthlyData([row('2026-11-20')], 2026, '2026-11-19')));
test('annual query never requests future days', () => {
  const ranges = lib.annualRanges(2026, '2026-11-19'); assert.equal(ranges.length, 6);
  assert.equal(ranges.at(-1).end, '2026-11-19');
  assert.deepEqual(lib.annualRanges(2027, '2026-11-19'), []);
});
test('past leap year query includes February 29', () => assert.equal(lib.annualRanges(2024, '2026-11-19')[0].end, '2024-02-29'));

const config = { url: 'https://database.example', publishableKey: 'publishable-test' };
const response = (rows, header, status = 200) => new Response(JSON.stringify(rows), {
  status, headers: header === null ? {} : { 'Content-Range': header },
});
test('reader returns every page and preserves caller auth', async () => {
  const seen = [];
  const mock = async (url, options) => {
    seen.push({ url: new URL(url), options });
    return seen.length === 1 ? response([row()], '0-0/2') : response([row('2026-01-03')], '1-1/2');
  };
  const result = await fetchCallAggregates(config, 'user-token', range, mock);
  assert.equal(result.length, 2); assert.equal(seen[1].url.searchParams.get('offset'), '1');
  assert.equal(seen[0].options.headers.Authorization, 'Bearer user-token');
  assert.equal(seen[0].options.headers.Prefer, 'count=exact');
  assert.equal(seen[0].options.cache, 'no-store');
  assert.equal(seen[0].url.searchParams.get('order'), 'periodo_inicio.asc');
});
test('reader rejects missing count', async () => assert.rejects(() => fetchCallAggregates(config, 'user-token', range, async () => response([row()], null))));
test('reader rejects unknown count', async () => assert.rejects(() => fetchCallAggregates(config, 'user-token', range, async () => response([row()], '0-0/*'))));
test('reader rejects changing totals across pages', async () => {
  let call = 0;
  await assert.rejects(() => fetchCallAggregates(config, 'user-token', range, async () => ++call === 1 ? response([row()], '0-0/2') : response([row('2026-01-03')], '1-1/3')));
});
test('reader rejects repeated range', async () => assert.rejects(() => fetchCallAggregates(config, 'user-token', range, async () => response([row()], '0-0/2'))));
test('reader rejects duplicate data across valid ranges', async () => {
  let call = 0;
  await assert.rejects(() => fetchCallAggregates(config, 'user-token', range, async () => response([row()], `${call}-${call++}/2`)));
});
test('reader rejects empty page of nonempty result', async () => assert.rejects(() => fetchCallAggregates(config, 'user-token', range, async () => response([], '*/2'))));
test('reader accepts proven empty result', async () => assert.deepEqual(await fetchCallAggregates(config, 'user-token', range, async () => response([], '*/0')), []));
test('reader rejects API errors without swallowing authorization', async () => {
  await assert.rejects(() => fetchCallAggregates(config, 'user-token', range, async () => response({}, null, 403)), error => error.status === 403);
});
test('reader refuses missing user token before network request', async () => {
  await assert.rejects(() => fetchCallAggregates(config, '', range, async () => assert.fail('network must not run')), error => error.status === 401);
});
test('reader has bounded page count', async () => {
  let calls = 0;
  await assert.rejects(() => fetchCallAggregates(config, 'user-token', range, async () => {
    const offset = calls++; return response([row()], `${offset}-${offset}/51`);
  }));
  assert.equal(calls, 50);
});
