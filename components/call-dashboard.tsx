'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import CallPeriodCharts from './call-period-charts';
import HourlyLineChart from './hourly-line-chart';
import CallCenterSummary from './call-center-summary';
import AnnualCallComparison from './annual-call-comparison';
import CallExtensionsChart from './call-extensions-chart';
import { CALL_CENTER_TABS, type CallCenterTab } from '@/lib/call-center-design';
import { resolvePeriod, type Period } from '@/lib/call-dashboard';
import { buildAggregateDashboard, type RpcRow } from '@/lib/call-dashboard-aggregates';
import { localToday, parseAggregateRows, sumCounts } from '@/lib/call-chart-data';
import styles from './call-center.module.css';

const periods: { key: Period; label: string }[] = [
  { key: 'today', label: 'Hoje' }, { key: 'yesterday', label: 'Ontem' },
  { key: 'last7', label: 'Últimos 7 dias' }, { key: 'month', label: 'Este mês' },
  { key: 'custom', label: 'Personalizado' },
];
const categories = [
  { key: 'answered', label: 'Atendidas', color: '#12b981' },
  { key: 'unanswered', label: 'Sem atendimento', color: '#f5b83d' },
  { key: 'abandoned', label: 'Abandonadas', color: '#f05a73' },
  { key: 'other', label: 'Outras', color: '#7d8590' },
] as const;
const number = (value: number) => value.toLocaleString('pt-BR');
type Extra = { key: string; status: 'ready' | 'unavailable'; tma: number | null; wait: number | null; semantics: 'tef' | 'tet_legacy' };

