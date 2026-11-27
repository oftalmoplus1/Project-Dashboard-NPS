/** Stable V2 editor configuration, persisted inside the existing draft JSONB blocks. */
export type QueueSortField = 'name' | 'received' | 'answered' | 'abandoned' | 'answerRate';
export type QueueLimit = 5 | 10 | 20 | 'all';
export type QueueViewSettings = {
 selection: {mode:'all'} | {mode:'selected'; ids:number[]};
 sortBy: QueueSortField;
 direction: 'asc'|'desc';
 limit: QueueLimit;
};
export const DEFAULT_QUEUE_SETTINGS: QueueViewSettings = {
 selection: {mode:'all'}, sortBy:'name', direction:'asc', limit:10,
};
const exactKeys = (value:Record<string,unknown>, keys:string[]):boolean =>
 Object.keys(value).sort().join('|') === keys.slice().sort().join('|');
function record(value:unknown): value is Record<string,unknown> {
 return !!value && typeof value==='object' && !Array.isArray(value);
}
export function parseQueueViewSettings(value:unknown): QueueViewSettings|null {
 if (!record(value) || !exactKeys(value,['selection','sortBy','direction','limit'])
  || !record(value.selection) || !['name','received','answered','abandoned','answerRate'].includes(String(value.sortBy))
  || !['asc','desc'].includes(String(value.direction))
  || ![5,10,20,'all'].includes(value.limit as number|string)) return null;
 const selection=value.selection;
 if (selection.mode==='all') {
  if (!exactKeys(selection,['mode'])) return null;
 } else if (selection.mode==='selected') {
  if (!exactKeys(selection,['mode','ids']) || !Array.isArray(selection.ids)
   || selection.ids.length < 1 || selection.ids.length > 200
   || selection.ids.some(id=> !Number.isSafeInteger(id) || id < 1 || id > 2147483647)
   || new Set(selection.ids).size!==selection.ids.length) return null;
 } else return null;
 // PostgreSQL jsonb does not preserve object key insertion order. The layout
 // API compares normalized request/response payloads before acknowledging writes.
 // Return a canonical representation, not the caller's original object.
 const normalizedSelection: QueueViewSettings['selection'] = selection.mode === 'all'
  ? { mode: 'all' }
  : { mode: 'selected', ids: [...(selection.ids as number[])] };
 return {
  selection: normalizedSelection,
  sortBy: value.sortBy as QueueSortField,
  direction: value.direction as QueueViewSettings['direction'],
  limit: value.limit as QueueLimit,
 };
}
