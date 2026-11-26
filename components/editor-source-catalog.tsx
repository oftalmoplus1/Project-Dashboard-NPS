'use client';

import { useEffect, useState } from 'react';
import { Database, RefreshCw, ShieldCheck } from 'lucide-react';
import styles from './editor-source-catalog.module.css';

type Candidate = { id: string; nome: string; unidade: 'contagem' | 'duracao'; situacao: 'em_analise'; observacao: string };
type Dimension = { id: string; nome: string };
type Source = {
 id: string;
 nome: string;
 origem: string;
 natureza: 'fotografia_atual' | 'historico_de_eventos';
 descricao: string;
 politicaTemporal: string;
 referenciaTemporal: string;
 fuso: string;
 consultasHabilitadas: false;
 indicadoresCandidatos: Candidate[];
 dimensoesCandidatas: Dimension[];
 avisos: string[];
};

function isSource(value: unknown): value is Source {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
 const source = value as Record<string, unknown>;
 return typeof source.id === 'string'
  && typeof source.nome === 'string'
  && typeof source.origem === 'string'
  && (source.natureza === 'fotografia_atual' || source.natureza === 'historico_de_eventos')
  && typeof source.descricao === 'string'
  && typeof source.politicaTemporal === 'string'
  && typeof source.referenciaTemporal === 'string'
  && source.fuso === 'America/Sao_Paulo'
  && source.consultasHabilitadas === false
  && Array.isArray(source.indicadoresCandidatos)
  && source.indicadoresCandidatos.every((item: unknown) => {
   if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
   const value = item as Record<string, unknown>;
   return typeof value.id === 'string' && typeof value.nome === 'string'
    && (value.unidade === 'contagem' || value.unidade === 'duracao')
    && value.situacao === 'em_analise' && typeof value.observacao === 'string';
  })
  && Array.isArray(source.dimensoesCandidatas)
  && source.dimensoesCandidatas.every((item: unknown) =>
   !!item && typeof item === 'object' && typeof (item as Dimension).id === 'string'
   && typeof (item as Dimension).nome === 'string')
  && Array.isArray(source.avisos)
  && source.avisos.every((item: unknown) => typeof item === 'string');
}

export default function EditorSourceCatalog() {
 const [rows, setRows] = useState<Source[]>([]);
 const [revision, setRevision] = useState(0);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState('');

 useEffect(() => {
  const controller = new AbortController();
  async function load() {
   setLoading(true);
   setError('');
   setRows([]);
   try {
    const response = await fetch('/api/catalogo/fontes-editor', { cache: 'no-store', signal: controller.signal });
    const result: unknown = await response.json();
    if (!response.ok || !result || typeof result !== 'object') throw new Error('Catálogo indisponível.');
    const payload = result as { rows?: unknown; consultasHabilitadas?: unknown; error?: unknown };
    if (!Array.isArray(payload.rows) || !payload.rows.every(isSource) || payload.consultasHabilitadas !== false) {
     throw new Error('Metadados de fontes inconsistentes.');
    }
    if (!controller.signal.aborted) setRows(payload.rows);
   } catch {
    if (!controller.signal.aborted) setError('Não foi possível consultar as fontes candidatas.');
   } finally {
    if (!controller.signal.aborted) setLoading(false);
   }
  }
  void load();
  return () => controller.abort();
 }, [revision]);

 return <>
  <div className="notice">
   <ShieldCheck size={17} aria-hidden="true" />
   <span>Este catálogo exibe somente metadados. No Editor Visual, a prévia administrativa de listar_filas utiliza a consulta protegida da última coleta; séries históricas e publicação continuam desabilitadas.</span>
  </div>
  <section className="panel" aria-label="Fontes candidatas para o Editor Visual">
   <div className="panel-head">
    <div>
     <h2>Fontes do Editor Visual</h2>
     <p>Metadados disponíveis para revisão administrativa antes de habilitar gráficos e consultas.</p>
    </div>
    <button type="button" className="outline-button" onClick={() => setRevision(n => n + 1)} disabled={loading}>
     <RefreshCw size={16} aria-hidden="true" /> Atualizar
    </button>
   </div>
   {loading && <p className={styles.message} role="status">Carregando fontes...</p>}
   {error && <p className={styles.error} role="alert">{error}</p>}
   {!loading && !error && <div className={styles.catalog}>
    {rows.map(source => <article key={source.id} className={styles.source}>
     <div className={styles.sourceHead}>
      <Database size={20} aria-hidden="true" />
      <div>
       <h3>{source.nome}</h3>
       <p>{source.descricao}</p>
      </div>
      <span className={styles.status}>Consulta desabilitada</span>
     </div>
     <div className={styles.metadata}>
      <div><strong>Relação inventariada</strong><code>{source.origem}</code></div>
      <div><strong>Modelo temporal</strong><span>{source.politicaTemporal}</span></div>
      <div><strong>Campo de referência</strong><span>{source.referenciaTemporal}</span></div>
      <div><strong>Fuso</strong><span>{source.fuso}</span></div>
     </div>
     <h4>Indicadores candidatos (ainda não aprovados)</h4>
     <div className={styles.candidates}>
      {source.indicadoresCandidatos.map(candidate => <div key={candidate.id} className={styles.candidate}>
       <strong>{candidate.nome}</strong>
       <small>{candidate.observacao}</small>
      </div>)}
     </div>
     <h4>Dimensões candidatas</h4>
     <p className={styles.dimensions}>{source.dimensoesCandidatas.map(item => item.nome).join(' · ')}</p>
     <div className={styles.cautions}>
      {source.avisos.map(item => <p key={item}>{item}</p>)}
     </div>
    </article>)}
   </div>}
  </section>
 </>;
}
