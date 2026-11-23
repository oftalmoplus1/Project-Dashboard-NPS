import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ligsim-report-tests-'));
const compiler = createRequire(import.meta.url).resolve('typescript/lib/tsc.js');
execFileSync(process.execPath, [compiler, 'lib/call-chart-data.ts', 'lib/ligsim-report-data.ts',
  '--target', 'ES2022', '--module', 'commonjs', '--strict', '--skipLibCheck', '--outDir', out], { cwd: root });
const mod = (await import(pathToFileURL(path.join(out, 'ligsim-report-data.js')).href)).default;
after(() => fs.rmSync(out, { recursive: true, force: true }));
const row = (date, total, atendidas, abandonadas) => ({
  periodo_inicio: date + 'T08:00:00', total, atendidas, abandonadas,
  nao_atendidas: total - atendidas - abandonadas, outras: 0,
});

test('current-year comparison uses matching cutoffs without requesting future', () => {
  const w = mod.comparisonWindows(2026, '2026-11-19');
  assert.equal(w.current.end, '2026-11-19');
  assert.equal(w.previous.end, '2025-11-19');
  assert.equal(w.current.ranges.at(-1).end, '2026-11-19');
  assert.equal(w.previous.ranges.at(-1).end, '2025-11-19');
  assert.equal(w.partial, true);
});
test('selected closed year compares two whole years', () => {
  const w = mod.comparisonWindows(2025, '2026-11-19');
  assert.deepEqual([w.current.end, w.previous.end], ['2025-12-31', '2024-12-31']);
  assert.equal(w.partial, false);
});
test('leap cutoff is clamped to February 28 for previous nonleap year', () => {
  const w = mod.comparisonWindows(2024, '2024-02-29');
  assert.equal(w.previous.end, '2023-02-28');
});
test('future year and year before 1901 are rejected', () => {
  assert.throws(() => mod.comparisonWindows(2027, '2026-11-19'));
  assert.throws(() => mod.comparisonWindows(1900, '2026-11-19'));
});
test('annual totals preserve other dispositions in received denominators', () => {
  const metrics = mod.annualMetrics({ rows: [row('2026-01-02', 120, 80, 10),
    row('2026-11-19', 200, 110, 25)] }, 2026, '2026-11-19');
  assert.deepEqual(metrics, { total: 320, atendidas: 190, abandonadas: 35, nao_atendidas: 95, outras: 0 });
});
test('annual totals reject after-cutoff, duplicate and malformed inputs', () => {
  assert.throws(() => mod.annualMetrics({ rows: [row('2026-11-20', 50, 30, 10)] }, 2026, '2026-11-19'));
  assert.throws(() => mod.annualMetrics({ rows: [row('2026-11-19', 50, 30, 10), row('2026-11-19', 50, 30, 10)] }, 2026, '2026-11-19'));
  assert.throws(() => mod.annualMetrics({ rows: [] }, 2025, '2026-11-19'));
});
test('annual percentage change is calculated against previous-year count', () => {
  assert.equal(mod.percentageVariation(140, 100), 40);
  assert.equal(mod.percentageVariation(75, 100), -25);
  assert.equal(mod.percentageVariation(0, 100), -100);
  assert.equal(mod.percentageVariation(0, 0), null);
  assert.equal(mod.percentageVariation(5, 0), null);
});
test('annual series map matching metrics with vertical mean', () => {
  const counts = (total, atendidas, abandonadas) => ({
    total, atendidas, abandonadas, nao_atendidas: total - atendidas - abandonadas, outras: 0,
  });
  const data = mod.annualComparison(counts(200, 120, 30), counts(100, 80, 10));
  assert.deepEqual(data.map(x => x.key), ['total', 'atendidas', 'abandonadas']);
  assert.equal(data[0].variation, 100);
  assert.equal(data[1].variation, 50);
  assert.equal(data[2].variation, 200);
  assert.equal(data[0].mean, 150);
});
test('mean line uses two annual observations when both years are available', () => {
  assert.equal(mod.availableAnnualMean(200, 100, true, true), 150);
  assert.equal(mod.availableAnnualMean(0, 100, true, true), 50);
});
test('with one observed year, mean reference is that year, not invented missing history', () => {
  assert.equal(mod.availableAnnualMean(53_436, 0, true, false), 53_436);
  assert.equal(mod.availableAnnualMean(0, 125, false, true), 125);
  assert.equal(mod.availableAnnualMean(0, 0, true, false), 0);
  assert.equal(mod.availableAnnualMean(0, 0, false, false), null);
  assert.throws(() => mod.availableAnnualMean(-1, 100, true, true));
});

test('extensions conform to LigSim chartcallsipdst documented envelope', () => {
  const data = mod.parseExtensionResponse({ data: { data: [
    { answered: '2001', total: 12, private: 'must-not-leak' },
    { answered: '2002', total: 120 },
  ], permissions: [] } });
  assert.deepEqual(data, [{ extension: '2002', answered: 120 }, { extension: '2001', answered: 12 }]);
});
test('empty extension report is distinguishable from invalid response', () => {
  assert.deepEqual(mod.parseExtensionResponse({ data: { data: [] } }), []);
  assert.throws(() => mod.parseExtensionResponse({ data: {} }));
});
for (const bad of [
  { data: { data: [{ answered: '2001', total: -2 }] } },
  { data: { data: [{ answered: '2001', total: '2' }] } },
  { data: { data: [{ answered: '2001', total: 1.5 }] } },
  { data: { data: [{ answered: '2001', total: 2 }, { answered: '2001', total: 3 }] } },
  { data: { data: [{ answered: '2001<script>', total: 2 }] } },
  { data: { data: [{ answered: '2001', total: Number.MAX_SAFE_INTEGER + 1 }] } },
  { data: { data: [null] } },
]) {
  test('reject malformed extension record', () => assert.throws(() => mod.parseExtensionResponse(bad)));
}
test('sanitized internal API rows keep exactly the validated extension and count', () => {
  const rows = mod.parsePublicExtensionRows({ rows: [
    { extension: '2001', answered: 8, secret: 'must not appear' },
    { extension: '2002', answered: 14 },
  ] });
  assert.deepEqual(rows, [{ extension: '2002', answered: 14 }, { extension: '2001', answered: 8 }]);
});
test('public ramal response rejects unexpected vendor field shape', () => {
  assert.throws(() => mod.parsePublicExtensionRows({ rows: [{ answered: '2001', total: 8 }] }));
  assert.throws(() => mod.parsePublicExtensionRows({ rows: [{ extension: '2001', answered: -1 }] }));
  assert.throws(() => mod.parsePublicExtensionRows({ rows: {} }));
});
test('SQL migration is guarded, non-destructive and includes both TEF definitions', () => {
  const sql = fs.readFileSync(path.join(root, 'docs/sql/tef-2026-11-19-guarded.sql'), 'utf8');
  for (const expected of ['BEGIN;', 'COMMIT;', 'AVG(r.tef)', 'dashboard_private.chamadas_tempos_por_dia',
    'dashboard_private.chamadas_tempos_e_filas', '90378552c08708ba38716db9001a0a6e',
    '7452654f11956d5718f4f2bbfd651562', 'tef >= 0']) assert.ok(sql.includes(expected), expected);
  assert.ok(!/DROP TABLE|DELETE FROM|TRUNCATE TABLE|ALTER TABLE|GRANT /i.test(sql));
});
