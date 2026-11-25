import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-evolution-'));
const tsc = createRequire(import.meta.url).resolve('typescript/lib/tsc.js');
execFileSync(process.execPath, [tsc, 'lib/editor-evolution.ts',
  '--target', 'ES2022', '--module', 'commonjs', '--strict', '--skipLibCheck',
  '--lib', 'ES2022,DOM', '--outDir', out], { cwd: root });
const lib = (await import(pathToFileURL(path.join(out, 'editor-evolution.js')).href)).default;
after(() => fs.rmSync(out, { recursive: true, force: true }));

const now = new Date('2026-11-25T15:00:00Z'); // 12:00 in Sao Paulo
const queues = [
  { id: 'a', name: 'Atendimento Geral' },
  { id: 'b', name: 'Agendamento' },
  { id: 'c', name: 'Exames' },
  { id: 'd', name: 'Financeiro' },
  { id: 'e', name: 'Informacoes' },
  { id: 'f', name: 'Retornos' },
];
const baseline = {
  chart: 'line', period: { kind: 'fixed', start: '2026-11-23', end: '2026-11-25' },
  grouping: 'day', metrics: ['received', 'answered', 'abandoned'],
  queues: { mode: 'all' }, presentation: 'consolidated', limit: 5,
  sort: { field: 'metric', direction: 'desc' },
};
const visit = (queueId, date, outcome = 'answered') =>
  ({ queueId, enteredAt: date + 'T12:00:00-03:00', outcome });

test('dynamic presets exclude today using Sao Paulo civil dates', () => {
  const cases = [
    ['last7', '2026-11-18', '2026-11-24'],
    ['last30', '2026-10-26', '2026-11-24'],
    ['last90', '2026-08-27', '2026-11-24'],
    ['currentMonth', '2026-11-01', '2026-11-24'],
    ['previousMonth', '2026-10-01', '2026-10-31'],
    ['currentYear', '2026-01-01', '2026-11-24'],
    ['previousYear', '2025-01-01', '2025-12-31'],
  ];
  for (const [preset, start, end] of cases) {
    assert.deepEqual(lib.resolveEvolutionPeriod({ kind: 'dynamic', preset }, now),
      { start, end, empty: false, partial: false });
  }
});

test('first day of month or year is empty, fixed can include today', () => {
  assert.equal(lib.resolveEvolutionPeriod({ kind: 'dynamic', preset: 'currentMonth' },
    new Date('2026-11-01T14:00:00Z')).empty, true);
  assert.equal(lib.resolveEvolutionPeriod({ kind: 'dynamic', preset: 'currentYear' },
    new Date('2026-01-01T14:00:00Z')).empty, true);
  assert.equal(lib.resolveEvolutionPeriod(baseline.period, now).partial, true);
  assert.throws(() => lib.resolveEvolutionPeriod({ kind: 'fixed', start: '2026-02-30', end: '2026-03-01' }, now));
  assert.throws(() => lib.resolveEvolutionPeriod({ kind: 'dynamic', preset: 'last15' }, now));
});

test('zero buckets are generated only when the period has observed records', () => {
  const data = lib.buildEvolution(baseline, queues, [visit('a', '2026-11-23')], now);
  assert.equal(data.state, 'ready');
  assert.deepEqual(data.buckets, ['2026-11-23', '2026-11-24', '2026-11-25']);
  assert.deepEqual(data.series.find(s => s.id === 'received').values, [1, 0, 0]);
  assert.deepEqual(lib.buildEvolution(baseline, queues, [], now).series, []);
  assert.equal(lib.buildEvolution(baseline, queues, [], now).state, 'empty');
});

test('each queue entry counts, transfer is not abandonment, answer only where answered', () => {
  const result = lib.buildEvolution(baseline, queues, [
    visit('a', '2026-11-24', 'transferred'), visit('b', '2026-11-24', 'answered'),
    visit('a', '2026-11-24', 'other'),
  ], now);
  const day = result.buckets.indexOf('2026-11-24');
  assert.equal(result.series.find(s => s.id === 'received').values[day], 3);
  assert.equal(result.series.find(s => s.id === 'answered').values[day], 1);
  assert.equal(result.series.find(s => s.id === 'abandoned').values[day], 0);
});

