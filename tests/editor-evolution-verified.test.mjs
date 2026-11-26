import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-verified-'));
const compiler = createRequire(import.meta.url).resolve('typescript/lib/tsc.js');
execFileSync(process.execPath, [compiler, 'lib/editor-evolution-verified.ts',
 '--target', 'ES2022', '--module', 'commonjs', '--strict',
 '--skipLibCheck', '--lib', 'ES2022,DOM', '--outDir', tmp], { cwd: root });
const lib = (await import(pathToFileURL(path.join(tmp, 'editor-evolution-verified.js')).href)).default;
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const now = new Date('2026-11-26T15:00:00.000Z');
const config = {
 chart: 'line',
 period: { kind: 'fixed', start: '2026-11-23', end: '2026-11-26' },
 grouping: 'day',
 metrics: ['received', 'answered', 'abandoned'],
 queues: { mode: 'all' },
 presentation: 'consolidated',
 limit: 5,
 sort: { field: 'metric', direction: 'desc' },
};
const queues = [
 { id: 'a', name: 'Atendimento Geral' },
 { id: 'b', name: 'Agendamento' },
 { id: 'c', name: 'Exames' },
 { id: 'd', name: 'Financeiro' },
 { id: 'e', name: 'Informacoes' },
 { id: 'f', name: 'Retornos' },
];
const row = (queueId, bucket, received, answered, abandoned) =>
 ({ queueId, bucket, received, answered, abandoned });
const data = { queues, rows: [
 row('a','2026-11-23',3,2,1),
 row('a','2026-11-25',1,0,0),
 row('b','2026-11-23',2,2,0),
] };

test('strict request accepts seven presets, fixed dates and only three metrics', () => {
 for (const preset of ['last7','last30','last90','currentMonth',
  'previousMonth','currentYear','previousYear']) {
  assert.equal(lib.parseEvolutionConfig({ ...config,
   period: { kind: 'dynamic', preset } }, now).period.preset, preset);
 }
 assert.equal(lib.parseEvolutionConfig(config, now).chart, 'line');
 assert.throws(() => lib.parseEvolutionConfig({ ...config, sql: 'select * from auth.users' }, now));
 assert.throws(() => lib.parseEvolutionConfig({ ...config, period: { kind:'dynamic', preset:'last15' } }, now));
 assert.throws(() => lib.parseEvolutionConfig({ ...config, metrics: ['received','foo'] }, now));
 assert.throws(() => lib.parseEvolutionConfig({ ...config, metrics: ['received','received'] }, now));
 assert.throws(() => lib.parseEvolutionConfig({ ...config, period: { kind:'fixed',start:'2025-01-01',end:'2026-11-26' } }, now));
 assert.throws(() => lib.parseEvolutionConfig({ ...config, period: { kind:'fixed',start:'2026-11-27',end:'2026-11-26' } }, now));
});

test('queue selection is restricted and does not accept arbitrary fields', () => {
 assert.deepEqual(lib.parseEvolutionConfig({ ...config,
  queues: { mode:'selected', ids:['a','b'] } }, now).queues.ids, ['a','b']);
 for (const queues of [
  { mode:'all', ids:['a'] },
  { mode:'selected', ids:[] },
  { mode:'selected', ids:['a','a'] },
  { mode:'selected', ids:['a'], where: '1=1' },
  { mode:'selected', ids:['untrusted;drop table'] },
 ]) {
  assert.throws(() => lib.parseEvolutionConfig({ ...config, queues }, now));
 }
 assert.throws(() => lib.parseEvolutionConfig({ ...config,
  presentation:'byQueue', metrics:['received','answered'] }, now));
});

test('aggregate projection fills missing days with zero and preserves partial flag', () => {
 const result = lib.projectVerifiedEvolution(config, data, now);
 assert.equal(result.state, 'ready');
 assert.equal(result.period.partial, true);
 assert.deepEqual(result.buckets, ['2026-11-23','2026-11-24','2026-11-25','2026-11-26']);
 assert.deepEqual(result.series.find(s=>s.id==='received').values, [5,0,1,0]);
 assert.deepEqual(result.series.find(s=>s.id==='answered').values, [4,0,0,0]);
 assert.deepEqual(result.series.find(s=>s.id==='abandoned').values, [1,0,0,0]);
 assert.equal(result.shownQueues.length, 6); // No limit on consolidated totals.
});

test('empty history does not masquerade as an all-zero graph', () => {
 const result = lib.projectVerifiedEvolution(config, { queues, rows: [] }, now);
 assert.equal(result.state, 'empty');
 assert.deepEqual(result.series, []);
 assert.deepEqual(result.buckets, []);
});

