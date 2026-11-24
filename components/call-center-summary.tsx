import { Clock3, Headphones, Phone, PhoneOff } from 'lucide-react';
import { formatCallDuration } from '@/lib/call-center-design';
import styles from './call-center.module.css';

type Summary = {
  total: number; answered: number; abandoned: number; unanswered: number | null; other: number | null;
  answerRate: number | null; abandonRate: number | null;
};
type Props = {
  summary: Summary | null; loading: boolean; partial: boolean;
  times: { tma: number | null; tme: number | null; waitKind: 'queue_tme' | 'tef' | 'tet_legacy'; tmaQueues?: number; tmeQueues?: number } | null;
  timeStatus: 'loading' | 'ready' | 'unavailable';
  sourceMode?: 'snapshot' | 'history';
};
const count = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString('pt-BR');
const percent = (value: number | null | undefined) => value == null ? '—' :
  `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export default function CallCenterSummary({ summary, loading, partial, times, timeStatus, sourceMode = 'history' }: Props) {
  const valueClass = loading && !summary ? `${styles.value} ${styles.skeleton}` : styles.value;
  return <div className={styles.summary} aria-busy={loading}>
    <section className={styles.card} aria-label="Resumo de chamadas">
      <div className={styles.cardHeader}>
        <h2><span className={styles.icon}><Phone size={18} aria-hidden="true" /></span> Chamadas</h2>
        {partial && <span className={styles.badge}>Período parcial</span>}
      </div>
      <dl className={styles.callTotals}>
        <div><dt>Recebidas</dt><dd className={valueClass}>{count(summary?.total)}</dd></div>
        <div className={styles.answered}><dt>Atendidas</dt><dd className={valueClass}>{count(summary?.answered)}</dd></div>
        <div className={styles.abandoned}><dt>Abandonadas</dt><dd className={valueClass}>{count(summary?.abandoned)}</dd></div>
      </dl>
      <p className={styles.hint}>{sourceMode === 'snapshot' ?
      'Fonte: listar_filas (último estado disponível). Abandonadas = menos de 30s + mais de 30s. Não é histórico consolidado do dia.' :
      'Recebidas incluem todas as situações. Abandono considera somente o status ABANDON.'}</p>
    </section>
    <div className={styles.metrics}>
      <section className={`${styles.card} ${styles.abandoned}`} aria-label="Taxa de abandono">
        <div className={styles.cardHeader}><h3>Taxa de abandono</h3><PhoneOff size={19} aria-hidden="true" /></div>
        <p className={valueClass}>{percent(summary?.abandonRate)}</p>
        <p className={styles.hint}>Saiu da fila sem ser atendida</p>
      </section>
      <section className={styles.card} aria-label="TMA">
        <div className={styles.cardHeader}><h3>TMA</h3><Headphones size={19} aria-hidden="true" /></div>
        <p className={`${styles.value} ${timeStatus === 'loading' ? styles.skeleton : ''}`}>{formatCallDuration(times?.tma)}</p>
        <p className={styles.hint}>Tempo médio de atendimento</p>
      </section>
      <section className={styles.card} aria-label="TME de fila">
        <div className={styles.cardHeader}><h3>TME de fila</h3><Clock3 size={19} aria-hidden="true" /></div>
        <p className={styles.value}>{times && times.waitKind !== 'tet_legacy' ? formatCallDuration(times.tme) : '—'}</p>
        {sourceMode !== 'snapshot' && (!times || times.waitKind === 'tet_legacy') && <span className={styles.badge}>Aguardando validação SQL</span>}
        <p className={styles.hint}>Tempo médio de espera</p>
      </section>
    </div>
  </div>;
}
