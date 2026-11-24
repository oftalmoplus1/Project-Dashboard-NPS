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


type QueuePreview = {
 source: 'listar_filas';
 kind: 'latest_snapshot';
 finalidade: 'previa_administrativa';
 consultedAt: string;
 sourceUpdatedAt: string;
 metrics: {
  received: number;
  answered: number;
  abandoned: number;
  waiting: number;
  tmaSeconds: number | null;
  tmeSeconds: number | null;
  tmaQueues: number;
  tmeQueues: number;
 };
 note: string;
};

function isQueuePreview(payload: unknown): payload is QueuePreview {
 if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
 const record = payload as Record<string, unknown>;
 if (record.source !== 'listar_filas' || record.kind !== 'latest_snapshot'
  || record.finalidade !== 'previa_administrativa'
  || typeof record.note !== 'string'
  || typeof record.consultedAt !== 'string' || !Number.isFinite(Date.parse(record.consultedAt))
  || typeof record.sourceUpdatedAt !== 'string' || !Number.isFinite(Date.parse(record.sourceUpdatedAt))
  || !record.metrics || typeof record.metrics !== 'object' || Array.isArray(record.metrics)) {
  return false;
 }
 const m = record.metrics as Record<string, unknown>;
 return ['received', 'answered', 'abandoned', 'waiting', 'tmaQueues', 'tmeQueues']
  .every(key => typeof m[key] === 'number' && Number.isSafeInteger(m[key]) && m[key] >= 0)
  && ['tmaSeconds', 'tmeSeconds'].every(key =>
   m[key] === null || typeof m[key] === 'number' && Number.isFinite(m[key]) && m[key] >= 0);
}

function formatDuration(seconds: number | null): string {
 if (seconds === null) return '—';
 const s = Math.round(seconds);
 const hours = Math.floor(s / 3600);
 const minutes = Math.floor(s % 3600 / 60);
 const rest = s % 60;
 return hours ? [hours, minutes, rest].map(n => String(n).padStart(2, '0')).join(':')
  : [minutes, rest].map(n => String(n).padStart(2, '0')).join(':');
}

const formatter = new Intl.NumberFormat('pt-BR');
function dateInBrazil(value: string): string {
 return new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
}

export default function EditorSourceCatalog() {
 const [rows, setRows] = useState<Source[]>([]);
 const [revision, setRevision] = useState(0);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState('');
 const [preview, setPreview] = useState<QueuePreview | null>(null);
 const [previewLoading, setPreviewLoading] = useState(false);
 const [previewError, setPreviewError] = useState('');


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


 async function previewQueue() {
  if (previewLoading) return;
  setPreview(null);
  setPreviewError('');
  setPreviewLoading(true);
  try {
   const response = await fetch('/api/catalogo/fontes-editor/listar-filas/previa', { cache: 'no-store' });
   const payload: unknown = await response.json();
   if (!response.ok || !isQueuePreview(payload)) throw new Error('Prévia inválida ou indisponível.');
   setPreview(payload);
  } catch {
   setPreviewError('Não foi possível obter a última coleta validada. Tente novamente após verificar a fonte.');
  } finally {
   setPreviewLoading(false);
  }
 }

 return <>
  <div className="notice">
   <ShieldCheck size={17} aria-hidden="true" />
   <span>As fontes exibidas foram inventariadas. Nenhuma consulta ou métrica foi liberada para o editor. O catálogo não expõe dados operacionais.</span>
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
     {source.id === 'listar_filas' && <div className={styles.previewSection}>
      <div className={styles.previewHeader}>
       <div>
        <h4>Prévia administrativa da última coleta</h4>
        <p>Consulta existente e protegida, somente valores agregados. Não habilita dados para gráficos personalizados.</p>
       </div>
       <button type="button" className="outline-button" onClick={() => void previewQueue()} disabled={previewLoading || loading}>
        <RefreshCw size={15} aria-hidden="true" /> {previewLoading ? 'Consultando...' : 'Consultar prévia'}
       </button>
      </div>
      {previewLoading && <p role="status" className={styles.message}>Validando a coleta atual...</p>}
      {previewError && <p role="alert" className={styles.error}>{previewError}</p>}
      {preview && <div className={styles.previewData} aria-live="polite">
       <div className={styles.previewMetrics}>
        <div><span>Recebidas</span><strong>{formatter.format(preview.metrics.received)}</strong></div>
        <div><span>Atendidas</span><strong>{formatter.format(preview.metrics.answered)}</strong></div>
        <div><span>Abandonadas</span><strong>{formatter.format(preview.metrics.abandoned)}</strong></div>
        <div><span>Em espera (soma das filas)</span><strong>{formatter.format(preview.metrics.waiting)}</strong></div>
        <div><span>TMA · média entre {preview.metrics.tmaQueues} filas</span><strong>{formatDuration(preview.metrics.tmaSeconds)}</strong></div>
        <div><span>TME · média entre {preview.metrics.tmeQueues} filas</span><strong>{formatDuration(preview.metrics.tmeSeconds)}</strong></div>
       </div>
       <p className={styles.previewFoot}>Última coleta: {dateInBrazil(preview.sourceUpdatedAt)} · Consulta: {dateInBrazil(preview.consultedAt)} (São Paulo)</p>
       <p className={styles.previewFoot}>{preview.note}</p>
      </div>}
     </div>}
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
