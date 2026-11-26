import type { QueueViewSettings } from './editor-queue-settings';

/**
 * Editor Visual / Fase 3A: modelagem do layout local e deterministica.
 * Nao armazena dados de chamadas, nao gera consultas SQL ou publicacoes.
 */
export const EDITOR_COLUMNS = 12;
export const EDITOR_MAX_ROWS = 50;
export const EDITOR_MAX_BLOCKS = 40;

export type VisualKind =
  | 'kpi' | 'line' | 'bar' | 'area' | 'pie' | 'donut' | 'table' | 'text';

export type VisualSource = 'listar_filas' | 'relatorio_chamadas' | null;
export type VisualBlock = {
 id: string;
 kind: VisualKind;
 title: string;
 x: number;
 y: number;
 w: number;
 h: number;
 source: VisualSource;
 metric: string;
 chartOrientation: 'vertical' | 'horizontal';
 text: string;
 /** Present only for V2 queue-configured blocks; legacy 11-field blocks remain valid. */
 queueConfig?: QueueViewSettings;
};

export const VISUAL_COMPONENTS: ReadonlyArray<{
 kind: VisualKind; label: string; description: string; width: number; height: number
}> = [
 { kind: 'kpi', label: 'Cartão KPI', description: 'Indicador numérico', width: 3, height: 2 },
 { kind: 'line', label: 'Linhas', description: 'Tendência temporal', width: 6, height: 4 },
 { kind: 'bar', label: 'Barras', description: 'Comparação de categorias', width: 6, height: 4 },
 { kind: 'area', label: 'Área', description: 'Evolução acumulada', width: 6, height: 4 },
 { kind: 'pie', label: 'Pizza', description: 'Distribuição proporcional', width: 4, height: 4 },
 { kind: 'donut', label: 'Rosca', description: 'Composição percentual', width: 4, height: 4 },
 { kind: 'table', label: 'Tabela', description: 'Valores em linhas', width: 8, height: 4 },
 { kind: 'text', label: 'Texto', description: 'Anotações e contexto', width: 4, height: 2 },
];

export const VISUAL_KINDS = VISUAL_COMPONENTS.map(component => component.kind);
export function isVisualKind(value: unknown): value is VisualKind {
 return typeof value === 'string' && VISUAL_KINDS.some(kind => kind === value);
}

export function overlap(a: Pick<VisualBlock, 'x' | 'y' | 'w' | 'h'>,
 b: Pick<VisualBlock, 'x' | 'y' | 'w' | 'h'>): boolean {
 return a.x < b.x + b.w && a.x + a.w > b.x
  && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function validFrame(frame: Pick<VisualBlock, 'x' | 'y' | 'w' | 'h'>): boolean {
 return [frame.x, frame.y, frame.w, frame.h].every(Number.isInteger)
  && frame.w >= 2 && frame.h >= 2
  && frame.x >= 0 && frame.y >= 0
  && frame.x + frame.w <= EDITOR_COLUMNS
  && frame.y + frame.h <= EDITOR_MAX_ROWS;
}

export function validLayout(blocks: readonly VisualBlock[]): boolean {
 if (blocks.length > EDITOR_MAX_BLOCKS || new Set(blocks.map(block => block.id)).size !== blocks.length) return false;
 return blocks.every((block, index) => validFrame(block)
  && !blocks.slice(index + 1).some(other => overlap(block, other)));
}

function nearestFree(
 otherBlocks: readonly VisualBlock[],
 size: Pick<VisualBlock, 'w' | 'h'>,
 desiredX: number,
 desiredY: number
): { x: number; y: number } | null {
 const x0 = Math.max(0, Math.min(EDITOR_COLUMNS - size.w, Math.round(desiredX)));
 const y0 = Math.max(0, Math.min(EDITOR_MAX_ROWS - size.h, Math.round(desiredY)));
 // Testa inicialmente a celula solicitada; se ocupada, desce de linha
 // sem sobrepor outros componentes.
 const order = [...Array(EDITOR_COLUMNS - size.w + 1).keys()]
  .sort((a, b) => Math.abs(a - x0) - Math.abs(b - x0) || a - b);
 for (let y = y0; y <= EDITOR_MAX_ROWS - size.h; y++) {
  for (const x of order) {
   const frame = { x, y, ...size };
   if (!otherBlocks.some(block => overlap(frame, block))) return { x, y };
  }
 }
 return null;
}

/** Returns original layout if the canvas is full. */
export function addVisualBlock(
 current: readonly VisualBlock[], kind: VisualKind, id: string, x = 0, y = 0
): VisualBlock[] {
 if (!id || current.length >= EDITOR_MAX_BLOCKS || current.some(block => block.id === id)) return [...current];
 const metadata = VISUAL_COMPONENTS.find(component => component.kind === kind);
 if (!metadata) return [...current];
 const spot = nearestFree(current, { w: metadata.width, h: metadata.height }, x, y);
 if (!spot) return [...current];
 const result: VisualBlock[] = [...current, {
  id, kind, title: metadata.label, ...spot, w: metadata.width, h: metadata.height,
  source: null, metric: '', chartOrientation: 'vertical', text: ''
 }];
 return result;
}

export function moveVisualBlock(
 current: readonly VisualBlock[], id: string, x: number, y: number
): VisualBlock[] {
 const target = current.find(block => block.id === id);
 if (!target) return [...current];
 const spot = nearestFree(current.filter(block => block.id !== id), target, x, y);
 if (!spot) return [...current];
 return current.map(block => block.id === id ? { ...block, ...spot } : block);
}

export function resizeVisualBlock(
 current: readonly VisualBlock[], id: string, width: number, height: number
): VisualBlock[] {
 const target = current.find(block => block.id === id);
 if (!target) return [...current];
 const frame = {
  x: target.x, y: target.y,
  w: Math.max(2, Math.min(EDITOR_COLUMNS - target.x, Math.round(width))),
  h: Math.max(2, Math.min(EDITOR_MAX_ROWS - target.y, Math.round(height))),
 };
 if (!validFrame(frame) || current.some(block => block.id !== id && overlap(frame, block))) {
  return [...current];
 }
 return current.map(block => block.id === id ? { ...block, ...frame } : block);
}

export function setVisualBlock(
 current: readonly VisualBlock[], id: string, changes: Partial<Pick<VisualBlock,
 'title' | 'source' | 'metric' | 'chartOrientation' | 'text' | 'queueConfig'>>
): VisualBlock[] {
 return current.map(block => {
  if (block.id !== id) return block;
  const updated = {
   ...block, ...changes,
   title: typeof changes.title === 'string' ? changes.title.slice(0, 80) : block.title,
   text: typeof changes.text === 'string' ? changes.text.slice(0, 2000) : block.text,
  };
  // Never persist queue settings on nonqueue components.
  if (updated.source !== 'listar_filas' || !['kpi','table','bar'].includes(updated.kind)
    || updated.queueConfig === undefined) delete updated.queueConfig;
  return updated;
 });
}