test('abandonment counts all abandonments independent of wait duration', () => {
  const result = lib.buildEvolution(baseline, queues, [
    visit('a', '2026-11-24', 'abandoned'), visit('a', '2026-11-24', 'abandoned'),
  ], now);
  assert.equal(result.series.find(s => s.id === 'abandoned').values[1], 2);
});

test('weekly buckets start on Monday and monthly buckets respect edges', () => {
  const weeks = lib.buildEvolution({ ...baseline, grouping: 'week',
    period: { kind: 'fixed', start: '2026-11-20', end: '2026-12-02' } },
    queues, [visit('a', '2026-11-20')], now);
  assert.deepEqual(weeks.buckets, ['2026-11-16', '2026-11-23', '2026-11-30']);
  const months = lib.buildEvolution({ ...baseline, grouping: 'month',
    period: { kind: 'fixed', start: '2026-10-30', end: '2026-12-03' } },
    queues, [visit('a', '2026-10-30')], now);
  assert.deepEqual(months.buckets, ['2026-10', '2026-11', '2026-12']);
  assert.deepEqual(months.series[0].values, [1, 0, 0]);
});

test('queue selection can be fixed or dynamically include new authorized queues', () => {
  const withNewQueue = [...queues, { id: 'new', name: 'Fila Nova' }];
  const rows = [visit('new', '2026-11-24')];
  assert.equal(lib.buildEvolution(baseline, withNewQueue, rows, now).series[0].values[1], 1);
  const fixed = { ...baseline, queues: { mode: 'selected', ids: ['a'] } };
  assert.equal(lib.buildEvolution(fixed, withNewQueue, rows, now).state, 'empty');
  assert.throws(() => lib.buildEvolution({ ...baseline,
    queues: { mode: 'selected', ids: ['not-authorized'] } }, queues, [], now));
});

test('separate-by-queue permits one metric and sorts on full-period totals before limit', () => {
  const separate = { ...baseline, presentation: 'byQueue', metrics: ['received'],
    sort: { field: 'metric', direction: 'desc' } };
  const rows = queues.flatMap((queue, i) =>
    Array.from({ length: i + 1 }, () => visit(queue.id, '2026-11-24')));
  const result = lib.buildEvolution(separate, queues, rows, now);
  assert.deepEqual(result.shownQueues, ['f', 'e', 'd', 'c', 'b']);
  assert.equal(result.series.length, 5);
  assert.equal(result.series[0].values[1], 6);
  const asc = lib.buildEvolution({ ...separate,
    sort: { field: 'metric', direction: 'asc' }, limit: 10 }, queues, rows, now);
  assert.deepEqual(asc.shownQueues, ['a', 'b', 'c', 'd', 'e', 'f']);
  const byName = lib.buildEvolution({ ...separate,
    sort: { field: 'name', direction: 'asc' }, limit: 'all' }, queues, rows, now);
  assert.deepEqual(byName.shownQueues, ['b', 'a', 'c', 'd', 'e', 'f']);
  assert.throws(() => lib.buildEvolution({ ...separate, metrics: ['received', 'answered'] }, queues, rows, now));
});

test('local enteredAt date controls attribution even when UTC date differs', () => {
  const config = { ...baseline, period: { kind: 'fixed', start: '2026-11-24', end: '2026-11-24' } };
  const result = lib.buildEvolution(config, queues, [
    { queueId: 'a', enteredAt: '2026-11-25T02:58:00Z', outcome: 'answered' },
    { queueId: 'a', enteredAt: '2026-11-25T03:03:00Z', outcome: 'answered' },
  ], now);
  assert.equal(result.series.find(s => s.id === 'answered').values[0], 1);
});

test('unauthorized or malformed visits must fail, never appear as zero', () => {
  assert.throws(() => lib.buildEvolution(baseline, queues, [visit('other', '2026-11-24')], now));
  assert.throws(() => lib.buildEvolution(baseline, queues, [
    { queueId: 'a', enteredAt: '2026-11-24T13:00:00', outcome: 'answered' },
  ], now));
  assert.throws(() => lib.buildEvolution(baseline, queues, [
    { queueId: 'a', enteredAt: '2026-11-24T13:00:00-03:00', outcome: 'unknown' },
  ], now));
});
