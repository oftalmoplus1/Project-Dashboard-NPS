import {
 EDITOR_MAX_BLOCKS, isVisualKind, validLayout, type VisualBlock, type VisualSource,
} from './editor-visual-layout';

/** Layout payload is *configuration*, never operational data or executable SQL. */
export type EditorLayoutSnapshot = { revision: number; blocks: VisualBlock[] };

const SOURCE_METRICS: Record<Exclude<VisualSource, null>, readonly string[]> = {
 listar_filas: ['received', 'answered', 'waiting_calls', 'abandon_less_30s',
  'abandon_more_30s', 'tma', 'tme'],
 relatorio_chamadas: ['quantidade_chamadas'],
};

const KEYS = ['id', 'kind', 'title', 'x', 'y', 'w', 'h',
 'source', 'metric', 'chartOrientation', 'text'].sort();

/** Strict on purpose: no rogue graph fields, query strings, scripts or user-selected SQL. */
export function parseEditorBlocks(value: unknown): VisualBlock[] | null {
 if (!Array.isArray(value) || value.length > EDITOR_MAX_BLOCKS) return null;
 const blocks: VisualBlock[] = [];
 for (const entry of value) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const row = entry as Record<string, unknown>;
  if (JSON.stringify(Object.keys(row).sort()) !== JSON.stringify(KEYS)) return null;
  if (typeof row.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(row.id)
   || !isVisualKind(row.kind)
   || typeof row.title !== 'string' || row.title.length > 80
   || !['x', 'y', 'w', 'h'].every(key => Number.isSafeInteger(row[key]))
   || !(row.source === null || row.source === 'listar_filas' || row.source === 'relatorio_chamadas')
   || typeof row.metric !== 'string'
   || (row.chartOrientation !== 'vertical' && row.chartOrientation !== 'horizontal')
   || typeof row.text !== 'string' || row.text.length > 2000) return null;

  const source = row.source as VisualSource;
  const metric = row.metric as string;
  if (source === null ? metric !== '' : metric !== '' && !SOURCE_METRICS[source].includes(metric)) return null;
  if (row.kind === 'text' && (source !== null || metric !== '')) return null;
  blocks.push({
   id: row.id, kind: row.kind, title: row.title,
   x: row.x as number, y: row.y as number, w: row.w as number, h: row.h as number,
   source, metric, chartOrientation: row.chartOrientation, text: row.text,
  });
 }
 return validLayout(blocks) ? blocks : null;
}

export function parseEditorLayoutSnapshot(value: unknown): EditorLayoutSnapshot | null {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
 const row = value as Record<string, unknown>;
 if (!Number.isSafeInteger(row.revision) || (row.revision as number) < 0) return null;
 const blocks = parseEditorBlocks(row.blocks);
 return blocks === null ? null : { revision: row.revision as number, blocks };
}
