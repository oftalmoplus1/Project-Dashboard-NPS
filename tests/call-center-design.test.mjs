import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'call-center-design-'));
const compiler = createRequire(import.meta.url).resolve('typescript/lib/tsc.js');
execFileSync(process.execPath, [compiler, 'lib/call-center-design.ts', '--target', 'ES2022', '--module', 'commonjs', '--strict', '--skipLibCheck', '--outDir', out], { cwd: root });
const { default: lib } = await import(pathToFileURL(path.join(out, 'call-center-design.js')).href);
after(() => fs.rmSync(out, { recursive: true, force: true }));
for (const [input, expected] of [[0, '00:00'], [32, '00:32'], [163, '02:43'], [3599, '59:59'], [3599.6, '01:00:00'], [3690, '01:01:30'], [86400, '24:00:00'], [0.49, '00:00']]) {
  test(`format duration ${input}`, () => assert.equal(lib.formatCallDuration(input), expected));
}
for (const input of [null, undefined, NaN, Infinity, -1, Number.MAX_SAFE_INTEGER + 1]) {
  test(`unknown or invalid duration ${String(input)}`, () => assert.equal(lib.formatCallDuration(input), '—'));
}
test('approved legacy topic label changes without modifying slug', () => {
  const topic = Object.freeze({ slug: 'relatorios', nome: 'Relatórios' });
  assert.equal(lib.callCenterTopicLabel(topic), 'Call Center');
  assert.equal(topic.slug, 'relatorios');
});
test('custom topic names are preserved', () => {
  assert.equal(lib.callCenterTopicLabel({ slug: 'relatorios', nome: 'Relatórios financeiros' }), 'Relatórios financeiros');
  assert.equal(lib.callCenterTopicLabel({ slug: 'outro', nome: 'Relatórios' }), 'Relatórios');
});
test('topic rename handles legacy accents and surrounding spaces', () => assert.equal(lib.callCenterTopicLabel({ slug: 'relatorios', nome: ' RELATORIOS ' }), 'Call Center'));
test('four unique tabs, annual enabled and ramal removed', () => {
  assert.equal(new Set(lib.CALL_CENTER_TABS.map(tab => tab.id)).size, 4);
  assert.deepEqual(lib.CALL_CENTER_TABS.filter(tab => tab.pending).map(tab => tab.id), []);
  assert.equal(lib.CALL_CENTER_NAV_ITEMS.some(item => item.id === 'extension'), false);
});
test('keyboard arrows wrap without activating network queries', () => {
  assert.equal(lib.nextCallTabIndex(3, 'ArrowRight'), 0);
  assert.equal(lib.nextCallTabIndex(0, 'ArrowLeft'), 3);
  assert.equal(lib.nextCallTabIndex(1, 'ArrowRight'), 2);
});
test('Home and End navigation', () => {
  assert.equal(lib.nextCallTabIndex(3, 'Home'), 0);
  assert.equal(lib.nextCallTabIndex(1, 'End'), 3);
});
test('native keys and invalid indexes are not intercepted', () => {
  for (const key of ['Enter', ' ', 'Tab', 'ArrowDown']) assert.equal(lib.nextCallTabIndex(0, key), null);
  assert.equal(lib.nextCallTabIndex(-1, 'Home'), null);
  assert.equal(lib.nextCallTabIndex(4, 'End'), null);
});
