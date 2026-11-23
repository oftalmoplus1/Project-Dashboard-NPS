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
