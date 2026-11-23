'use client';

import { useEffect, useMemo, useState } from 'react';
import { localToday, parseAggregateRows, type ChartMetric } from '@/lib/call-chart-data';
import { annualComparison, annualMetrics, availableAnnualMean, comparisonWindows } from '@/lib/ligsim-report-data';
import AnnualVerticalColumns from './annual-vertical-columns';
import styles from './call-center.module.css';

const labels: Record<ChartMetric, string> = { total: 'Recebidas', atendidas: 'Atendidas', abandonadas: 'Abandonadas' };
const format = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
type Snapshot = { key: string; current: ReturnType<typeof annualMetrics>; previous: ReturnType<typeof annualMetrics>; currentRows: number; previousRows: number };
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
          const all = groups.flat();
          return { totals: annualMetrics({ rows: all }, window.year, window.end), count: all.length };
        };
        const [current, previous] = await Promise.all([loadYear(windows.current), loadYear(windows.previous)]);
        if (active) setSnapshot({ key, current: current.totals, previous: previous.totals, currentRows: current.count, previousRows: previous.count });
      } catch (cause) {
        if (active && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Erro ao comparar anos.');
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; controller.abort(); };
  }, [windows, key, refreshKey]);

  const metrics = snapshot?.key === key ? annualComparison(snapshot.current, snapshot.previous) : null;
  const hasCurrent = snapshot?.key === key && snapshot.currentRows > 0;
  const hasPrevious = snapshot?.key === key && snapshot.previousRows > 0;
  const bothEmpty = snapshot?.key === key && !hasCurrent && !hasPrevious;
  const chosen = metrics?.find(metric => metric.key === selected);
  const mean = chosen && hasCurrent && hasPrevious
    ? availableAnnualMean(chosen.current, chosen.previous, true, true) : null;

  return <section className="panel" style={{ padding: 20 }}>
    <div className="panel-head">
      <div>
        <h2>Comparativo anual de chamadas</h2>
        <p>Colunas verticais agrupadas: recebidas, atendidas e abandonadas por ano, com variação percentual.</p>
      </div>
      <label>Ano <select aria-label="Ano da comparação anual" value={year}
        onChange={event => onYearChange(Number(event.target.value))}>
        {Array.from({ length: 5 }, (_, index) => currentYear - index)
          .map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>
    </div>

    {windows && <p style={{ fontSize: 12 }}>
      Comparação {windows.current.year} x {windows.previous.year}.
      {windows.partial ?
        ' Períodos equivalentes: 01/01 até ' + windows.current.end.slice(8) + '/' +
        windows.current.end.slice(5, 7) + ' em cada ano.' :
        ' Ambos os anos civis completos.'}
    </p>}

    <label className={styles.annualMeanSelect}>
      Linha horizontal de média
      <select aria-label="Série da média anual" value={selected}
        onChange={event => setSelected(event.target.value as ChartMetric)}>
        {(Object.keys(labels) as ChartMetric[]).map(name =>
          <option key={name} value={name}>{labels[name]}</option>)}
      </select>
    </label>

    {loading && <p role="status">Consultando períodos anuais...</p>}
    {error && <p role="alert">{error} Não foram exibidos resultados parciais como completos.</p>}
    {bothEmpty && <p role="status">
      Sem registros nos dois períodos. A cobertura histórica não foi comprovada;
      não há valores anuais para desenhar.
    </p>}

    {metrics && !bothEmpty && <div className={styles.annualResults}>
      {(!hasCurrent || !hasPrevious) && <p role="status">
        Um dos anos não contém registros. Ausência de histórico não significa zero chamadas;
        a variação percentual e a média entre anos estão indisponíveis; nenhuma linha de média será exibida.
      </p>}

      <AnnualVerticalColumns metrics={metrics} year={year}
        hasCurrent={!!hasCurrent} hasPrevious={!!hasPrevious} meanMetric={selected}/>

      <div className={styles.annualVariations} aria-label="Variações percentuais por indicador">
        {metrics.map(metric => <div className={styles.annualVariation} key={metric.key}>
          <strong>{labels[metric.key]}</strong>
          <span>Variação: {!hasCurrent || !hasPrevious ?
            '— (histórico de um dos anos ausente)' :
            metric.variation === null ?
              '— (base anterior igual a zero; crescimento indefinido)' :
              (metric.variation > 0 ? '+' : '') +
              metric.variation.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%'}
          </span>
        </div>)}
      </div>

      <p className={styles.annualNote}>
        {mean === null ?
          'Média entre anos indisponível: é necessário haver registros nos dois anos para desenhar a linha horizontal.' :
          'Linha horizontal tracejada: média dos dois anos de ' +
            labels[selected].toLowerCase() + ' = ' + format(mean) + '.'}
        {' '}O aumento do volume não representa automaticamente melhora do atendimento.
      </p>
      <p className={styles.annualSourceNote}>
        Os números vêm dos registros disponíveis no Supabase.
        Consulta concluída não comprova histórico integralmente sincronizado com a LigSim.
      </p>
    </div>}
  </section>;
}
