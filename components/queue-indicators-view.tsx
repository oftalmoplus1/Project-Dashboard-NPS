'use client';

import { useMemo } from 'react';
import {
  selectQueueIndicators, type QueueIndicatorsConfig, type QueueIndicatorsRow,
} from '@/lib/queue-indicators-config';
import styles from './queue-indicators-view.module.css';

type Props = {
  /** Rows MUST be authorized and aggregated by the server for the configured period. */
  rows: readonly QueueIndicatorsRow[];
  config: QueueIndicatorsConfig;
  pending?: boolean;
  error?: string;
};

const countFormat = new Intl.NumberFormat('pt-BR');
const rateFormat = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1, maximumFractionDigits: 1,
});
const metrics = [
  { field: 'received', label: 'Recebidas', className: 'received' },
  { field: 'answered', label: 'Atendidas', className: 'answered' },
  { field: 'abandoned', label: 'Abandonadas', className: 'abandoned' },
] as const;

export default function QueueIndicatorsView({
  rows, config, pending = false, error = '',
}: Props) {
  const displayed = useMemo(() => selectQueueIndicators(rows, config), [rows, config]);
  const maximum = useMemo(
    () => Math.max(1, ...displayed.map(row => row.received)),
    [displayed],
  );
  if (pending) return <p className={styles.message} role="status">Carregando indicadores por fila…</p>;
  if (error) return <p className={styles.error} role="alert">{error}</p>;
  if (!displayed.length) return <p className={styles.message}>Nenhuma fila autorizada para a seleção.</p>;

  return <section className={styles.root} aria-label="Indicadores por fila">
    <p className={styles.period}>Período: {config.startDate.split('-').reverse().join('/')} a {config.endDate.split('-').reverse().join('/')}</p>
    {config.visualization === 'table' ? (
      <div className={styles.scroll}>
        <table className={styles.table}>
          <caption className={styles.caption}>Indicadores por fila no intervalo configurado</caption>
          <thead><tr>
            <th scope="col">Fila</th>
            <th scope="col">Recebidas</th>
            <th scope="col">Atendidas</th>
            <th scope="col">Abandonadas</th>
            <th scope="col">Atendimento</th>
          </tr></thead>
          <tbody>{displayed.map(row => <tr key={row.id}>
            <th scope="row">{row.name}</th>
            <td>{countFormat.format(row.received)}</td>
            <td>{countFormat.format(row.answered)}</td>
            <td>{countFormat.format(row.abandoned)}</td>
            <td>{row.serviceRate === null ? 'N/A' : rateFormat.format(row.serviceRate) + '%'}</td>
          </tr>)}</tbody>
        </table>
      </div>
    ) : (
      <div className={config.orientation === 'horizontal' ? styles.horizontal : styles.vertical}>
        <div className={styles.legend}>
          {metrics.map(metric => <span key={metric.field}>
            <i className={styles[metric.className]} aria-hidden="true" />{metric.label}
          </span>)}
        </div>
        <div className={styles.chart} role="list" aria-label="Comparação de chamadas por fila">
          {displayed.map(row => <div className={styles.queue} key={row.id} role="listitem"
            aria-label={row.name + ': ' + row.received + ' recebidas, ' +
              row.answered + ' atendidas, ' + row.abandoned + ' abandonadas; atendimento ' +
              (row.serviceRate === null ? 'não aplicável' : rateFormat.format(row.serviceRate) + ' por cento')}>
            <strong title={row.name}>{row.name}</strong>
            <div className={styles.metricBars}>{metrics.map(metric => <div
              className={styles.metric} key={metric.field}
              title={metric.label + ': ' + countFormat.format(row[metric.field])}>
              <div className={styles.track}>
                <div className={styles[metric.className]}
                  style={{ '--bar-size': String(row[metric.field] / maximum * 100) + '%' } as React.CSSProperties} />
              </div>
              <span>{countFormat.format(row[metric.field])}</span>
            </div>)}</div>
            <small>Atendimento: {row.serviceRate === null ? 'N/A' : rateFormat.format(row.serviceRate) + '%'}</small>
          </div>)}
        </div>
      </div>
    )}
  </section>;
}
