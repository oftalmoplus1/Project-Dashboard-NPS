import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'queue-snapshot-'));
const tsc = createRequire(import.meta.url).resolve('typescript/lib/tsc.js');
execFileSync(process.execPath, [tsc, 'lib/ligsim-queue-snapshot.ts',
  '--target', 'ES2022', '--module', 'commonjs', '--strict', '--skipLibCheck', '--outDir', out], { cwd: root });
const lib = (await import(pathToFileURL(path.join(out, 'ligsim-queue-snapshot.js')).href)).default;
after(() => fs.rmSync(out, { recursive: true, force: true }));

const queue = (id, received, answered, over, under, waiting = 0) =>
  ({ id, name: 'FILA-' + id, received, answered, abandon_more_30s: over,
    abandon_less_30s: under, waiting_calls: waiting, member: [{ internal: 'private' }] });

test('compute queue received, answered, both abandonment buckets and waiting', () => {
  const data = lib.parseQueueSnapshot([queue(2, 80, 50, 12, 5, 3), queue(1, 120, 80, 8, 2, 4)]);
  assert.deepEqual(data.rows, [
    { id: 1, name: 'FILA-1', received: 120, answered: 80, abandoned: 10, waiting: 4, tma: null, tme: null },
    { id: 2, name: 'FILA-2', received: 80, answered: 50, abandoned: 17, waiting: 3, tma: null, tme: null },
  ]);
  assert.equal(data.summary.total, 200);
  assert.equal(data.summary.answered, 130);
  assert.equal(data.summary.abandoned, 27);
  assert.equal(data.summary.unanswered, null);
  assert.equal(data.summary.other, null);
  assert.equal(data.summary.abandonRate, 13.5);
  assert.ok(!JSON.stringify(data).includes('member'));
});

test('valid zero snapshot distinguishes a snapshot with no traffic from missing records', () => {
  const data = lib.parseQueueSnapshot([queue(1, 0, 0, 0, 0)]);
  assert.equal(data.summary.total, 0);
  assert.equal(data.summary.abandonRate, null);
  assert.equal(data.rows.length, 1);
  assert.throws(() => lib.parseQueueSnapshot([]));
});

for (const input of [
  [queue(1, -1, 0, 0, 0)],
  [queue(1, 2, 3, 0, 0)],
  [queue(1, 10, 8, 3, 0)],
  [queue(1, 5, 0, 0, -1)],
  [queue(1, 5, 0, '3', 0)],
  [queue(1, 5, 0, 0.5, 0)],
  [queue(1, 5, 0, 0, 0), queue(1, 5, 0, 0, 0)],
  [{ ...queue(1, 5, 0, 0, 0), name: '' }],
]) test('reject inconsistent or malformed queue counters', () => assert.throws(() => lib.parseQueueSnapshot(input)));

test('validate public snapshot without treating missing history as zero', () => {
  const raw = lib.parseQueueSnapshot([queue(1, 10, 7, 1, 1)]);
  const output = lib.parseQueueApiResponse({ ...raw, source: 'listar_filas', kind: 'latest_snapshot', consultedAt: '2026-11-23T10:00:00Z', sourceUpdatedAt: '2026-11-23T09:00:00Z' });
  assert.equal(output.summary.total, 10);
  assert.equal(output.rows[0].abandoned, 2);
  assert.equal(output.consultedAt, '2026-11-23T10:00:00Z');
  assert.equal(output.sourceUpdatedAt, '2026-11-23T09:00:00Z');
});
test('public response rejects wrong origin or mismatched summaries', () => {
  const raw = lib.parseQueueSnapshot([queue(1, 10, 7, 1, 1)]);
  const baseline = { ...raw, source: 'listar_filas', kind: 'latest_snapshot', consultedAt: '2026-11-23T10:00:00Z', sourceUpdatedAt: '2026-11-23T09:00:00Z' };
  assert.throws(() => lib.parseQueueApiResponse({ ...baseline, source: 'outra_tabela' }));
  assert.throws(() => lib.parseQueueApiResponse({ ...baseline, summary: { ...raw.summary, total: 40 } }));
  assert.throws(() => lib.parseQueueApiResponse({ ...baseline, rows: [] }));
  assert.throws(() => lib.parseQueueApiResponse({ ...baseline, sourceUpdatedAt: null }));
});

