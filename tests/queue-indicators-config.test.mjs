import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../lib/queue-indicators-config.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
}}).outputText;
const { parseQueueIndicatorsConfig, makeQueueIndicatorsRow, selectQueueIndicators } =
  await import('data:text/javascript;base64,' + Buffer.from(output).toString('base64'));

const example = {
  startDate: '2026-01-01', endDate: '2026-11-25',
  selection: { mode: 'all' }, sortBy: 'name', sortDirection: 'asc',
  limit: 'all', visualization: 'table', orientation: 'vertical',
};
test('arbitrary dates, leap years and invalid ranges', () => {
  assert.ok(parseQueueIndicatorsConfig(example));
  assert.ok(parseQueueIndicatorsConfig({ ...example, startDate: '2024-02-29' }));
  assert.equal(parseQueueIndicatorsConfig({ ...example, startDate: '2026-02-29' }), null);
  assert.equal(parseQueueIndicatorsConfig({ ...example, startDate: '2026-12-01' }), null);
  assert.equal(parseQueueIndicatorsConfig({ ...example, sql: 'select *' }), null);
});
test('explicit selection is unique and validated', () => {
  assert.ok(parseQueueIndicatorsConfig({
    ...example, selection: { mode: 'selected', ids: ['1', 'queue-2'] },
  }));
  assert.equal(parseQueueIndicatorsConfig({
    ...example, selection: { mode: 'selected', ids: [] },
  }), null);
  assert.equal(parseQueueIndicatorsConfig({
    ...example, selection: { mode: 'selected', ids: ['1', '1'] },
  }), null);
});
test('new authorized queues appear automatically in all mode', () => {
  const first = makeQueueIndicatorsRow('1', 'Alfa', 10, 8, 2);
  const second = makeQueueIndicatorsRow('2', 'Beta', 0, 0, 0);
  const rows = selectQueueIndicators([first, second], example);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].serviceRate, null);
  assert.deepEqual(selectQueueIndicators([first, second], {
    ...example, selection: { mode: 'selected', ids: ['1'] },
  }).map(row => row.id), ['1']);
});
test('sort, limit, bar orientations and inconsistent counters', () => {
  const rows = [
    makeQueueIndicatorsRow('1', 'Alfa', 10, 8, 2),
    makeQueueIndicatorsRow('2', 'Beta', 0, 0, 0),
    makeQueueIndicatorsRow('3', 'Gama', 20, 2, 4),
  ];
  const config = parseQueueIndicatorsConfig({
    ...example, sortBy: 'received', sortDirection: 'desc',
    limit: 5, visualization: 'bar', orientation: 'horizontal',
  });
  assert.ok(config);
  assert.deepEqual(selectQueueIndicators(rows, config).map(row => row.id), ['3', '1', '2']);
  assert.equal(makeQueueIndicatorsRow('a', 'A', 4, 3, 0).serviceRate, 75);
  assert.throws(() => makeQueueIndicatorsRow('x', 'X', 2, 3, 0));
});
