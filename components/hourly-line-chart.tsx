'use client';

import { useEffect, useMemo, useState } from 'react';
import { parseHourlyRows, sumCounts, type HourRow } from '@/lib/call-chart-data';
import ChartTooltip, { pointFromMouse, pointFromFocus, type TooltipPoint } from './chart-tooltip';

const series = [
  { key: 'atendidas', label: 'Atendidas', color: '#12b981' },
  { key: 'total', label: 'Recebidas', color: '#2d74ca' },
  { key: 'abandonadas', label: 'Abandonadas', color: '#f05a73' },
] as const;
const fmt = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
export default function HourlyLineChart({ start, end, refreshKey }: { start: string; end: string; refreshKey: number }) {
  const key = `${start}:${end}`;
  const [snapshot, setSnapshot] = useState<{ key: string; rows: HourRow[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [tooltipPoint, setTooltipPoint] = useState<TooltipPoint | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true); setError(''); setSelected(null); setHovered(null);
    const load = async () => {
      try {
        const response = await fetch(`/api/chamadas/por-hora?start=${start}&end=${end}`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            if (active) setSnapshot(null);
            throw new Error('Sessao expirada ou acesso negado.');
          }
          throw new Error('Agregacao por hora indisponivel.');
        }
        const rows = parseHourlyRows(await response.json());
        sumCounts(rows);
        if (active) setSnapshot({ key, rows });
      } catch (cause) {
        if (active && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Falha na consulta horaria.');
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; controller.abort(); };
  }, [start, end, key, refreshKey]);
  const rows = snapshot?.key === key ? snapshot.rows : null;
  const total = useMemo(() => rows ? sumCounts(rows) : null, [rows]);
  // Mantemos a linha de média de chamadas recebidas sem controles adicionais.
  const mean = total ? total.total / 24 : null;
  const ceiling = Math.max(4, Math.ceil(Math.max(1, ...(rows?.map(row => row.total) ?? [])) / 4) * 4);
  const x = (hour: number) => 48 + hour / 23 * 842;
  const y = (count: number) => 263 - count / ceiling * 245;
  const highlight = hovered ?? selected;
  const activeRow = highlight === null ? null : rows?.[highlight];
  const selectedRow = selected === null ? null : rows?.[selected];
  return <section className="panel" style={{ padding: 20, marginBottom: 18 }}>
    <div className="panel-head"><div><h2>Chamadas por hora</h2><p>Volume acumulado em cada faixa de 1 hora no período selecionado; horário de Brasília.</p></div></div>
    {loading && <p role="status">Atualizando dados horários...</p>}
    {error && <p role="alert">{error} {rows ? 'Exibindo a ultima consulta valida para o mesmo periodo.' : 'Nenhum valor foi estimado ou substituido por zero.'}</p>}
    {rows && <>
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox="0 0 920 315" role="group" aria-label="Chamadas recebidas, atendidas e abandonadas por hora; selecione uma hora para detalhar"
          style={{ display: 'block', width: '100%', minWidth: 620, height: 'auto' }}>
          {[0, 1, 2, 3, 4].map(index => <g key={index}>
            <line x1={48} x2={890} y1={y(ceiling * index / 4)} y2={y(ceiling * index / 4)} stroke="var(--border)" strokeDasharray="3 4" />
            <text x={38} y={y(ceiling * index / 4) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{fmt(ceiling * index / 4)}</text>
          </g>)}
          {rows.filter(row => row.hora % 2 === 0 || row.hora === 23).map(row => <text key={row.hora} x={x(row.hora)} y={287} textAnchor="middle" fontSize={11} fill="var(--muted)">{row.hora}h</text>)}
          {mean !== null && <line x1={48} x2={890} y1={y(mean)} y2={y(mean)} stroke="var(--text)" strokeWidth={1.5} strokeDasharray="7 5"><title>Média de recebidas: {fmt(mean)}</title></line>}
          {series.map(item => <g key={item.key}>
            <path d={rows.map((row, index) => `${index ? 'L' : 'M'}${x(row.hora)},${y(row[item.key])}`).join(' ')} fill="none" stroke={item.color} strokeWidth={2.5} />
            {rows.map(row => <circle key={row.hora} cx={x(row.hora)} cy={y(row[item.key])} r={highlight === row.hora ? 5 : 3} fill={item.color} />)}
          </g>)}
          {highlight !== null && <line x1={x(highlight)} x2={x(highlight)} y1={18} y2={263} stroke="var(--muted)" strokeDasharray="4 4" />}
          {rows.map(row => <rect key={row.hora} x={Math.max(36, x(row.hora) - 18)} y={18} width={36} height={250}
            fill="transparent" role="button" tabIndex={0} aria-pressed={selected === row.hora}
            aria-label={`${row.hora}h: ${row.total} recebidas, ${row.atendidas} atendidas, ${row.abandonadas} abandonadas`}
            onMouseEnter={event => { setHovered(row.hora); setTooltipPoint(pointFromMouse(event)); }}
            onMouseMove={event => setTooltipPoint(pointFromMouse(event))}
            onMouseLeave={() => setHovered(null)}
            onFocus={event => { setHovered(row.hora); setTooltipPoint(pointFromFocus(event)); }}
            onBlur={() => setHovered(null)}
            onClick={event => { setTooltipPoint(pointFromMouse(event)); setSelected(selected === row.hora ? null : row.hora); }}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(selected === row.hora ? null : row.hora); } }} />)}
        </svg>
      </div>
      <ChartTooltip open={Boolean(activeRow)} point={tooltipPoint}
        title={activeRow ? `${activeRow.hora}h – ${activeRow.hora}h59` : ''}
        values={activeRow ? [
          ...series.map(item => ({ label: item.label, value: fmt(activeRow[item.key]), color: item.color })),
          { label: 'Sem atendimento', value: fmt(activeRow.nao_atendidas) },
          { label: 'Outras', value: fmt(activeRow.outras) },
        ] : []}/>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
        {series.map(item => <span key={item.key} style={{ fontSize: 12 }}><span aria-hidden="true" style={{ display: 'inline-block', width: 9, height: 9, marginRight: 6, background: item.color }} />{item.label}</span>)}
      </div>
      {selectedRow && <p role="status">{fmt(selectedRow.total)} recebidas; {fmt(selectedRow.atendidas)} atendidas; {fmt(selectedRow.abandonadas)} abandonadas; {fmt(selectedRow.nao_atendidas)} sem atendimento; {fmt(selectedRow.outras)} outras.</p>}
      <p style={{ fontSize: 12 }}>Linha tracejada: média de recebidas entre as 24 faixas = {mean === null ? '—' : fmt(mean)}. Não representa média por dia nem tempo de espera. O dia atual pode estar parcial.</p>
    </>}
  </section>;
}
