'use client';

import { useEffect, useMemo, useState } from 'react';
import { localToday, parseAggregateRows, type ChartMetric } from '@/lib/call-chart-data';
import { annualComparison, annualMetrics, comparisonWindows } from '@/lib/ligsim-report-data';

const labels: Record<ChartMetric, string> = { total: 'Recebidas', atendidas: 'Atendidas', abandonadas: 'Abandonadas' };
const format = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
type Snapshot = { key: string; current: ReturnType<typeof annualMetrics>; previous: ReturnType<typeof annualMetrics> };
type Props = { year: number; onYearChange: (value: number) => void; currentYear: number; refreshKey: number };

export default function AnnualCallComparison({ year, onYearChange, currentYear, refreshKey }: Props) {
  const today = localToday(new Date());
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [selected, setSelected] = useState<ChartMetric>('total');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const key = year + ':' + today;
  const windows = useMemo(() => {
    try { return comparisonWindows(year, today); } catch { return null; }
  }, [year, today]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setError(''); setLoading(true); setSnapshot(null);
    const load = async () => {
      try {
        if (!windows) throw new Error('Ano de comparacao invalido.');
        const loadYear = async (window: typeof windows.current) => {
          const groups = await Promise.all(window.ranges.map(async range => {
            const params = new URLSearchParams({ start: range.start, end: range.end });
            const response = await fetch('/api/chamadas?' + params, { cache: 'no-store', signal: controller.signal });
            if (!response.ok) throw new Error(response.status === 401 || response.status === 403
              ? 'Acesso negado ao historico.' : 'Historico anual indisponivel ou incompleto.');
            return parseAggregateRows(await response.json(), range);
          }));
          return annualMetrics({ rows: groups.flat() }, window.year, window.end);
        };
        const [current, previous] = await Promise.all([loadYear(windows.current), loadYear(windows.previous)]);
        if (active) setSnapshot({ key, current, previous });
      } catch (cause) {
        if (active && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Erro ao comparar anos.');
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; controller.abort(); };
  }, [windows, key, refreshKey]);

  const metrics = snapshot?.key === key ? annualComparison(snapshot.current, snapshot.previous) : null;
  const mean = metrics?.find(metric => metric.key === selected)?.mean ?? null;
  const max = Math.max(1, ...(metrics?.flatMap(metric => [metric.current, metric.previous]) ?? []));
  const bothEmpty = metrics && metrics.every(metric => metric.current === 0 && metric.previous === 0);
  return <section className="panel" style={{ padding: 20 }}>
    <div className="panel-head">
      <div><h2>Comparativo anual de chamadas</h2><p>Recebidas, atendidas e abandonadas por ano. Barras horizontais e variação percentual.</p></div>
      <label>Ano <select aria-label="Ano da comparação anual" value={year} onChange={event => onYearChange(Number(event.target.value))}>
        {Array.from({ length: 5 }, (_, index) => currentYear - index).map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>
    </div>
    {windows && <p style={{ fontSize: 12 }}>Comparação {windows.current.year} x {windows.previous.year}.
      {windows.partial ? ' Períodos equivalentes: 01/01 até ' + windows.current.end.slice(8) + '/' + windows.current.end.slice(5,7) + ' em cada ano.' : ' Ambos os anos civis completos.'}
    </p>}
    <label style={{ fontSize: 12 }}>Linha vertical de média: <select aria-label="Série da média anual" value={selected}
      onChange={event => setSelected(event.target.value as ChartMetric)}>
      {(Object.keys(labels) as ChartMetric[]).map(k => <option key={k} value={k}>{labels[k]}</option>)}
    </select></label>
    {loading && <p role="status">Consultando períodos anuais...</p>}
    {error && <p role="alert">{error} Não foram exibidos resultados parciais como completos.</p>}
    {bothEmpty && <p>Sem registros nos dois períodos. A cobertura histórica não foi comprovada.</p>}
    {metrics && !bothEmpty && <div style={{ display: 'grid', gap: 20, paddingTop: 18 }}>
      {metrics.map(metric => <div key={metric.key}>
        <strong style={{ fontSize: 13 }}>{labels[metric.key]}</strong>
        <div style={{ position: 'relative', display: 'grid', gap: 6, marginTop: 8, background: 'var(--soft)', padding: 8, borderRadius: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '50px minmax(0,1fr) 70px', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12 }}>{year}</span>
            <div style={{ height: 17, background: 'transparent' }}><div style={{ height: '100%', width: (metric.current / max * 100) + '%', background: '#2d74ca' }}/></div>
            <span style={{ fontSize: 12, textAlign: 'right' }}>{format(metric.current)}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '50px minmax(0,1fr) 70px', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12 }}>{year - 1}</span>
            <div style={{ height: 17 }}><div style={{ height: '100%', width: (metric.previous / max * 100) + '%', background: '#7e8995' }}/></div>
            <span style={{ fontSize: 12, textAlign: 'right' }}>{format(metric.previous)}</span>
          </div>
          {metric.key === selected && mean !== null && <div aria-hidden="true" style={{ position: 'absolute', top: 6, bottom: 6, left: 'calc(66px + (100% - 148px) * ' + (mean / max) + ')', borderLeft: '2px dashed var(--text)', pointerEvents: 'none' }}/>}
        </div>
        <p style={{ fontSize: 12, marginTop: 5 }}>
          Variação: {metric.variation === null ? '— (base anterior igual a zero; crescimento indefinido)' :
            (metric.variation > 0 ? '+' : '') + metric.variation.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%'}
        </p>
      </div>)}
      <p style={{ fontSize: 12 }}>Linha tracejada: média entre os dois valores anuais de {labels[selected].toLowerCase()} = {format(mean ?? 0)}.
        O aumento do volume não representa automaticamente melhora do atendimento.</p>
      <p style={{ fontSize: 11, opacity: .75 }}>Os números vêm dos registros disponíveis no Supabase. Consulta concluída não comprova histórico integralmente sincronizado com a LigSim.</p>
    </div>}
  </section>;
}
