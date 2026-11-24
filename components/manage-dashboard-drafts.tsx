'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import styles from './manage-dashboards.module.css';

type Topic = { id: string; nome: string; slug: string };
type Personalized = {
 id: string;
 nome: string;
 descricao: string | null;
 estado: 'rascunho' | 'publicado';
 topico_slug: string;
 topico_nome: string;
 criado_em: string;
};

type RowsResponse = { rows?: Personalized[]; error?: string };
type TopicsResponse = { rows?: Topic[]; error?: string };

export default function ManageDashboardDrafts() {
 const [items, setItems] = useState<Personalized[]>([]);
 const [topics, setTopics] = useState<Topic[]>([]);
 const [loading, setLoading] = useState(true);
 const [ready, setReady] = useState(false);
 const [error, setError] = useState('');
 const [message, setMessage] = useState('');
 const [saving, setSaving] = useState(false);
 const [nome, setNome] = useState('');
 const [descricao, setDescricao] = useState('');
 const [topicSlug, setTopicSlug] = useState('');

 const load = useCallback(async () => {
  setLoading(true);
  setReady(false);
  setError('');
  try {
   const [draftResponse, topicsResponse] = await Promise.all([
    fetch('/api/catalogo/dashboards/personalizados', { cache: 'no-store' }),
    fetch('/api/catalogo/topicos', { cache: 'no-store' })
   ]);
   const drafts: RowsResponse = await draftResponse.json();
   const topicList: TopicsResponse = await topicsResponse.json();
   if (!draftResponse.ok || !Array.isArray(drafts.rows)) {
    setError(drafts.error ?? 'O cadastro de dashboards personalizados está indisponível.');
    return;
   }
   if (!topicsResponse.ok || !Array.isArray(topicList.rows)) {
    setError(topicList.error ?? 'Não foi possível consultar os tópicos.');
    return;
   }
   setItems(drafts.rows);
   setTopics(topicList.rows);
   setTopicSlug(old => topicList.rows!.some(topic => topic.slug === old) ? old : (topicList.rows![0]?.slug ?? ''));
   setReady(true);
  } catch {
   setError('Não foi possível consultar os dashboards personalizados.');
  } finally {
   setLoading(false);
  }
 }, []);

 useEffect(() => { void load(); }, [load]);

 async function create(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const clean = nome.trim();
  const desc = descricao.trim();
  if (saving || !ready || !clean || clean.length > 120 || desc.length > 500 || !topics.some(topic => topic.slug === topicSlug)) return;
  setSaving(true);
  setError('');
  setMessage('');
  try {
   const response = await fetch('/api/catalogo/dashboards/personalizados', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: clean, descricao: desc, topico_slug: topicSlug })
   });
   const result: { id?: string; error?: string } = await response.json();
   if (!response.ok || typeof result.id !== 'string') {
    setError(result.error ?? 'Não foi possível criar o rascunho.');
    return;
   }
   setNome('');
   setDescricao('');
   setMessage('Rascunho criado e vinculado ao tópico. Você pode abrir o editor experimental na lista abaixo; o layout ainda não é salvo no servidor.');
   await load();
   window.dispatchEvent(new Event('dashboard-topics-updated'));
  } catch {
   setError('A conexão falhou. Confira a lista antes de tentar novamente, para evitar cadastros duplicados.');
  } finally {
   setSaving(false);
  }
 }

 return <section className="panel" id="criar-dashboard-personalizado" aria-label="Dashboards personalizados">
  <div className="panel-head">
   <div>
    <h2>Dashboards personalizados</h2>
    <p>Crie o cadastro inicial em rascunho. A edição de gráficos e a publicação serão liberadas em fases separadas.</p>
   </div>
   <button type="button" className="outline-button" disabled={loading || saving}
    onClick={() => void load()}>
    <RefreshCw size={16} aria-hidden="true" /> Atualizar
   </button>
  </div>
  <div className={styles.draftContent}>
   <div className="notice">
    <ShieldCheck size={17} aria-hidden="true" />
    <span>Somente administradores criam rascunhos. Criar ou associar um dashboard não concede acesso aos usuários.</span>
   </div>
   {loading && <p role="status">Verificando disponibilidade do cadastro...</p>}
   {error && <p role="alert" className={styles.errorInline}>{error}</p>}
   {message && <p role="status" className={styles.successInline}>{message}</p>}
   {!loading && !ready && <p className={styles.hint}>
    A criação permanece bloqueada até a instalação e validação das funções de rascunho no Supabase correto.
   </p>}
   <form className={styles.draftForm} onSubmit={create}>
    <label htmlFor="new-dashboard-name">Nome do dashboard</label>
    <input id="new-dashboard-name" type="text" maxLength={120} required
     value={nome} onChange={event => setNome(event.target.value)}
     placeholder="Ex.: Indicadores operacionais" disabled={!ready || saving}/>
    <label htmlFor="new-dashboard-description">Descrição (opcional)</label>
    <textarea id="new-dashboard-description" maxLength={500}
     value={descricao} onChange={event => setDescricao(event.target.value)}
     placeholder="Explique o objetivo deste dashboard" rows={2} disabled={!ready || saving}/>
    <label htmlFor="new-dashboard-topic">Tópico</label>
    <select id="new-dashboard-topic" className={styles.select} required
     value={topicSlug} onChange={event => setTopicSlug(event.target.value)}
     disabled={!ready || saving || topics.length === 0}>
     {topics.length === 0 ? <option value="">Nenhum tópico disponível</option>
      : topics.map(topic => <option key={topic.id} value={topic.slug}>{topic.nome}</option>)}
    </select>
    <button type="submit" className="primary-button"
     disabled={!ready || saving || !nome.trim() || !topicSlug || topics.length === 0}>
     <Plus size={16} aria-hidden="true"/> {saving ? 'Criando...' : 'Criar rascunho'}
    </button>
   </form>
   {ready && <div className={styles.draftList}>
    <h3>Cadastros personalizados ({items.length})</h3>
    {items.length === 0 ? <p className={styles.hint}>Nenhum rascunho personalizado cadastrado.</p>
     : <div className="table-wrap">
       <table>
        <thead><tr><th scope="col">Dashboard</th><th scope="col">Tópico</th><th scope="col">Situação</th><th scope="col">Editor</th></tr></thead>
        <tbody>{items.map(row => <tr key={row.id + '-' + row.topico_slug}>
         <td><strong>{row.nome}</strong>{row.descricao && <small className={styles.code}>{row.descricao}</small>}</td>
         <td>{row.topico_nome}</td>
         <td><span className="status draft">{row.estado === 'rascunho' ? 'Rascunho' : 'Publicado'}</span></td>
         <td>{row.estado === 'rascunho'
          ? <Link className={styles.topicLink} href={'/editor/dashboards/' + encodeURIComponent(row.id)}>
             Abrir editor experimental
            </Link>
          : <span className={styles.hint}>Edição de publicados indisponível nesta fase</span>}</td>
        </tr>)}</tbody>
       </table>
      </div>}
   </div>}
  </div>
 </section>;
}