export default function CallDashboard({ activeTab: tab }: { activeTab: CallCenterTab }) {
  const [period, setPeriod] = useState<Period>('today');
  const [annualYear, setAnnualYear] = useState(Number(localToday(new Date()).slice(0, 4)));
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [now, setNow] = useState<Date | null>(null);
  const [snapshot, setSnapshot] = useState<{ key: string; rows: RpcRow[]; loadedAt: Date } | null>(null);
  const [extra, setExtra] = useState<Extra | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [requestNumber, setRequestNumber] = useState(0);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') { setNow(new Date()); setRequestNumber(value => value + 1); }
    }, 60000);
    return () => window.clearInterval(timer);
  }, []);
  const resolved = useMemo(() => {
    if (!now) return null;
    try { return { range: resolvePeriod(period, now, start, end), error: '' }; }
    catch (cause) { return { range: null, error: cause instanceof Error ? cause.message : 'Período inválido.' }; }
  }, [period, now, start, end]);
  const range = resolved?.range;
  const rangeStart = range?.start ?? '';
  const rangeEnd = range?.end ?? '';
  const rangeKey = range ? `${rangeStart}:${rangeEnd}` : '';
  useEffect(() => {
    if (!rangeKey) return;
    const controller = new AbortController();
    let active = true;
    setRefreshing(true); setError(''); setSelectedBucket(null);
    const load = async () => {
      try {
        const response = await fetch(`/api/chamadas?start=${rangeStart}&end=${rangeEnd}`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            if (active) { setSnapshot(null); setExtra(null); }
            throw new Error('Sessão expirada ou acesso não autorizado.');
          }
          throw new Error('Não foi possível atualizar todos os indicadores.');
        }
        const rows = parseAggregateRows(await response.json(), { start: rangeStart, end: rangeEnd });
        sumCounts(rows);
        if (active) setSnapshot({ key: rangeKey, rows, loadedAt: new Date() });
      } catch (cause) {
        if (active && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Falha na atualização.');
      } finally { if (active) setRefreshing(false); }
    };
    void load();
    return () => { active = false; controller.abort(); };
  }, [rangeStart, rangeEnd, rangeKey, requestNumber]);
  useEffect(() => {
    if (!rangeKey) return;
    const controller = new AbortController();
    let active = true;
    setExtra(null);
    const load = async () => {
      try {
        const response = await fetch(`/api/chamadas/indicadores?start=${rangeStart}&end=${rangeEnd}`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Consulta de tempos indisponível.');
        const payload: unknown = await response.json();
        if (!payload || typeof payload !== 'object' || !('metrics' in payload) || !payload.metrics || typeof payload.metrics !== 'object') throw new Error('Resposta inválida.');
        const metrics = payload.metrics as Record<string, unknown>;
        const valid = (value: unknown): value is number | null => value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
        if (!valid(metrics.tma_segundos) || !valid(metrics.tme_segundos)) throw new Error('Tempos inválidos.');
        const semantics = 'tme_semantics' in payload ? payload.tme_semantics : null;
        if (semantics !== 'tef' && semantics !== 'tet_legacy') throw new Error('Semântica de espera não verificada.');
        if (active) setExtra({ key: rangeKey, status: 'ready', tma: metrics.tma_segundos, wait: metrics.tme_segundos, semantics });
      } catch {
        if (active && !controller.signal.aborted) setExtra({ key: rangeKey, status: 'unavailable', tma: null, wait: null, semantics: 'tet_legacy' });
      }
    };
    void load();
    return () => { active = false; controller.abort(); };
  }, [rangeStart, rangeEnd, rangeKey, requestNumber]);
  const refresh = useCallback(() => {
    if (!refreshing) { setNow(new Date()); setRequestNumber(value => value + 1); }
  }, [refreshing]);
  const data = useMemo(() => {
    if (!range || snapshot?.key !== rangeKey) return null;
    try { return buildAggregateDashboard(snapshot.rows, range); } catch { return null; }
  }, [range, rangeKey, snapshot]);
  const activeBucket = data?.buckets.find(bucket => bucket.key === selectedBucket);
  const max = Math.max(1, ...(data?.buckets.map(bucket => bucket.total) ?? []));
  const times = extra?.key === rangeKey && extra.status === 'ready' ? extra : null;
  const timeStatus = extra?.key !== rangeKey ? 'loading' : extra.status;
  const updated = snapshot?.key === rangeKey ? new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium',
  }).format(snapshot.loadedAt) : '—';
  const showPeriod = tab === 'overview' || tab === 'hour';
  const pending = false;
  return <div className={styles.workspace}>
    <div className={styles.header}>
      <div><h2>Chamadas</h2><p>Visão geral e análises do atendimento.</p></div>
      <button type="button" className="outline-button" onClick={refresh} disabled={refreshing || pending}>
        <RefreshCw size={16} aria-hidden="true" /> Atualizar
      </button>
    </div>
    {showPeriod && <section className={styles.filters} aria-label="Filtros de chamadas">
      <h3>Período de consulta</h3>
      <div className={styles.presets}>{periods.map(item => <button key={item.key} type="button" aria-pressed={period === item.key} onClick={() => setPeriod(item.key)} className={period === item.key ? 'primary-button' : 'outline-button'}>{item.label}</button>)}</div>
      {period === 'custom' && <div className={styles.dates}>
        <label>Data inicial <input type="date" value={start} onChange={event => setStart(event.target.value)} /></label>
        <label>Data final <input type="date" value={end} onChange={event => setEnd(event.target.value)} /></label>
      </div>}
      {resolved?.error && <p className={styles.alert} role="alert">{resolved.error}</p>}
      {error && <p className={styles.alert} role="alert">{error} {data ? 'Exibindo a última consulta válida do mesmo período.' : ''}</p>}
    </section>}
    {CALL_CENTER_TABS.map(item => <section key={item.id} className={styles.panel}
      aria-label={item.label} hidden={tab !== item.id}>
      {tab === item.id && item.id === 'overview' && <div className={styles.stack}>
        <CallCenterSummary summary={data?.summary ?? null} loading={!data && !error && !resolved?.error}
          partial={!!now && rangeEnd === localToday(now)}
          times={data && times ? { tma: times.tma, tme: times.wait, tefVerified: times.semantics === 'tef' } : null} timeStatus={data ? timeStatus : (error || resolved?.error) ? 'unavailable' : 'loading'} />
        {data && <section className={`panel ${styles.chart}`} aria-label="Evolução das chamadas recebidas">
          <div className="panel-head"><div><h2>Evolução das chamadas recebidas</h2><p>{rangeStart === rangeEnd ? 'Dia completo, de 0h a 24h, em intervalos de duas horas.' : data.range.granularity === 'month' ? 'Totais por mês no período.' : 'Totais por dia no período.'}</p></div></div>
          <div className={styles.legend}>{categories.map(category => <span key={category.key}><i aria-hidden="true" style={{ background: category.color }} />{category.label}</span>)}</div>
          {data.summary.total === 0 ? <p className={styles.hint}>Sem registros disponíveis na base para este período.</p> : <div className={styles.plotScroll}>
            <div className={styles.plot}>
              {data.buckets.map(bucket => <button key={bucket.key} type="button" className={styles.bar} aria-pressed={selectedBucket === bucket.key}
                aria-label={`${bucket.label}: ${bucket.total} recebidas, ${bucket.answered} atendidas, ${bucket.abandoned} abandonadas, ${bucket.unanswered} sem atendimento, ${bucket.other} outras`}
                onClick={() => setSelectedBucket(selectedBucket === bucket.key ? null : bucket.key)}>
                <span className={styles.barTotal}>{number(bucket.total)}</span>
                <span className={styles.barSegments} style={{ height: bucket.total / max * 180 }}>
                  {categories.map(category => <span key={category.key} style={{ width: '100%', height: `${bucket.total ? bucket[category.key] / bucket.total * 100 : 0}%`, background: category.color }} />)}
                </span>
                <span className={styles.barLabel}>{bucket.label}</span>
              </button>)}
            </div>
          </div>}
          {activeBucket && <p role="status" className={styles.hint}>{activeBucket.label}: {number(activeBucket.total)} recebidas; {number(activeBucket.answered)} atendidas; {number(activeBucket.abandoned)} abandonadas; {number(activeBucket.unanswered)} sem atendimento; {number(activeBucket.other)} outras. <button type="button" className="outline-button" onClick={() => setSelectedBucket(null)}>Fechar</button></p>}
        </section>}
      </div>}
      {tab === item.id && item.id === 'month' && <CallPeriodCharts rows={snapshot?.rows ?? []}
        rangeStart={rangeStart} rangeEnd={rangeEnd} year={annualYear} onYearChange={setAnnualYear}
        currentYear={now ? Number(localToday(now).slice(0, 4)) : annualYear} refreshKey={requestNumber} showHourly={false} />}
      {tab === item.id && item.id === 'hour' && (range ? <HourlyLineChart start={range.start} end={range.end} refreshKey={requestNumber} /> : <p className={styles.hint}>Selecione um período válido para consultar as horas.</p>)}
      {tab === item.id && item.id === 'annual' && <AnnualCallComparison year={annualYear}
        onYearChange={setAnnualYear} currentYear={now ? Number(localToday(now).slice(0,4)) : annualYear}
        refreshKey={requestNumber} />}
      {tab === item.id && item.id === 'extension' && <CallExtensionsChart refreshKey={requestNumber} />}
    </section>)}
    <footer className={styles.metadata}>
      {showPeriod && <div>Consulta do resumo: {updated} · Horário de Brasília.</div>}
      <span>A consulta da tela não comprova a sincronização da origem. Ausência de registros não comprova volume zero.</span>
    </footer>
  </div>;
}
