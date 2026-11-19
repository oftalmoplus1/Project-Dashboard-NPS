import { parseAggregateRows, validateRange, type AggregateRow, type DateRange } from '../call-chart-data';

type Config = { url: string; publishableKey: string };
export class AggregateRequestError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
/** Read every page under the caller's JWT. Never use a service-role key here. */
export async function fetchCallAggregates(
  config: Config, token: string, range: DateRange, request: typeof fetch = fetch,
): Promise<AggregateRow[]> {
  validateRange(range);
  if (!token) throw new AggregateRequestError(401, 'Sessao necessaria.');
  const signal = AbortSignal.timeout(15000);
  const pageSize = 1000;
  const maxRows = 366 * 12;
  const all: unknown[] = [];
  let expected: number | null = null;
  for (let page = 0; page < 50; page++) {
    const url = new URL(config.url.replace(/\/$/, '') + '/rest/v1/rpc/dashboard_chamadas_agregadas');
    url.searchParams.set('order', 'periodo_inicio.asc');
    url.searchParams.set('offset', String(all.length));
    url.searchParams.set('limit', String(pageSize));
    const response = await request(url.toString(), {
      method: 'POST', cache: 'no-store', signal,
      headers: { apikey: config.publishableKey, Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json', Accept: 'application/json', Prefer: 'count=exact' },
      body: JSON.stringify({ p_inicio: range.start, p_fim: range.end }),
    });
    if (!response.ok) throw new AggregateRequestError(
      response.status === 401 || response.status === 403 ? 403 : 502, 'Consulta de chamadas indisponivel.',
    );
    const body: unknown = await response.json();
    if (!Array.isArray(body)) throw new AggregateRequestError(502, 'Resposta agregada invalida.');
    const header = response.headers.get('content-range');
    const match = header && /^(?:(\d+)-(\d+)|\*)\/(\d+)$/.exec(header);
    if (!match) throw new AggregateRequestError(502, 'Completude da consulta nao comprovada.');
    const total = Number(match[3]);
    if (!Number.isSafeInteger(total) || total > maxRows || (expected !== null && total !== expected)) {
      throw new AggregateRequestError(502, 'Conjunto agregado alterado durante a consulta.');
    }
    expected = total;
    if (total === 0 && body.length === 0 && all.length === 0) return [];
    if (!body.length || body.length > pageSize || Number(match[1]) !== all.length ||
        Number(match[2]) - Number(match[1]) + 1 !== body.length || all.length + body.length > total) {
      throw new AggregateRequestError(502, 'Pagina agregada incompleta ou inconsistente.');
    }
    all.push(...body);
    if (all.length === total) return parseAggregateRows({ rows: all }, range);
  }
  throw new AggregateRequestError(502, 'Limite de paginacao atingido; dados parciais rejeitados.');
}
