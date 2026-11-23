'use client';

import { useId, useState, type FocusEvent, type MouseEvent } from 'react';
import type { ChartMetric } from '@/lib/call-chart-data';
import { availableAnnualMean } from '@/lib/ligsim-report-data';
import styles from './call-center.module.css';
import ChartTooltip, { pointFromMouse, pointFromFocus } from './chart-tooltip';

type Metric = { key: ChartMetric; current: number; previous: number; variation: number | null; mean: number };
type Props = {
  metrics: Metric[];
  year: number;
  hasCurrent: boolean;
  hasPrevious: boolean;
  meanMetric: ChartMetric;
};

type HoveredColumn = { key: ChartMetric; year: number; x: number; y: number };

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
const meanColor = '#f1b944';

function axisCeiling(values: number[]): number {
  const maximum = Math.max(0, ...values);
  if (!maximum) return 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(1, maximum / 4))));
  const tick = Math.max(1, Math.ceil((maximum * 1.12 / 4) / magnitude) * magnitude);
  return tick * 4;
}

/**
 * Presentation only. The annual totals come from the existing aggregation module.
 * A missing year never becomes zero. With two recorded years the dashed line is
 * their arithmetic mean; with one year it is explicitly labeled a reference
 * to that observed year, never an interannual mean.
 */
export default function AnnualVerticalColumns({ metrics, year, hasCurrent, hasPrevious, meanMetric }: Props) {
  const tooltipId = useId();
  const [hovered, setHovered] = useState<HoveredColumn | null>(null);
  const actualValues = metrics.flatMap(metric => [
    ...(hasPrevious ? [metric.previous] : []),
    ...(hasCurrent ? [metric.current] : []),
  ]);
  const maximum = axisCeiling(actualValues);
  const scaleY = (value: number) => bottom - (value / maximum) * height;
  const chosen = metrics.find(metric => metric.key === meanMetric);
  const hasBothYears = hasCurrent && hasPrevious;
  const referenceYear = hasCurrent ? year : year - 1;
  const mean = chosen
    ? availableAnnualMean(chosen.current, chosen.previous, hasCurrent, hasPrevious) : null;
  const highlighted = hovered ? metrics.find(metric => metric.key === hovered.key) : null;
  const hoveredMean = highlighted
    ? availableAnnualMean(highlighted.current, highlighted.previous, hasCurrent, hasPrevious) : null;

  const showFromMouse = (event: MouseEvent<SVGRectElement>, key: ChartMetric, columnYear: number) => {
    const { x, y } = pointFromMouse(event);
    setHovered(previous => previous?.key === key && previous.year === columnYear &&
      Math.abs(previous.x - x) < 5 && Math.abs(previous.y - y) < 5 ?
      previous : { key, year: columnYear, x, y });
  };

  const showFromKeyboard = (event: FocusEvent<SVGRectElement>, key: ChartMetric, columnYear: number) => {
    const { x, y } = pointFromFocus(event);
    setHovered({ key, year: columnYear, x, y });
  };

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
    const active = hovered?.key === metric.key && hovered.year === columnYear;
    return (
      <g key={columnYear}>
        <rect data-testid={'annual-column-' + metric.key + '-' + columnYear}
          x={x} y={bottom - barHeight} width={barWidth} height={barHeight}
          rx={3} fill={isCurrent ? currentColor : previousColor}
          tabIndex={0} aria-label={label} aria-describedby={active ? tooltipId : undefined}
          onMouseEnter={event => showFromMouse(event, metric.key, columnYear)}
          onMouseMove={event => showFromMouse(event, metric.key, columnYear)}
          onMouseLeave={() => setHovered(null)}
          onFocus={event => showFromKeyboard(event, metric.key, columnYear)}
          onBlur={() => setHovered(null)} />
        <text x={center} y={Math.max(top + 13, bottom - barHeight - 9)}
          textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--text)" pointerEvents="none">
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
        <i style={{ borderTopColor: meanColor }} aria-hidden="true"/>
        {hasBothYears
          ? 'Média  ' + (year - 1) + '–' + year + ' de ' + labels[meanMetric].toLowerCase() + ': ' + format(mean)
          : 'Referência ' + referenceYear + ' de ' + labels[meanMetric].toLowerCase() + ': ' + format(mean)}
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
          <line data-testid={hasBothYears ? 'annual-mean-horizontal-line' : 'annual-reference-horizontal-line'}
            x1={left} x2={right} y1={scaleY(mean)} y2={scaleY(mean)}
            stroke={meanColor} strokeWidth={hasBothYears ? 3 : 2} strokeDasharray={hasBothYears ? '9 6' : '5 7'}/>
          <text x={right - 6} y={Math.max(top + 12, scaleY(mean) - 10)}
            textAnchor="end" fontSize="12" fontWeight="700" fill={meanColor}>
            {hasBothYears ? 'Média' : 'Ref. ' + referenceYear}: {format(mean)}
          </text>
        </g>}
        <text x={(left + right) / 2} y={409} textAnchor="middle" fontSize="12" fill="var(--cc-muted)">
          Indicadores de chamadas
        </text>
      </svg>
    </div>

    <ChartTooltip id={tooltipId} testId="annual-column-tooltip"
      open={Boolean(hovered && highlighted)}
      point={hovered ? { x: hovered.x, y: hovered.y } : null}
      title={hovered && highlighted ? labels[highlighted.key] + ' · ' + hovered.year : ''}
      values={hovered && highlighted ? [
        { label: 'Chamadas', value: format(hovered.year === year ? highlighted.current : highlighted.previous), color: hovered.year === year ? currentColor : previousColor },
        { label: hasBothYears ? 'Média entre anos' : 'Referência ' + referenceYear,
          value: hoveredMean === null ? '—' : format(hoveredMean) },
        { label: 'Variação', value: hasBothYears
          ? highlighted.variation === null ? 'Indefinida (base zero)' :
            (highlighted.variation > 0 ? '+' : '') + format(highlighted.variation) + '%'
          : '— (sem dados em ' + (hasCurrent ? year - 1 : year) + ')' },
      ] : []}/>
    <p className={styles.annualTooltip} role="status" aria-live="polite">
      {highlighted && hovered ?
        labels[highlighted.key] + ' · ' + hovered.year + ': ' +
        format(hovered.year === year ? highlighted.current : highlighted.previous) + ' chamadas' : ''}
    </p>
  </div>;
}
