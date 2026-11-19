'use client';

import { useEffect, useMemo, useState } from 'react';
import type { RpcRow } from '@/lib/call-dashboard-aggregates';
import { annualRanges, localToday, monthlyData, parseAggregateRows, type ChartMetric } from '@/lib/call-chart-data';
import HourlyLineChart from './hourly-line-chart';

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
  const [meanMetric, setMeanMetric] = useState<ChartMetric>('total');
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true); setError(''); setSelectedMonth(null);
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
  return <div>
    <section className="panel" style={{ padding: 20, marginBottom: 18 }}>
      <div className="panel-head"><div><h2>Chamadas por mês</h2><p>Barras horizontais agrupadas; recebidas incluem todas as situações.</p></div>
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
      {data && <div style={{ display: 'grid', gap: 12 }}>
        {data.buckets.map((row, index) => {
          const available = row.status === 'recorded' || row.status === 'partial';
          return <div key={index} style={{ display: 'grid', gridTemplateColumns: '36px minmax(0,1fr) 90px', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 12 }}>{months[index]}</span>
            <button type="button" disabled={!available} aria-pressed={selectedMonth === index}
              aria-label={`${months[index]}: ${available ? `${row.total} recebidas, ${row.atendidas} atendidas, ${row.abandonadas} abandonadas` : row.status === 'future' ? 'mes futuro' : 'sem registros; cobertura nao comprovada'}`}
              onClick={() => setSelectedMonth(selectedMonth === index ? null : index)}
              style={{ position: 'relative', display: 'grid', gap: 3, width: '100%', height: 45, padding: 0, border: 0,
                background: 'var(--soft)', cursor: available ? 'pointer' : 'default', outlineOffset: 3 }}>
              {series.map(item => <span key={item.key} style={{ height: 13, width: `${available ? row[item.key] / max * 100 : 0}%`, background: item.color }} />)}
              {available && mean !== null && <span aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0,
                left: `${mean / max * 100}%`, borderLeft: '2px dashed var(--text)', pointerEvents: 'none' }} />}
            </button>
            <span style={{ fontSize: 11, textAlign: 'right' }}>{available ? `${fmt(row.total)}${row.status === 'partial' ? ' (parcial)' : ''}` : row.status === 'future' ? 'Futuro' : 'Sem registros'}</span>
          </div>;
        })}
      </div>}
      {selected && <p role="status" style={{ fontSize: 12 }}>{months[selected.month]}: {fmt(selected.total)} recebidas; {fmt(selected.atendidas)} atendidas; {fmt(selected.abandonadas)} abandonadas; {fmt(selected.nao_atendidas)} sem atendimento; {fmt(selected.outras)} outras.</p>}
      <p style={{ fontSize: 12 }}>{mean === null ? 'Media indisponivel: nenhum mes encerrado com registros.' : `Linha tracejada: media de ${meanLabel.toLowerCase()} = ${fmt(mean)}, em ${data?.meanMonthCount} meses encerrados com registros.`}</p>
      <p style={{ fontSize: 11, opacity: .75 }}>Mês corrente, meses futuros e meses sem registros não entram na média. Ausência de registros não comprova volume zero. A presença de dados também não comprova a integração completa do histórico.</p>
    </section>
    {showHourly && <HourlyLineChart start={rangeStart} end={rangeEnd} refreshKey={refreshKey} />}
  </div>;
}