test('weight queue TME by answered calls while keeping TMA as simple queue average', () => {
  const data = lib.parseQueueSnapshot([
    { ...queue(1, 50, 30, 5, 3), tma:'00:02:00', tme:'00:01:00' },
    { ...queue(2, 10, 1, 1, 0), tma:'00:04:00', tme:'00:03:00' },
    { ...queue(3, 0, 0, 0, 0), tma:'00:00:00', tme:'00:00:00' },
  ]);
  assert.equal(data.summary.tmaSeconds, 180);
  assert.equal(data.summary.tmeSeconds, (60 * 30 + 180 * 1) / 31);
  assert.equal(data.summary.tmaQueues, 2);
  assert.equal(data.summary.tmeQueues, 2);
  assert.equal(data.rows[0].tma,'00:02:00');
});

test('zero time is a real observation when a queue has answered calls', () => {
  const data = lib.parseQueueSnapshot([
    { ...queue(1, 2, 1, 1, 0), tma:'00:00:00', tme:'00:00:00' },
    { ...queue(2, 5, 4, 1, 0), tma:'00:00:30', tme:'00:01:00' },
  ]);
  assert.equal(data.summary.tmaSeconds,15);
  assert.equal(data.summary.tmeSeconds,48);
  assert.equal(data.summary.tmaQueues,2);
  assert.equal(data.summary.tmeQueues,2);
});

test('eight LigSim queues reproduce 01:02 weighted TME for 186 answered calls', () => {
  const source = [
    [15, 23, 22, 1, 0, '00:00:42'],
    [14, 10, 9, 1, 0, '00:00:45'],
    [13, 106, 83, 23, 0, '00:00:49'],
    [6, 6, 5, 1, 0, '00:02:25'],
    [4, 20, 19, 1, 0, '00:01:55'],
    [3, 23, 20, 3, 0, '00:01:24'],
    [2, 21, 21, 0, 0, '00:00:32'],
    [1, 8, 7, 1, 0, '00:02:13'],
  ];
  const data = lib.parseQueueSnapshot(source.map(([id, received, answered, over, under, tme]) =>
    ({ ...queue(id, received, answered, over, under), tme })));
  assert.equal(data.summary.answered, 186);
  assert.equal(data.summary.tmeQueues, 8);
  assert.equal(data.summary.tmeSeconds, 11589 / 186);
  assert.equal(Math.round(data.summary.tmeSeconds), 62);
});

test('TME excludes queues with missing duration from its weight denominator', () => {
  const data = lib.parseQueueSnapshot([
    { ...queue(1, 40, 30, 5, 5), tme: null },
    { ...queue(2, 2, 1, 1, 0), tme: '00:01:00' },
    { ...queue(3, 0, 0, 0, 0), tme: '00:00:00' },
  ]);
  assert.equal(data.summary.answered, 31);
  assert.equal(data.summary.tmeQueues, 1);
  assert.equal(data.summary.tmeSeconds, 60);
});

test('TME refuses unsafe products instead of silently losing precision', () => {
  const huge = Number.MAX_SAFE_INTEGER;
  assert.throws(() => lib.parseQueueSnapshot([
    { ...queue(1, huge, huge, 0, 0), tme: '00:00:02' },
  ]), /TME ponderado fora de limite/);
});

test('missing and invalid durations never silently become zero', () => {
  const raw = lib.parseQueueSnapshot([
    { ...queue(1, 8, 6, 1, 1), tma:null, tme:null },
    { ...queue(2, 0, 0, 0, 0), tma:'00:00:00', tme:'00:00:00' },
  ]);
  assert.equal(raw.summary.tmaSeconds,null);
  assert.equal(raw.summary.tmeSeconds,null);
  assert.equal(raw.summary.tmaQueues,0);
  assert.equal(raw.summary.tmeQueues,0);
  for (const invalid of ['00:99:00','bad','00:00:99',42,'-01:00:00']) {
    assert.throws(()=>lib.parseQueueSnapshot([{...queue(1,5,4,0,1),tma:invalid,tme:'00:00:10'}]));
  }
});

test('browser response rejects spoofed average, even when counters match', () => {
  const raw = lib.parseQueueSnapshot([{...queue(1,12,10,1,0),tma:'00:01:10',tme:'00:00:30'}]);
  const baseline = {...raw,source:'listar_filas',kind:'latest_snapshot',
    consultedAt:'2026-11-24T10:00:00Z',sourceUpdatedAt:'2026-11-24T09:00:00Z'};
  assert.equal(lib.parseQueueApiResponse(baseline).summary.tmaSeconds,70);
  assert.throws(()=>lib.parseQueueApiResponse({...baseline,summary:{...raw.summary,tmaSeconds:1}}));
  assert.throws(()=>lib.parseQueueApiResponse({...baseline,summary:{...raw.summary,tmeSeconds:1}}));
});
