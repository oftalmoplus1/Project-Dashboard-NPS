'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { callCenterTopicLabel } from '@/lib/call-center-design';
import { isExistingDashboardCode } from '@/lib/dashboard-registry';
import styles from './manage-dashboards.module.css';
import ManageDashboardDrafts from './manage-dashboard-drafts';

type Topic = { slug: string; nome: string };
type InventoryDashboard = {
 codigo: string;
 nome: string;
 estado: 'disponivel' | 'rascunho' | 'publicado';
 topicos: Topic[];
};
type StatusFilter = 'todos' | InventoryDashboard['estado'];
type Props = { query: string; setQuery: (value: string) => void };

function validDashboard(value: unknown): value is InventoryDashboard {
 if (!value || typeof value !== 'object') return false;
 const row = value as Record<string, unknown>;
 return isExistingDashboardCode(row.codigo)
  && typeof row.nome === 'string' && row.nome.length > 0 && row.nome.length <= 120
  && (row.estado === 'disponivel' || row.estado === 'rascunho' || row.estado === 'publicado')
  && Array.isArray(row.topicos)
  && row.topicos.every((topic: unknown) => !!topic && typeof topic === 'object'
   && typeof (topic as Topic).nome === 'string'
   && typeof (topic as Topic).slug === 'string');
}

export default function ManageDashboards({ query, setQuery }: Props) {
 const [rows, setRows] = useState<InventoryDashboard[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState('');
 const [revision, setRevision] = useState(0);
 const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');

 useEffect(() => {
  const controller = new AbortController();
  async function load() {
   setLoading(true);
   setRows([]);
   setError('');
   try {
    const response = await fetch('/api/catalogo/dashboards', { cache: 'no-store', signal: controller.signal });
    const payload: unknown = await response.json();
    if (!response.ok || !payload || typeof payload !== 'object' || !('rows' in payload)
     || !Array.isArray(payload.rows) || !payload.rows.every(validDashboard)) {
     const text = payload && typeof payload === 'object' && 'error' in payload
      && typeof payload.error === 'string' ? payload.error : 'Catálogo de dashboards indisponível.';
     throw new Error(text);
    }
    if (!controller.signal.aborted) setRows(payload.rows);
   } catch (cause) {
    if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Falha ao consultar dashboards.');
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
   return [row.nome, row.codigo, ...row.topicos.map(topic => callCenterTopicLabel(topic))]
    .join(' ').toLocaleLowerCase('pt-BR').includes(term);
  });
 }, [query, rows, statusFilter]);

 const published = rows.filter(row => row.estado === 'publicado').length;
 const drafts = rows.filter(row => row.estado === 'rascunho').length;
 const available = rows.filter(row => row.estado === 'disponivel').length;

 return <>
  <div className="notice">
   <ShieldCheck size={17} aria-hidden="true" />
   <span>Visualizações disponíveis no sistema e seus vínculos existentes. Nenhuma autorização é concedida automaticamente.</span>
  </div>
  <section className="panel" aria-label="Gerenciar dashboards">
   <div className="panel-head">
    <div><h2>Catálogo de dashboards</h2><p>Inclui também visualizações que ainda não foram vinculadas a um tópico.</p></div>
    <div className={styles.headerActions}>
     <button type="button" className="outline-button" disabled={loading} onClick={() => setRevision(value => value + 1)}>
      <RefreshCw size={16} aria-hidden="true" /> Atualizar
     </button>
     <a href="#criar-dashboard-personalizado" className="primary-button">
      <Plus size={16} aria-hidden="true" /> Novo dashboard
     </a>
    </div>
   </div>
   {!loading && !error && <div className={styles.summary} aria-live="polite">
    <span><strong>{rows.length}</strong> visualizações</span>
    <span><strong>{published}</strong> publicadas</span>
    <span><strong>{drafts}</strong> rascunhos</span>
    <span><strong>{available}</strong> sem vínculo</span>
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
      <option value="disponivel">Sem vínculo</option>
     </select>
     {!loading && !error && <span className="subtle-pill">{filtered.length} resultados</span>}
    </div>
   </div>
   {loading ? <p className={styles.message} role="status">Carregando catálogo...</p>
    : error ? <div className={styles.error} role="alert">{error}</div>
    : <div className="table-wrap">
      <table>
       <thead><tr><th scope="col">Dashboard</th><th scope="col">Tópicos associados</th>
        <th scope="col">Situação</th><th scope="col">Acessar</th></tr></thead>
       <tbody>{filtered.map(row => <tr key={row.codigo}>
        <td><span className={'table-dot ' + (row.estado === 'publicado' ? 'green' : 'yellow')} />
         <strong>{row.nome}</strong><small className={styles.code}>{row.codigo}</small></td>
        <td>{row.topicos.length} {row.topicos.length === 1 ? 'tópico' : 'tópicos'}</td>
        <td><span className={'status ' + (row.estado === 'publicado' ? 'ok' : 'draft')}>
         {row.estado === 'publicado' ? 'Publicado' : row.estado === 'rascunho' ? 'Rascunho' : 'Sem vínculo'}
        </span></td>
        <td><div className={styles.topicLinks}>
         {row.topicos.length === 0
          ? <Link href="/topicos" className={styles.topicLink}>Vincular a tópico</Link>
          : row.topicos.map(topic => <Link key={topic.slug}
             href={'/meus-dashboards/' + encodeURIComponent(topic.slug)
              + '?dashboard=' + encodeURIComponent(row.codigo)}
             className={styles.topicLink}>{callCenterTopicLabel(topic)}</Link>)}
        </div></td>
       </tr>)}</tbody>
      </table>
      {filtered.length === 0 && <div className="no-results">Nenhum dashboard corresponde aos filtros informados.</div>}
     </div>}
  </section>
  <p className={styles.note}>A tabela acima preserva as cinco visualizações implementadas do Call Center.
   Cadastros personalizados são apresentados separadamente até a conclusão do editor visual e da publicação segura.</p>
  <ManageDashboardDrafts/>
 </>;
}
