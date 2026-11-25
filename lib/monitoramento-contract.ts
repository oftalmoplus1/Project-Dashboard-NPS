import { parseEditorBlocks, type EditorLayoutSnapshot } from './editor-layout-contract';

export type PublishedSummary = {
 dashboard_id: string;
 nome: string;
 descricao: string | null;
 topico_nome: string;
 versao: number;
 publicado_em: string;
};
export type PublishedDashboard = PublishedSummary & { blocos: EditorLayoutSnapshot['blocks'] };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const own = (value: unknown): value is Record<string, unknown> =>
 value !== null && typeof value === 'object' && !Array.isArray(value);

export function parsePublishedSummary(value: unknown): PublishedSummary | null {
 if (!own(value)) return null;
 if (typeof value.dashboard_id !== 'string' || !uuid.test(value.dashboard_id)
  || typeof value.nome !== 'string' || !value.nome.trim() || value.nome.length > 120
  || !(value.descricao === null || (typeof value.descricao === 'string' && value.descricao.length <= 500))
  || typeof value.topico_nome !== 'string' || !value.topico_nome.trim() || value.topico_nome.length > 120
  || !Number.isSafeInteger(value.versao) || (value.versao as number) < 1
  || typeof value.publicado_em !== 'string' || !Number.isFinite(Date.parse(value.publicado_em))) return null;
 return {
  dashboard_id: value.dashboard_id, nome: value.nome,
  descricao: value.descricao as string | null, topico_nome: value.topico_nome,
  versao: value.versao as number, publicado_em: value.publicado_em,
 };
}

/** Fail closed on malformed, oversized or duplicated catalog results. */
export function parsePublishedGallery(value: unknown): PublishedSummary[] | null {
 if (!Array.isArray(value) || value.length > 200) return null;
 const seen = new Set<string>();
 const rows: PublishedSummary[] = [];
 for (const item of value) {
  const row = parsePublishedSummary(item);
  if (!row || seen.has(row.dashboard_id)) return null;
  seen.add(row.dashboard_id);
  rows.push(row);
 }
 return rows;
}

export function parsePublishedDashboard(value: unknown): PublishedDashboard | null {
 const summary = parsePublishedSummary(value);
 if (!summary || !own(value)) return null;
 const blocos = parseEditorBlocks(value.blocos);
 if (!blocos || blocos.length === 0) return null;
 return { ...summary, blocos };
}
