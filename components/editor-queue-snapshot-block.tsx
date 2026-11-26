'use client';

import type { VisualBlock } from '@/lib/editor-visual-layout';
import {
 buildEditorSnapshotView, SNAPSHOT_METRICS, editorMetricLabel,
 type SnapshotMetric,
} from '@/lib/editor-queue-snapshot-view';
import type { SnapshotPreviewState } from './use-editor-queue-snapshot';
import styles from './dashboard-visual-editor.module.css';

const number = new Intl.NumberFormat('pt-BR');
const timestamp = new Intl.DateTimeFormat('pt-BR', {
 dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo',
});
const supportedKinds = ['kpi','table','bar'] as const;

function formatPercent(value: number|null): string {
 return value === null ? 'N/A' : value.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
}
function metric(value: string): SnapshotMetric | null {
 return SNAPSHOT_METRICS.find(key=>key===value) ?? null;
}

/** Live preview only; saved layout does not yet include historical intervals. */
export default function EditorQueueSnapshotBlock({
 block, snapshot,
}: {block:VisualBlock; snapshot:SnapshotPreviewState}) {
 if (!supportedKinds.some(kind=>kind===block.kind)) return <p className={styles.snapshotMessage}>
  Série histórica indisponível em listar_filas. A última coleta não identifica a data de entrada de cada chamada.
 </p>;
 if (snapshot.status === 'idle' || snapshot.status === 'loading') {
  return <p className={styles.snapshotMessage} role="status">Consultando a última coleta de filas...</p>;
 }
 if (snapshot.status === 'error') return <p className={styles.snapshotError} role="alert">
  Não foi possível validar a última coleta. Nenhum número anterior será exibido.
 </p>;
 const {data} = snapshot;
 let view: ReturnType<typeof buildEditorSnapshotView>;
 try { view = buildEditorSnapshotView(data.rows,10); }
 catch { return <p className={styles.snapshotError} role="alert">Dados de filas inconsistentes.</p>; }
 const selectedMetric=metric(block.metric);
 const displayedMetrics = selectedMetric ? [selectedMetric] : [...SNAPSHOT_METRICS];
 const maxValues: Record<SnapshotMetric,number> = {
  received: Math.max(1,...view.rows.map(row=>row.received)),
  answered: Math.max(1,...view.rows.map(row=>row.answered)),
  abandoned: Math.max(1,...view.rows.map(row=>row.abandoned)),
 };
 return <div className={styles.snapshotContainer} data-testid="editor-queue-snapshot">
  <p className={styles.snapshotMeta}>
   <strong>Última coleta</strong>
   <span>{timestamp.format(new Date(data.sourceUpdatedAt))} · não é histórico por data</span>
  </p>
  {block.kind === 'kpi' && <div className={styles.snapshotKpis}>
   {displayedMetrics.map(key=><div key={key} className={styles.snapshotKpi}>
    <strong>{number.format(view.totals[key])}</strong>
    <span>{editorMetricLabel(key)}</span>
   </div>)}
  </div>}
  {block.kind === 'table' && <div className={styles.snapshotScroll}>
   <table className={styles.snapshotTable}>
    <thead><tr><th>Fila</th><th>Recebidas</th><th>Atendidas</th><th>Abandonadas</th><th>% atend.</th></tr></thead>
    <tbody>{view.rows.map(row=><tr key={row.id}>
     <th scope="row">{row.name}</th>
     <td>{number.format(row.received)}</td>
     <td>{number.format(row.answered)}</td>
     <td>{number.format(row.abandoned)}</td>
     <td>{formatPercent(row.answerRate)}</td>
    </tr>)}</tbody>
   </table>
  </div>}
  {block.kind === 'bar' && <div className={styles.snapshotScroll}>
   <div className={block.chartOrientation==='horizontal'
    ? styles.snapshotBarsHorizontal : styles.snapshotBarsVertical}>
    {view.rows.map(row=><div key={row.id} className={styles.snapshotBarGroup}>
     <strong className={styles.snapshotBarName}>{row.name}</strong>
     <div className={styles.snapshotBarSeries}>
      {displayedMetrics.map(key=><div key={key} className={styles.snapshotBarItem}>
       <span className={styles.snapshotBarLabel}>{editorMetricLabel(key)}</span>
       <div className={styles.snapshotBarTrack}>
        <span className={styles.snapshotBarFill} data-metric={key}
         style={block.chartOrientation==='horizontal'
          ? {width:(row[key]/maxValues[key]*100)+'%'}
          : {height:(row[key]/maxValues[key]*100)+'%'}} />
       </div>
       <span className={styles.snapshotBarValue}>{number.format(row[key])}</span>
      </div>)}
     </div>
    </div>)}
   </div>
  </div>}
  {block.kind !== 'kpi' && <p className={styles.snapshotFoot}>
   {view.truncated ? 'Prévia: 10 primeiras filas de '+view.totalQueues+'.' : view.totalQueues+' filas.'}
   {' '}Ordenação por nome. Configurações de exibição por componente ainda não publicadas.
  </p>}
 </div>;
}
