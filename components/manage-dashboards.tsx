'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { isDashboardItem, type DashboardItem } from '@/lib/dashboard-registry';
import styles from './manage-dashboards.module.css';

type Topic = { slug: string; nome: string };
type LinkedDashboard = DashboardItem & { topics: Topic[] };
type StatusFilter = 'todos' | 'publicado' | 'rascunho';

type Props = {
  query: string;
  setQuery: (value: string) => void;
};

function isTopic(value: unknown): value is Topic {
  if (!value || typeof value !== 'object') return false;
  const topic = value as Record<string, unknown>;
  return typeof topic.nome === 'string' && topic.nome.trim().length > 0
    && typeof topic.slug === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(topic.slug);
}

async function getRows(url: string, signal: AbortSignal): Promise<unknown[]> {
  const response = await fetch(url, { cache: 'no-store', signal });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    // Fail closed: a partial catalog must never be presented as complete.
    throw new Error('Não foi possível consultar o catálogo. Verifique a disponibilidade da integração.');
  }
  if (!payload || typeof payload !== 'object' || !('rows' in payload)
    || !Array.isArray(payload.rows)) {
    throw new Error('O catálogo retornou um formato inesperado.');
  }
  return payload.rows;
}

async function loadLinkedDashboards(signal: AbortSignal): Promise<LinkedDashboard[]> {
  const rawTopics = await getRows('/api/catalogo/topicos', signal);
  if (!rawTopics.every(isTopic)) {
    throw new Error('A lista de tópicos retornou dados inconsistentes.');
  }

  const topics = rawTopics as Topic[];
  const associations = await Promise.all(topics.map(async topic => {
    const rows = await getRows(
      '/api/catalogo/topicos/' + encodeURIComponent(topic.slug) + '/dashboards', signal
    );
    if (!rows.every(isDashboardItem)) {
      throw new Error('O tópico ' + topic.nome + ' retornou dashboards inconsistentes.');
    }
    return { topic, rows: rows as DashboardItem[] };
  }));

  const unique = new Map<string, LinkedDashboard>();
  for (const { topic, rows } of associations) {
    for (const row of rows) {
      const found = unique.get(row.codigo);
      if (found) {
        if (found.nome !== row.nome || found.estado !== row.estado) {
          throw new Error('O catálogo contém definições divergentes para um dashboard.');
        }
        found.topics.push(topic);
      } else {
        unique.set(row.codigo, { ...row, topics: [topic] });
      }
    }
  }
  return Array.from(unique.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export default function ManageDashboards({ query, setQuery }: Props) {
  const [rows, setRows] = useState<LinkedDashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError('');
      setRows([]);
      try {
        const result = await loadLinkedDashboards(controller.signal);
        if (!controller.signal.aborted) setRows(result);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os dashboards.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [revision]);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR');
    return rows.filter(row => {
      if (statusFilter !== 'todos' && row.estado !== statusFilter) return false;
      const haystack = [row.nome, row.codigo, ...row.topics.map(topic => topic.nome)]
        .join(' ').toLocaleLowerCase('pt-BR');
      return haystack.includes(term);
    });
  }, [query, rows, statusFilter]);

  const published = rows.filter(row => row.estado === 'publicado').length;
  const drafts = rows.length - published;

  return <>
    <div className="notice">
      <ShieldCheck size={17} aria-hidden="true" />
      <span>Catálogo conectado aos tópicos existentes. A consulta é restrita à Administração;
        nenhuma permissão é concedida automaticamente.</span>
    </div>

    <section className="panel" aria-label="Gerenciar dashboards">
      <div className="panel-head">
        <div>
          <h2>Catálogo de dashboards</h2>
          <p>Dashboards vinculados a tópicos, sem duplicar definições ou dados operacionais.</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className="outline-button" disabled={loading}
            onClick={() => setRevision(value => value + 1)}>
            <RefreshCw size={16} aria-hidden="true" /> Atualizar
          </button>
          <button type="button" className="primary-button" disabled
            title="O editor visual será liberado após a validação das fontes e permissões.">
            <Plus size={16} aria-hidden="true" /> Novo dashboard
          </button>
        </div>
      </div>

      {!loading && !error && <div className={styles.summary} aria-live="polite">
        <span><strong>{rows.length}</strong> dashboards vinculados</span>
        <span><strong>{published}</strong> publicados</span>
        <span><strong>{drafts}</strong> rascunhos</span>
      </div>}

      <div className="toolbar">
        <label className="search-field">
          <Search size={17} aria-hidden="true" />
          <input value={query} onChange={event => setQuery(event.target.value)}
            placeholder="Pesquisar dashboards ou tópicos..." aria-label="Pesquisar dashboards" />
        </label>
        <div className={styles.filters}>
          <label className={styles.filterLabel} htmlFor="dashboard-status">Situação</label>
          <select id="dashboard-status" className={styles.select} value={statusFilter}
            onChange={event => setStatusFilter(event.target.value as StatusFilter)}>
            <option value="todos">Todas</option>
            <option value="publicado">Publicados</option>
            <option value="rascunho">Rascunhos</option>
          </select>
          {!loading && !error && <span className="subtle-pill">{filtered.length} resultados</span>}
        </div>
      </div>

      {loading ? <p className={styles.message} role="status">Carregando dashboards vinculados...</p>
        : error ? <div className={styles.error} role="alert">{error}</div>
        : rows.length === 0 ? <div className="no-results">
            Nenhum dashboard vinculado a um tópico. Associe dashboards em Gerenciar tópicos.
          </div>
        : <div className="table-wrap">
            <table>
              <thead><tr>
                <th scope="col">Dashboard</th>
                <th scope="col">Tópicos associados</th>
                <th scope="col">Situação</th>
                <th scope="col">Abrir no tópico</th>
              </tr></thead>
              <tbody>
                {filtered.map(row => <tr key={row.codigo}>
                  <td>
                    <span className={'table-dot ' + (row.estado === 'publicado' ? 'green' : 'yellow')} />
                    <strong>{row.nome}</strong>
                    <small className={styles.code}>{row.codigo}</small>
                  </td>
                  <td>{row.topics.length} {row.topics.length === 1 ? 'tópico' : 'tópicos'}</td>
                  <td><span className={'status ' + (row.estado === 'publicado' ? 'ok' : 'draft')}>
                    {row.estado === 'publicado' ? 'Publicado' : 'Rascunho'}
                  </span></td>
                  <td><div className={styles.topicLinks}>
                    {row.topics.map(topic => <Link key={topic.slug}
                      href={'/meus-dashboards/' + encodeURIComponent(topic.slug)
                        + '?dashboard=' + encodeURIComponent(row.codigo)}
                      className={styles.topicLink}>{topic.nome}</Link>)}
                  </div></td>
                </tr>)}
              </tbody>
            </table>
            {filtered.length === 0 && <div className="no-results">
              Nenhum dashboard corresponde aos filtros informados.
            </div>}
          </div>}
    </section>
    <p className={styles.note}>
      Esta etapa lista apenas dashboards já vinculados a tópicos. Dashboards sem vínculo e o
      editor de criação/publicação exigem uma API administrativa própria e validação no banco.
    </p>
  </>;
}
