import type { QueueSnapshot } from './ligsim-queue-snapshot';
import {
 DEFAULT_QUEUE_SETTINGS, parseQueueViewSettings, type QueueViewSettings,
} from './editor-queue-settings';

/**
 * Projection of the latest validated snapshot, NEVER of a time interval.
 * All queue visibility is limited to the authorized rows returned by the RPC.
 */
export type SnapshotMetric = 'received' | 'answered' | 'abandoned';
export type SnapshotQueueRow = Pick<QueueSnapshot, 'id'|'name'|'received'|'answered'|'abandoned'> & {
 answerRate: number | null;
};

function safeSum(a:number,b:number):number {
 const result = a+b;
 if (!Number.isSafeInteger(result)) throw new Error('Soma de filas fora do limite.');
 return result;
}

export function buildEditorSnapshotView(
 source: readonly QueueSnapshot[],
 config: QueueViewSettings = DEFAULT_QUEUE_SETTINGS,
): {
 rows: SnapshotQueueRow[];
 totalQueues: number;
 truncated: boolean;
 missingSelectedCount: number;
 totals: {received:number;answered:number;abandoned:number;answerRate:number|null};
} {
 if (!parseQueueViewSettings(config) || !Array.isArray(source)
  || source.length < 1 || source.length > 200) throw new Error('Snapshot ou filtro inválido.');
 const seen = new Set<number>();
 const available = source.map((row):SnapshotQueueRow=>{
  if (!row || !Number.isSafeInteger(row.id) || row.id<1 || row.id>2147483647
   || seen.has(row.id) || typeof row.name !== 'string' || !row.name.trim()
   || row.name.length>120 || ![row.received,row.answered,row.abandoned].every(n=>
     Number.isSafeInteger(n) && n>=0)
   || safeSum(row.answered,row.abandoned)>row.received) throw new Error('Fila inválida.');
  seen.add(row.id);
  return { id:row.id,name:row.name,received:row.received,answered:row.answered,
   abandoned:row.abandoned,answerRate:row.received===0?null:row.answered/row.received*100};
 });
 const ids = config.selection.mode === 'selected' ? new Set(config.selection.ids) : null;
 const selected = ids ? available.filter(row=>ids.has(row.id)) : available;
 const missingSelectedCount = ids ? config.selection.ids.filter(id=>!seen.has(id)).length : 0;
 const totals=selected.reduce((acc,row)=>({
  received:safeSum(acc.received,row.received),
  answered:safeSum(acc.answered,row.answered),
  abandoned:safeSum(acc.abandoned,row.abandoned),
 }),{received:0,answered:0,abandoned:0});
 const byName=(a:SnapshotQueueRow,b:SnapshotQueueRow)=>
  a.name.localeCompare(b.name,'pt-BR') || a.id-b.id;
 selected.sort((a,b)=>{
  if(config.sortBy==='name') return byName(a,b)*(config.direction==='asc'?1:-1);
  const av=a[config.sortBy], bv=b[config.sortBy];
  // N/A always stays last, independent of direction.
  if(av===null) return bv===null?byName(a,b):1;
  if(bv===null) return -1;
  const diff=(av as number)-(bv as number);
  return diff!==0 ? diff*(config.direction==='asc'?1:-1):byName(a,b);
 });
 const limited = config.limit==='all' ? selected : selected.slice(0,config.limit);
 return {
  rows:limited,totalQueues:selected.length,
  truncated:limited.length<selected.length,missingSelectedCount,
  totals:{...totals,answerRate:totals.received===0?null:totals.answered/totals.received*100},
 };
}
export const SNAPSHOT_METRICS:readonly SnapshotMetric[]=['received','answered','abandoned'];
export function editorMetricLabel(metric:SnapshotMetric):string {
 switch(metric) {
  case 'received':return 'Recebidas';
  case 'answered':return 'Atendidas';
  case 'abandoned':return 'Abandonadas';
 }
}
