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
 const value=lib.buildEditorSnapshotView(rows,'all');
 assert.deepEqual(value.totals,{received:14,answered:8,abandoned:3,answerRate:8/14*100});
 assert.deepEqual(value.rows.map(row=>row.name),
 ['A - primeiro','M - transferencias','Z - sem movimento']);
 assert.equal(value.rows[2].answerRate,null);
 assert.equal(value.rows[2].received,0);
});

test('partial preview never changes the global totals',()=>{
 const many=Array.from({length:25},(_,i)=>queue(i+1,'Fila '+String(i).padStart(2,'0'),i+1,1,0));
 const all=lib.buildEditorSnapshotView(many,'all');
 for(const limit of [5,10,20]) {
  const value=lib.buildEditorSnapshotView(many,limit);
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
 assert.throws(()=>lib.buildEditorSnapshotView(rows,7));
});
