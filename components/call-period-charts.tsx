'use client';

import { useEffect, useMemo, useState } from 'react';
import type { RpcRow } from '@/lib/call-dashboard-aggregates';
import { annualRanges, localToday, monthlyData, parseAggregateRows, type ChartMetric } from '@/lib/call-chart-data';
import HourlyLineChart from './hourly-line-chart';
import ChartTooltip, { pointFromMouse, pointFromFocus, type TooltipPoint } from './chart-tooltip';

const series = [
  { key: 'atendidas', label: 'Atendidas', color: '#12b981' },
  { key: 'total', label: 'Recebidas', color: '#2d74ca' },
  { key: 'abandonadas', label: 'Abandonadas', color: '#f05a73' },
] as const;
const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const fmt = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
type Props = {
  rows: RpcRow[]; rangeStart: string; rangeEnd: string; year: number;
  onYearChange: (year: number) => void; currentYear: number; refreshKey: number;
  showHourly?: boolean;
};
export default function CallPeriodCharts({ rangeStart, rangeEnd, year, onYearChange, currentYear, refreshKey, showHourly = true }: Props) {
  const asOf = localToday(new Date());
  const snapshotKey = `${year}:${asOf}`;
  const [annual, setAnnual] = useState<{ key: string; rows: RpcRow[] } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);
  const [tooltipPoint, setTooltipPoint] = useState<TooltipPoint | null>(null);
  const [meanMetric, setMeanMetric] = useState<ChartMetric>('total');
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true); setError(''); setSelectedMonth(null); setHoveredMonth(null);
    const load = async () => {
      try {
        const ranges = annualRanges(year, asOf);
        const groups = await Promise.all(ranges.map(async range => {
          const response = await fetch(`/api/chamadas?start=${range.start}&end=${range.end}`, {
            cache: 'no-store', signal: controller.signal,
          });
          if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
              if (active) setAnnual(null);
              throw new Error('Acesso nao autorizado.');
            }
            throw new Error('Nao foi possivel consultar todos os meses.');
          }
          return parseAggregateRows(await response.json(), range);
        }));
        const all = groups.flat();
        monthlyData(all, year, asOf);
        if (active) setAnnual({ key: snapshotKey, rows: all });
      } catch (cause) {
        if (active && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Falha na consulta mensal.');
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; controller.abort(); };
  }, [year, asOf, snapshotKey, refreshKey]);
  const data = useMemo(() => annual?.key === snapshotKey ? monthlyData(annual.rows, year, asOf) : null,
    [annual, snapshotKey, year, asOf]);
  const max = Math.max(1, ...(data?.buckets.map(row => row.total) ?? []));
  const mean = data?.averages[meanMetric] ?? null;
  const meanLabel = series.find(item => item.key === meanMetric)!.label;
  const selected = selectedMonth === null ? null : data?.buckets[selectedMonth];
  const highlightedIndex = hoveredMonth ?? selectedMonth;
  const highlighted = highlightedIndex === null ? null : data?.buckets[highlightedIndex];
  const ceiling = Math.max(4, Math.ceil(max / 4) * 4);
  const plotLeft = 58, plotRight = 1092, plotBottom = 305, plotHeight = 251;
  const chartY = (value: number) => plotBottom - value / ceiling * plotHeight;
  const monthX = (index: number) => plotLeft + (index + .5) * (plotRight - plotLeft) / 12;
  return <div>
    <section className="panel" style={{ padding: 20, marginBottom: 18 }}>
      <div className="panel-head"><div><h2>Chamadas por mês</h2><p>Colunas verticais agrupadas; recebidas incluem todas as situações.</p></div>
        <label>Ano <select aria-label="Selecionar ano do grafico mensal" value={year} onChange={event => onYearChange(Number(event.target.value))}>
          {Array.from({ length: 5 }, (_, index) => currentYear - index).map(value => <option key={value}>{value}</option>)}
        </select></label>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        {series.map(item => <span key={item.key} style={{ fontSize: 12 }}>
          <span aria-hidden="true" style={{ display: 'inline-block', width: 11, height: 11, marginRight: 6, background: item.color }} />{item.label}
        </span>)}
        <label style={{ fontSize: 12 }}>Média de <select aria-label="Serie da media mensal" value={meanMetric}
          onChange={event => setMeanMetric(event.target.value as ChartMetric)}>
          {series.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select></label>
      </div>
      {loading && <p role="status">Atualizando comparação mensal...</p>}
      {error && <p role="alert">{error} {data ? 'Exibindo a ultima consulta valida para este mesmo ano e corte.' : ''}</p>}
      {data && <div style={{ width: '100%', overflowX: 'auto', marginBottom: 12 }}
        aria-label="Gráfico de colunas verticais agrupadas por mês. Passe o mouse ou use Tab para detalhar cada mês.">
        <svg viewBox="0 0 1140 355" role="group" aria-label="Atendidas, recebidas e abandonadas por mês"
          style={{ display: 'block', width: '100%', minWidth: 770, height: 'auto' }}>
          {[0, 1, 2, 3, 4].map(tick => {
            const value = ceiling * tick / 4;
            const y = chartY(value);
            return <g key={tick}>
              <line x1={plotLeft} x2={plotRight} y1={y} y2={y}
                stroke="var(--border)" strokeDasharray={tick ? '4 5' : undefined}/>
              <text x={plotLeft - 9} y={y + 4} textAnchor="end" fill="var(--muted)" fontSize={12}>{fmt(value)}</text>
            </g>;
          })}
          <text x={12} y={22} fill="var(--muted)" fontSize={12}>Chamadas</text>
          {data.buckets.map((row, index) => {
            const available = row.status === 'recorded' || row.status === 'partial';
            const slot = (plotRight - plotLeft) / 12;
            const groupStart = monthX(index) - 31;
            return <g key={index}>
              {highlightedIndex === index && available && <rect x={monthX(index) - slot / 2 + 2} y={42}
                width={slot - 4} height={plotBottom - 40} fill="var(--soft)" opacity={.62} rx={5} pointerEvents="none"/>}
              {available ? series.map((item, serieIndex) => {
                const value = row[item.key];
                const h = Math.max(value > 0 ? 2 : 0, plotBottom - chartY(value));
                return <rect key={item.key} x={groupStart + serieIndex * 22} y={plotBottom - h}
                  width={18} height={h} rx={3} fill={item.color} pointerEvents="none"
                  style={{ transition: 'opacity 180ms ease-out' }}
                  opacity={highlightedIndex === null || highlightedIndex === index ? 1 : .72}/>;
              }) : <text x={monthX(index)} y={plotBottom - 10} textAnchor="middle" fill="var(--muted)"
                fontSize={10}>{row.status === 'future' ? 'Futuro' : 'Sem registros'}</text>}
              <text x={monthX(index)} y={plotBottom + 22} textAnchor="middle" fontSize={13}
                fill="var(--text)">{months[index]}{row.status === 'partial' ? '*' : ''}</text>
              {available && <rect x={monthX(index) - slot / 2 + 2} y={42}
                width={slot - 4} height={plotBottom - 40} fill="transparent" role="button"
                tabIndex={0} aria-pressed={selectedMonth === index}
                aria-label={`${months[index]}: ${row.total} recebidas, ${row.atendidas} atendidas, ${row.abandonadas} abandonadas${row.status === 'partial' ? ', mês parcial' : ''}`}
                style={{ cursor: 'crosshair' }}
                onMouseEnter={event => { setHoveredMonth(index); setTooltipPoint(pointFromMouse(event)); }}
                onMouseMove={event => setTooltipPoint(pointFromMouse(event))}
                onMouseLeave={() => setHoveredMonth(null)}
                onFocus={event => { setHoveredMonth(index); setTooltipPoint(pointFromFocus(event)); }}
                onBlur={() => setHoveredMonth(null)}
                onClick={event => { setTooltipPoint(pointFromMouse(event)); setSelectedMonth(selectedMonth === index ? null : index); }}
                onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault(); setSelectedMonth(selectedMonth === index ? null : index);
                } }}/>}
            </g>;
          })}
          {mean !== null && <g pointerEvents="none">
            <line x1={plotLeft} x2={plotRight} y1={chartY(mean)} y2={chartY(mean)}
              stroke="var(--text)" strokeWidth={2} strokeDasharray="7 5"/>
            <text x={plotRight - 4} y={Math.max(20, chartY(mean) - 8)}
              textAnchor="end" fill="var(--text)" fontSize={11}>Média: {fmt(mean)}</text>
          </g>}
        </svg>
      </div>}
      <ChartTooltip open={Boolean(highlighted)} point={tooltipPoint}
        title={highlightedIndex === null ? '' : `${months[highlightedIndex]} / ${year}`}
        values={highlighted ? [
          ...series.map(item => ({ label: item.label, value: fmt(highlighted[item.key]), color: item.color })),
          { label: 'Sem atendimento', value: fmt(highlighted.nao_atendidas) },
          { label: 'Outras', value: fmt(highlighted.outras) },
        ] : []}
        note={highlighted?.status === 'partial' ? 'Mês corrente: dados parciais.' : undefined}/>
      {selected && <p role="status" style={{ fontSize: 12 }}>{months[selected.month]}: {fmt(selected.total)} recebidas; {fmt(selected.atendidas)} atendidas; {fmt(selected.abandonadas)} abandonadas; {fmt(selected.nao_atendidas)} sem atendimento; {fmt(selected.outras)} outras.</p>}
      <p style={{ fontSize: 12 }}>{mean === null ? 'Media indisponivel: nenhum mes encerrado com registros.' : `Linha tracejada: media de ${meanLabel.toLowerCase()} = ${fmt(mean)}, em ${data?.meanMonthCount} meses encerrados com registros.`}</p>
      <p style={{ fontSize: 11, opacity: .75 }}>Mês corrente, meses futuros e meses sem registros não entram na média. Ausência de registros não comprova volume zero. A presença de dados também não comprova a integração completa do histórico.</p>
    </section>
    {showHourly && <HourlyLineChart start={rangeStart} end={rangeEnd} refreshKey={refreshKey} />}
  </div>;
}
