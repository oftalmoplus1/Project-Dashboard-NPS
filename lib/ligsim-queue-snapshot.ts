/**
 * LigSim /v2/queues is a mutable snapshot, not a historical call log.
 * Do not infer hourly breakdown, NO ANSWER or daily increments from these fields.
 */
export type QueueSnapshot = {
  id: number;
  name: string;
  received: number;
  answered: number;
  abandoned: number;
  waiting: number;
};
export type QueueSummary = {
  total: number;
  answered: number;
  abandoned: number;
  unanswered: null;
  other: null;
  answerRate: number | null;
  abandonRate: number | null;
};

function whole(value: unknown, key: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('Valor invalido no resumo da fila: ' + key);
  }
  return value;
}
function addSafe(a: number, b: number): number {
  const sum = a + b;
  if (!Number.isSafeInteger(sum)) throw new Error('Soma de filas fora de limite');
  return sum;
}

/** Strict public projection of table listar_filas; never return agents or member data. */
export function parseQueueSnapshot(payload: unknown): { rows: QueueSnapshot[]; summary: QueueSummary } {
  if (!Array.isArray(payload) || !payload.length || payload.length > 200) {
    throw new Error('Snapshot de filas vazio ou incompleto.');
  }
  const seen = new Set<number>();
  const rows = payload.map((item): QueueSnapshot => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('Registro de fila invalido.');
    }
    const raw = item as Record<string, unknown>;
    const id = whole(raw.id, 'id');
    const name = raw.name;
    if (id < 1 || seen.has(id) || typeof name !== 'string' ||
        name.trim().length === 0 || name.length > 120) {
      throw new Error('Identificacao de fila invalida ou duplicada.');
    }
    seen.add(id);
    const received = whole(raw.received, 'received');
    const answered = whole(raw.answered, 'answered');
    const abandonOver = whole(raw.abandon_more_30s, 'abandon_more_30s');
    const abandonUnder = whole(raw.abandon_less_30s, 'abandon_less_30s');
    const waiting = whole(raw.waiting_calls, 'waiting_calls');
    const abandoned = addSafe(abandonOver, abandonUnder);
    if (answered > received || abandoned > received || addSafe(answered, abandoned) > received) {
      throw new Error('Totais de fila inconsistentes; verificacao na origem necessaria.');
    }
    return { id, name: name.trim(), received, answered, abandoned, waiting };
  });
  rows.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || a.id - b.id);
  const totals = rows.reduce((sum, row) => ({
    total: addSafe(sum.total, row.received),
    answered: addSafe(sum.answered, row.answered),
    abandoned: addSafe(sum.abandoned, row.abandoned),
  }), { total: 0, answered: 0, abandoned: 0 });
  return { rows, summary: {
    ...totals,
    unanswered: null,
    other: null,
    answerRate: totals.total === 0 ? null : totals.answered / totals.total * 100,
    abandonRate: totals.total === 0 ? null : totals.abandoned / totals.total * 100,
  } };
}

/** Validate public API response before using it to render the daily dashboard. */
export function parseQueueApiResponse(payload: unknown): { rows: QueueSnapshot[]; summary: QueueSummary; consultedAt: string; sourceUpdatedAt: string } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Resposta de filas invalida');
  }
  const obj = payload as Record<string, unknown>;
  if (obj.source !== 'listar_filas' || obj.kind !== 'latest_snapshot' ||
      typeof obj.consultedAt !== 'string' || !Number.isFinite(Date.parse(obj.consultedAt)) ||
      typeof obj.sourceUpdatedAt !== 'string' || !Number.isFinite(Date.parse(obj.sourceUpdatedAt))) {
    throw new Error('Origem ou consulta de filas nao verificadas');
  }
  if (!Array.isArray(obj.rows)) throw new Error('Filas ausentes na resposta');
  const normalized = obj.rows.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('Registro publico de fila invalido');
    }
    const row = raw as Record<string, unknown>;
    return {
      id: row.id, name: row.name,
      received: row.received, answered: row.answered,
      abandon_more_30s: row.abandoned, abandon_less_30s: 0,
      waiting_calls: row.waiting,
    };
  });
  const result = parseQueueSnapshot(normalized);
  if (!obj.summary || typeof obj.summary !== 'object' || Array.isArray(obj.summary)) {
    throw new Error('Resumo de filas ausente');
  }
  const actual = obj.summary as Record<string, unknown>;
  for (const key of ['total', 'answered', 'abandoned']) {
    if (actual[key] !== result.summary[key as 'total' | 'answered' | 'abandoned']) {
      throw new Error('Resumo de filas inconsistente');
    }
  }
  return { ...result, consultedAt: obj.consultedAt, sourceUpdatedAt: obj.sourceUpdatedAt };
}
