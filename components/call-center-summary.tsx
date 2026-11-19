import { Clock3, Headphones, Phone, PhoneIncoming, PhoneMissed, PhoneOff } from 'lucide-react';
import { formatCallDuration } from '@/lib/call-center-design';
import styles from './call-center.module.css';

type Summary = {
  total: number; answered: number; abandoned: number; unanswered: number; other: number;
  answerRate: number | null; abandonRate: number | null;
};
type Props = {
  summary: Summary | null; loading: boolean; partial: boolean;
  times: { tma: number | null; tet: number | null } | null;
  timeStatus: 'loading' | 'ready' | 'unavailable';
};
const count = (value: number | undefined) => value === undefined ? '—' : value.toLocaleString('pt-BR');
const percent = (value: number | null | undefined) => value == null ? '—' :
  `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export default function CallCenterSummary({ summary, loading, partial, times, timeStatus }: Props) {
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
      <p className={styles.hint}>Recebidas incluem todas as situações. Abandono considera somente o status ABANDON.</p>
    </section>
    <div className={styles.metrics}>
      <section className={`${styles.card} ${styles.abandoned}`} aria-label="Taxa de abandono">
        <div className={styles.cardHeader}><h3>Taxa de abandono</h3><PhoneOff size={19} aria-hidden="true" /></div>
        <p className={valueClass}>{percent(summary?.abandonRate)}</p>
        <p className={styles.hint}>{summary?.total ? 'Abandonadas sobre todas as recebidas.' : 'Sem base de cálculo neste período.'}</p>
      </section>
      <section className={styles.card} aria-label="TMA">
        <div className={styles.cardHeader}><h3>TMA</h3><Headphones size={19} aria-hidden="true" /></div>
        <p className={`${styles.value} ${timeStatus === 'loading' ? styles.skeleton : ''}`}>{formatCallDuration(times?.tma)}</p>
        <p className={styles.hint}>{timeStatus === 'unavailable' ? 'Consulta de tempos indisponível.' : timeStatus === 'loading' ? 'Consultando tempo de atendimento.' : times?.tma == null ? 'Sem amostras válidas de atendimento.' : 'Tempo médio de atendimento. Recebidas e efetuadas atendidas.'}</p>
      </section>
      <section className={styles.card} aria-label="TME de fila">
        <div className={styles.cardHeader}><h3>TME de fila</h3><Clock3 size={19} aria-hidden="true" /></div>
        <p className={styles.value}>—</p>
        <span className={styles.badge}>Aguardando integração</span>
        <p className={styles.hint}>Tempo médio de espera em fila. O cálculo com TEF ainda não está habilitado; TET não o substitui.</p>
      </section>
    </div>
    <details className={styles.details}>
      <summary>Indicadores complementares</summary>
      <dl className={styles.secondary}>
        <div><dt><PhoneMissed size={15} aria-hidden="true" /> Sem atendimento</dt><dd>{count(summary?.unanswered)}</dd></div>
        <div><dt><PhoneIncoming size={15} aria-hidden="true" /> Taxa de atendimento</dt><dd>{percent(summary?.answerRate)}</dd></div>
        <div><dt>Outras situações</dt><dd>{count(summary?.other)}</dd></div>
        <div><dt>Espera total (TET legado)</dt><dd>{formatCallDuration(times?.tet)}</dd></div>
      </dl>
      <p className={styles.hint}>Espera total é diferente de espera em fila. Tempos no formato mm:ss; a partir de uma hora, hh:mm:ss.</p>
    </details>
  </div>;
}
