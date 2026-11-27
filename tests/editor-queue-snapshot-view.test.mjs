import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-queue-snapshot-view-'));
const compiler = createRequire(import.meta.url).resolve('typescript/lib/tsc.js');
execFileSync(process.execPath,[compiler,'lib/editor-queue-snapshot-view.ts',
 '--target','ES2022','--module','commonjs','--strict','--skipLibCheck','--outDir',tmp],{cwd:root});
const lib = (await import(pathToFileURL(path.join(tmp,'editor-queue-snapshot-view.js')).href)).default;
const settings = (await import(pathToFileURL(path.join(tmp,'editor-queue-settings.js')).href)).default;
const cfg = (changes={}) => ({ ...settings.DEFAULT_QUEUE_SETTINGS, ...changes });
after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
const queue=(id,name,received,answered,abandoned)=>({
 id,name,received,answered,abandoned,waiting:0,tma:null,tme:null,
});
const rows=[
 queue(2,'Z - sem movimento',0,0,0),
 queue(1,'A - primeiro',10,7,3),
 queue(3,'M - transferencias',4,1,0),
];

test('snapshot sums all real abandonments and preserves unmatched transfers',()=>{
 const value=lib.buildEditorSnapshotView(rows,cfg({limit:'all'}));
 assert.deepEqual(value.totals,{received:14,answered:8,abandoned:3,answerRate:8/14*100});
 assert.deepEqual(value.rows.map(row=>row.name),
 ['A - primeiro','M - transferencias','Z - sem movimento']);
 assert.equal(value.rows[2].answerRate,null);
 assert.equal(value.rows[2].received,0);
});

test('partial preview never changes the global totals',()=>{
 const many=Array.from({length:25},(_,i)=>queue(i+1,'Fila '+String(i).padStart(2,'0'),i+1,1,0));
 const all=lib.buildEditorSnapshotView(many,cfg({limit:'all'}));
 for(const limit of [5,10,20]) {
  const value=lib.buildEditorSnapshotView(many,cfg({limit}));
  assert.equal(value.rows.length,limit);
  assert.equal(value.truncated,true);
  assert.equal(value.totalQueues,25);
  assert.deepEqual(value.totals,all.totals);
 }
});

test('zero-activity queues remain visible and have unavailable rate',()=>{
 const result=lib.buildEditorSnapshotView([queue(1,'Fila sem chamadas',0,0,0)]);
 assert.equal(result.rows.length,1);
 assert.equal(result.rows[0].answerRate,null);
 assert.equal(result.totals.answerRate,null);
});

test('reject invalid duplicates, counters, and oversized responses',()=>{
 const invalids=[
 [],
 [rows[0],rows[0]],
 [queue(1,'X',2,3,0)],
 [queue(1,'X',2,1,2)],
 [queue(1,'X',-1,0,0)],
 [queue(1,'X',1.5,1,0)],
 [queue(1,'',1,0,0)],
 Array.from({length:201},(_,i)=>queue(i+1,'F'+i,0,0,0)),
 ];
 for(const value of invalids)assert.throws(()=>lib.buildEditorSnapshotView(value));
 assert.throws(()=>lib.buildEditorSnapshotView(rows,cfg({limit:7})));
});

test('select one, many or all; authorized new queues join all only',()=>{
 const one=lib.buildEditorSnapshotView(rows,cfg({
  selection:{mode:'selected',ids:[1]},limit:'all',
 }));
 assert.deepEqual(one.rows.map(row=>row.id),[1]);
 assert.deepEqual(one.totals,{received:10,answered:7,abandoned:3,answerRate:70});
 const many=lib.buildEditorSnapshotView(rows,cfg({
  selection:{mode:'selected',ids:[1,2]},sortBy:'received',direction:'desc',limit:'all',
 }));
 assert.deepEqual(many.rows.map(row=>row.id),[1,2]);
 assert.equal(many.totals.received,10);
 assert.equal(many.rows[1].answerRate,null);
 assert.equal(lib.buildEditorSnapshotView([...rows,queue(4,'Nova fila',5,3,1)],cfg()).totalQueues,4);
 const missing=lib.buildEditorSnapshotView(rows,cfg({selection:{mode:'selected',ids:[1,999]}}));
 assert.equal(missing.missingSelectedCount,1);
 assert.deepEqual(missing.rows.map(row=>row.id),[1]);
});

test('sort ascending/descending by metric and keep undefined rates last',()=>{
 const asc=lib.buildEditorSnapshotView(rows,cfg({sortBy:'received',direction:'asc',limit:'all'}));
 const desc=lib.buildEditorSnapshotView(rows,cfg({sortBy:'received',direction:'desc',limit:'all'}));
 assert.deepEqual(asc.rows.map(row=>row.id),[2,3,1]);
 assert.deepEqual(desc.rows.map(row=>row.id),[1,3,2]);
 const rates=lib.buildEditorSnapshotView(rows,cfg({sortBy:'answerRate',direction:'desc',limit:'all'}));
 assert.deepEqual(rates.rows.map(row=>row.id),[1,3,2]);
});

test('strict nested queue settings reject malformed sources and extra keys',()=>{
 const valid=cfg({selection:{mode:'selected',ids:[1,2]},sortBy:'abandoned',limit:20});
 assert.deepEqual(settings.parseQueueViewSettings(valid),valid);
 const invalid=[
  cfg({selection:{mode:'selected',ids:[]}}),
  cfg({selection:{mode:'selected',ids:[1,1]}}),
  cfg({selection:{mode:'selected',ids:[0]}}),
  cfg({selection:{mode:'selected',ids:['1']}}),
  cfg({selection:{mode:'all',ids:[1]}}),
  cfg({direction:'down'}),
  cfg({sortBy:'SQL'}),
  cfg({limit:100}),
  {...valid,sql:'DROP TABLE x'},
  {...valid,selection:{mode:'selected',ids:[1],where:'true'}},
 ];
 for(const bad of invalid) {
  assert.equal(settings.parseQueueViewSettings(bad),null);
  assert.throws(()=>lib.buildEditorSnapshotView(rows,bad));
 }
});


test('jsonb object key reordering does not change normalized persisted queue settings',()=>{
 const sent={
  selection:{mode:'selected',ids:[1,2]},
  sortBy:'received',direction:'desc',limit:20,
 };
 // PostgreSQL jsonb reorders object keys but preserves their meaning.
 const postgres={
  limit:20,sortBy:'received',direction:'desc',
  selection:{ids:[1,2],mode:'selected'},
 };
 assert.notEqual(JSON.stringify(sent),JSON.stringify(postgres));
 const a=settings.parseQueueViewSettings(sent);
 const b=settings.parseQueueViewSettings(postgres);
 assert.deepEqual(a,b);
 assert.equal(JSON.stringify(a),JSON.stringify(b));
 assert.deepEqual(a,sent);
 assert.notStrictEqual(a,sent);
 assert.notStrictEqual(a.selection,sent.selection);
});
test('jsonb mode all key order is normalized, without losing new queues',()=>{
 const pg={sortBy:'answerRate',limit:'all',selection:{mode:'all'},direction:'asc'};
 const parsed=settings.parseQueueViewSettings(pg);
 assert.deepEqual(parsed,{selection:{mode:'all'},sortBy:'answerRate',direction:'asc',limit:'all'});
 assert.equal(lib.buildEditorSnapshotView(rows,parsed).totalQueues,3);
});