test('separated queues rank by whole-period metric before applying limit', () => {
 const input = { ...config, presentation: 'byQueue', metrics: ['received'] };
 const payload = { queues, rows: queues.map((q,i) => row(q.id,'2026-11-23',i+1,0,0)) };
 const result = lib.projectVerifiedEvolution(input,payload,now);
 assert.deepEqual(result.shownQueues,['f','e','d','c','b']);
 assert.deepEqual(result.series[0].values,[6,0,0,0]);
 const ascending = lib.projectVerifiedEvolution({ ...input,
  sort: { field: 'metric', direction: 'asc' }, limit: 'all' }, payload, now);
 assert.deepEqual(ascending.shownQueues,['a','b','c','d','e','f']);
 const byName = lib.projectVerifiedEvolution({ ...input,
  sort: { field: 'name', direction: 'asc' }, limit: 20 }, payload, now);
 assert.deepEqual(byName.shownQueues,['b','a','c','d','e','f']);
});

test('weekly buckets start on Monday and months start on day 1', () => {
 const weekly = { ...config, grouping:'week',
  period:{ kind:'fixed',start:'2026-11-20',end:'2026-12-02' } };
 const w = lib.projectVerifiedEvolution(weekly,{queues,rows:[
  row('a','2026-11-16',1,1,0),row('a','2026-11-30',1,0,0)]}, now);
 assert.deepEqual(w.buckets,['2026-11-16','2026-11-23','2026-11-30']);
 assert.deepEqual(w.series[0].values,[1,0,1]);
 const monthly={...config,grouping:'month',
  period:{kind:'fixed',start:'2026-10-27',end:'2026-12-01'}};
 const m=lib.projectVerifiedEvolution(monthly,{queues,rows:[row('a','2026-10-01',1,1,0)]},now);
 assert.deepEqual(m.buckets,['2026-10-01','2026-11-01','2026-12-01']);
 assert.deepEqual(m.series[0].values,[1,0,0]);
});

test('dynamic month on first day is empty only with verified empty response', () => {
 const month = {...config,period:{kind:'dynamic',preset:'currentMonth'}};
 const first = new Date('2026-11-01T14:00:00Z');
 assert.equal(lib.projectVerifiedEvolution(month,{queues,rows:[]},first).state,'empty');
 assert.throws(()=>lib.projectVerifiedEvolution(month,{queues,rows:[row('a','2026-11-01',1,1,0)]},first));
});

test('refuse unknown queues, unauthorized selection, duplicate buckets and invalid counts', () => {
 const fixed = { ...config, queues:{mode:'selected',ids:['a']} };
 assert.throws(()=>lib.projectVerifiedEvolution(fixed,data,now)); // RPC returned unselected b
 assert.throws(()=>lib.projectVerifiedEvolution({ ...config,
  queues:{mode:'selected',ids:['secret']} },{queues,rows:[]},now));
 const bad = [
  {queues,rows:[row('unknown','2026-11-23',1,0,0)]},
  {queues,rows:[row('a','2026-11-23',1,0,0),row('a','2026-11-23',1,0,0)]},
  {queues,rows:[row('a','2026-11-23',1,2,0)]},
  {queues,rows:[row('a','2026-11-23','1',0,0)]},
  {queues,rows:[row('a','2026-11-23',0,0,-1)]},
  {queues,rows:[row('a','2026-11-27',1,1,0)]},
  {queues,rows:[row('a','2026-11-24',1,0,0),row('a','2026-11-25',1,0,0)], extra:'leak'},
  {queues:[{id:'a',name:'x'},{id:'a',name:'y'}],rows:[]},
  {queues,rows:[{...row('a','2026-11-23',1,0,0), phone:'+55 00 0000'}]},
 ];
 for(const payload of bad) assert.throws(()=>lib.projectVerifiedEvolution(config,payload,now));
 assert.throws(()=>lib.projectVerifiedEvolution({...config,grouping:'week'},{
  queues,rows:[row('a','2026-11-24',1,1,0)]},now)); // Not Monday
});

test('same local civil day is stable; no data beyond scope accepted', () => {
 const valid = { queues, rows:[row('a','2026-11-26',1,1,0)] };
 assert.equal(lib.projectVerifiedEvolution(config,valid,now).series[0].values[3],1);
 const invalid = { queues, rows:[row('a','2026-12-01',1,1,0)] };
 assert.throws(()=>lib.projectVerifiedEvolution(config,invalid,now));
});
