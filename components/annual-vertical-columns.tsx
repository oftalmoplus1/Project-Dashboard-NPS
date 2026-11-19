'use client';

import { useState } from 'react';
import type { ChartMetric } from '@/lib/call-chart-data';
import styles from './call-center.module.css';

type Metric = { key: ChartMetric; current: number; previous: number; variation: number | null; mean: number };
type Props = {
  metrics: Metric[];
  year: number;
  hasCurrent: boolean;
  hasPrevious: boolean;
  meanMetric: ChartMetric;
};

const labels: Record<ChartMetric, string> = {
  total: 'Recebidas', atendidas: 'Atendidas', abandonadas: 'Abandonadas',
};
const format = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const left = 78;
const right = 888;
const top = 36;
const bottom = 346;
const height = bottom - top;
const centers = [207, 483, 759];
const barWidth = 66;
const previousColor = '#8e9aab';
const currentColor = '#3185e7';

function axisCeiling(values: number[]): number {
  const maximum = Math.max(0, ...values);
  if (!maximum) return 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(1, maximum / 4))));
  const tick = Math.max(1, Math.ceil((maximum * 1.12 / 4) / magnitude) * magnitude);
  return tick * 4;
}

/**
 * Presentation only. Metrics are calculated by the existing aggregation module;
 * missing history is not rendered as a zero-height column.
 */
export default function AnnualVerticalColumns({ metrics, year, hasCurrent, hasPrevious, meanMetric }: Props) {
  const [hovered, setHovered] = useState<{ key: ChartMetric; year: number } | null>(null);
  const actualValues = metrics.flatMap(metric => [
    ...(hasPrevious ? [metric.previous] : []),
    ...(hasCurrent ? [metric.current] : []),
  ]);
  const maximum = axisCeiling(actualValues);
  const scaleY = (value: number) => bottom - (value / maximum) * height;
  const chosen = metrics.find(metric => metric.key === meanMetric);
  const mean = hasCurrent && hasPrevious && chosen ? chosen.mean : null;
  const highlighted = hovered ? metrics.find(metric => metric.key === hovered.key) : null;

  const drawColumn = (metric: Metric, index: number, isCurrent: boolean) => {
    const value = isCurrent ? metric.current : metric.previous;
    const columnYear = isCurrent ? year : year - 1;
    const available = isCurrent ? hasCurrent : hasPrevious;
    const x = centers[index] + (isCurrent ? 7 : -barWidth - 7);
    const center = x + barWidth / 2;

    if (!available) return (
      <text key={columnYear} data-testid={'annual-missing-' + metric.key + '-' + columnYear}
        x={center} y={bottom - 12} textAnchor="middle" fill="var(--cc-muted)" fontSize="12">
        Sem dados
      </text>
    );

    const y = scaleY(value);
    const barHeight = value === 0 ? 0 : Math.max(2, bottom - y);
    const label = labels[metric.key] + ', ' + columnYear + ': ' + format(value) + ' chamadas';
    return (
      <g key={columnYear}>
        <rect data-testid={'annual-column-' + metric.key + '-' + columnYear}
          x={x} y={bottom - barHeight} width={barWidth} height={barHeight}
          rx={3} fill={isCurrent ? currentColor : previousColor}
          tabIndex={0} aria-label={label}
          onMouseEnter={() => setHovered({ key: metric.key, year: columnYear })}
          onMouseLeave={() => setHovered(null)}
          onFocus={() => setHovered({ key: metric.key, year: columnYear })}
          onBlur={() => setHovered(null)}>
          <title>{label}</title>
        </rect>
        <text x={center} y={Math.max(top + 13, bottom - barHeight - 9)}
          textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--text)">
          {format(value)}
        </text>
      </g>
    );
  };

  return <div className={styles.annualVisualization}>
    <div className={styles.annualLegend} aria-label="Legenda dos anos">
      <span><i style={{ background: previousColor }} aria-hidden="true" />{year - 1}</span>
      <span><i style={{ background: currentColor }} aria-hidden="true" />{year}</span>
      {mean !== null && <span className={styles.annualMeanLegend}>
        <i aria-hidden="true" />Média de {labels[meanMetric].toLowerCase()}: {format(mean)}
      </span>}
    </div>

    <div className={styles.annualChartScroll}>
      <svg data-testid="annual-vertical-chart" className={styles.annualChart}
        viewBox="0 0 920 415" xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={'Gráfico de colunas verticais agrupadas comparando ' + (year - 1) + ' e ' + year +
          ' nos indicadores recebidas, atendidas e abandonadas. O eixo vertical representa o volume de chamadas.'}>
        <text x="20" y="18" fontSize="12" fill="var(--cc-muted)">Chamadas</text>
        {[0, 1, 2, 3, 4].map(index => {
          const tickValue = maximum * index / 4;
          const y = scaleY(tickValue);
          return <g key={index}>
            <line x1={left} x2={right} y1={y} y2={y}
              stroke="var(--border)" strokeWidth={1} strokeDasharray={index ? '4 5' : undefined}/>
            <text x={left - 13} y={y + 5} textAnchor="end" fontSize="12" fill="var(--cc-muted)">
              {format(tickValue)}
            </text>
          </g>;
        })}
        <line x1={left} x2={left} y1={top} y2={bottom} stroke="var(--cc-muted)" strokeWidth={1}/>
        {metrics.map((metric, index) => <g key={metric.key}>
          {drawColumn(metric, index, false)}
          {drawColumn(metric, index, true)}
          <text x={centers[index]} y={bottom + 31} textAnchor="middle"
            fontSize="14" fontWeight="600" fill="var(--text)">{labels[metric.key]}</text>
        </g>)}
        {mean !== null && <g pointerEvents="none">
          <line data-testid="annual-mean-horizontal-line"
            x1={left} x2={right} y1={scaleY(mean)} y2={scaleY(mean)}
            stroke="var(--text)" strokeWidth={2} strokeDasharray="8 6" />
          <text x={right - 6} y={Math.max(top + 12, scaleY(mean) - 9)}
            textAnchor="end" fontSize="12" fontWeight="600" fill="var(--text)">
            Média: {format(mean)}
          </text>
        </g>}
        <text x={(left + right) / 2} y={409} textAnchor="middle" fontSize="12" fill="var(--cc-muted)">
          Indicadores de chamadas
        </text>
      </svg>
    </div>
    <p className={styles.annualTooltip} role="status">
      {highlighted && hovered ?
        labels[highlighted.key] + ' · ' + hovered.year + ': ' +
        format(hovered.year === year ? highlighted.current : highlighted.previous) + ' chamadas' :
        'Passe o mouse ou use Tab para consultar o valor de cada coluna.'}
    </p>
  </div>;
}
