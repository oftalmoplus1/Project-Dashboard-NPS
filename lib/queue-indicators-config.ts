/**
 * Contrato de configuracao de indicadores por fila (MVP).
 * Independente das RPCs existentes: nao faz consultas e nao modifica layouts antigos.
 * So deve ser conectado ao editor depois da migracao/validacao do contrato persistido.
 */
export type QueueMetric = 'received' | 'answered' | 'abandoned' | 'serviceRate';
export type QueueSortField = 'name' | QueueMetric;
export type QueueDisplayLimit = 5 | 10 | 20 | 'all';
export type QueueSelection = { mode: 'all' } | { mode: 'selected'; ids: string[] };
export type QueueIndicatorsConfig = {
  startDate: string;
  endDate: string;
  selection: QueueSelection;
  sortBy: QueueSortField;
  sortDirection: 'asc' | 'desc';
  limit: QueueDisplayLimit;
  visualization: 'table' | 'bar';
  orientation: 'vertical' | 'horizontal';
};
export type QueueIndicatorsRow = {
  id: string;
  name: string;
  received: number;
  answered: number;
  abandoned: number;
  serviceRate: number | null;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const QUEUE_ID_PATTERN = /^[a-zA-Z0-9_.:-]{1,128}$/;
const SORT_FIELDS: readonly QueueSortField[] = [
  'name', 'received', 'answered', 'abandoned', 'serviceRate',
];
const LIMITS: readonly QueueDisplayLimit[] = [5, 10, 20, 'all'];

function civilDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 9999) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Rejects untrusted configuration rather than silently changing user intent. */
export function parseQueueIndicatorsConfig(input: unknown): QueueIndicatorsConfig | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const row = input as Record<string, unknown>;
  const expected = ['startDate', 'endDate', 'selection', 'sortBy', 'sortDirection',
    'limit', 'visualization', 'orientation'].sort();
  if (JSON.stringify(Object.keys(row).sort()) !== JSON.stringify(expected) ||
    !civilDate(row.startDate) || !civilDate(row.endDate) || row.startDate > row.endDate ||
    !SORT_FIELDS.includes(row.sortBy as QueueSortField) ||
    !LIMITS.includes(row.limit as QueueDisplayLimit) ||
    (row.sortDirection !== 'asc' && row.sortDirection !== 'desc') ||
    (row.visualization !== 'table' && row.visualization !== 'bar') ||
    (row.orientation !== 'vertical' && row.orientation !== 'horizontal')) return null;

  const selection = row.selection;
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) return null;
  const selected = selection as Record<string, unknown>;
  if (selected.mode === 'all') {
    if (Object.keys(selected).length !== 1) return null;
  } else if (selected.mode === 'selected') {
    if (Object.keys(selected).sort().join(',') !== 'ids,mode' ||
      !Array.isArray(selected.ids) || selected.ids.length < 1 ||
      selected.ids.length > 1000 ||
      !selected.ids.every((id: unknown) => typeof id === 'string' && QUEUE_ID_PATTERN.test(id)) ||
      new Set(selected.ids).size !== selected.ids.length) return null;
  } else return null;

  return input as QueueIndicatorsConfig;
}

export function makeQueueIndicatorsRow(
  id: string, name: string, received: number, answered: number, abandoned: number,
): QueueIndicatorsRow {
  if (!QUEUE_ID_PATTERN.test(id) || typeof name !== 'string' || !name.trim() ||
    name.length > 160 || ![received, answered, abandoned].every(n =>
      Number.isSafeInteger(n) && n >= 0)) {
    throw new Error('Dados da fila invalidos.');
  }
  if (answered > received || abandoned > received) {
    throw new Error('Contadores da fila inconsistentes.');
  }
  return { id, name, received, answered, abandoned,
    serviceRate: received === 0 ? null : (answered / received) * 100 };
}

/**
 * Recebe apenas filas ja autorizadas pelo servidor, inclusive as sem movimento.
 * O modo all inclui automaticamente novas filas fornecidas pela lista autorizada.
 */
export function selectQueueIndicators(
  authorizedRows: readonly QueueIndicatorsRow[], config: QueueIndicatorsConfig,
): QueueIndicatorsRow[] {
  const allowed = config.selection.mode === 'all'
    ? null : new Set(config.selection.ids);
  const filtered = authorizedRows.filter(row => allowed === null || allowed.has(row.id));
  const direction = config.sortDirection === 'asc' ? 1 : -1;
  const sorted = [...filtered].sort((a, b) => {
    const field = config.sortBy;
    let comparison: number;
    if (field === 'name') comparison = a.name.localeCompare(b.name, 'pt-BR');
    else {
      const aValue = a[field];
      const bValue = b[field];
      comparison = aValue === null ? (bValue === null ? 0 : 1) :
        bValue === null ? -1 : aValue - bValue;
    }
    return comparison * direction || a.name.localeCompare(b.name, 'pt-BR') ||
      a.id.localeCompare(b.id);
  });
  return config.limit === 'all' ? sorted : sorted.slice(0, config.limit);
}
