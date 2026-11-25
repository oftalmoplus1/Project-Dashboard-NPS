import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-queue-view-'));
try {
  const tsc = createRequire(import.meta.url).resolve('typescript/lib/tsc.js');
  execFileSync(process.execPath, [tsc, 'lib/editor-queue-view.ts',
    '--target', 'ES2022', '--module', 'commonjs', '--strict', '--skipLibCheck', '--outDir', out],
    { cwd: root });
  const mod = (await import(pathToFileURL(path.join(out, 'editor-queue-view.js')).href)).default;
  const row = (id, name, received, answered, abandoned) =>
    ({ id, name, received, answered, abandoned, waiting: 0, tma: null, tme: null });
  const rows = [
    row(1, 'Recepção', 8, 6, 1),
    row(2, 'Sem movimento', 0, 0, 0),
    row(3, 'Consultas', 20, 10, 5),
  ];
  const config = (changes = {}) => ({ ...mod.DEFAULT_QUEUE_VIEW, ...changes });

  test('all includes new authorized queues, and zero volume stays visible', () => {
    const result = mod.buildQueueView(rows, config());
    assert.deepEqual(result.map(item => item.id), [3, 1, 2]);
    assert.equal(result[2].answerRate, null);
    assert.equal(result[2].received, 0);
    assert.equal(mod.buildQueueView([...rows, row(4, 'Nova fila', 30, 20, 2)], config())[0].id, 4);
  });
  test('selection uses ids and cannot disclose missing/unauthorized queues', () => {
    const result = mod.buildQueueView(rows, config({ selection: { mode: 'selected', ids: [2, 99] } }));
    assert.deepEqual(result.map(item => item.id), [2]);
    assert.deepEqual(mod.buildQueueView(rows, config({ selection: { mode: 'selected', ids: [] } })), []);
  });
  test('sort by rate handles missing denominators last in both directions', () => {
    const a = mod.buildQueueView(rows, config({ metric: 'answerRate', sortBy: 'answerRate', direction: 'asc' }));
    const b = mod.buildQueueView(rows, config({ metric: 'answerRate', sortBy: 'answerRate', direction: 'desc' }));
    assert.deepEqual(a.map(item => item.id), [3, 1, 2]);
    assert.deepEqual(b.map(item => item.id), [1, 3, 2]);
    assert.equal(a[0].value, 50);
  });
  test('inactive filter and fixed limits work without inventing rows', () => {
    const many = Array.from({ length: 25 }, (_, i) => row(i + 1, 'Fila ' + i, i + 1, 1, 0));
    assert.equal(mod.buildQueueView(many, config({ limit: 5 })).length, 5);
    assert.equal(mod.buildQueueView(many, config({ limit: 20 })).length, 20);
    assert.equal(mod.buildQueueView(many, config({ limit: 'all' })).length, 25);
    assert.equal(mod.buildQueueView(rows, config({ includeInactive: false })).length, 2);
  });
  test('reject malformed configurations, duplicated ids and contradictory counts', () => {
    assert.throws(() => mod.buildQueueView(rows, config({ limit: 7 })));
    assert.throws(() => mod.buildQueueView(rows, config({ selection: { mode: 'selected', ids: [1, 1] } })));
    assert.throws(() => mod.buildQueueView([rows[0], rows[0]], config()));
    assert.throws(() => mod.buildQueueView([row(5, 'Invalida', 3, 3, 2)], config()));
  });
} finally {
  fs.rmSync(out, { recursive: true, force: true });
}
