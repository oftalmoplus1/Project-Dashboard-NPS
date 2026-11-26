'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import CallPeriodCharts from './call-period-charts';
import HourlyLineChart from './hourly-line-chart';
import ChartTooltip, { pointFromMouse, pointFromFocus, type TooltipPoint } from './chart-tooltip';
import CallCenterSummary from './call-center-summary';
import AnnualCallComparison from './annual-call-comparison';
import { CALL_CENTER_TABS, type CallCenterTab } from '@/lib/call-center-design';
import { resolvePeriod, type Period } from '@/lib/call-dashboard';
import { buildAggregateDashboard, type RpcRow } from '@/lib/call-dashboard-aggregates';
import { localToday, parseAggregateRows, sumCounts } from '@/lib/call-chart-data';
import { parseQueueApiResponse, type QueueSnapshot, type QueueSummary } from '@/lib/ligsim-queue-snapshot';
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
  const [snapshot, setSnapshot] = useState<{ key: string; rows: RpcRow[] } | null>(null);
  const [extra, setExtra] = useState<Extra | null>(null);
  const [queues, setQueues] = useState<{
    key: string; rows: QueueSnapshot[]; summary: QueueSummary;
    sourceUpdatedAt: Date; consultedAt: Date;
  } | null>(null);
  const [queueError, setQueueError] = useState('');
  const [queueLoading, setQueueLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [requestNumber, setRequestNumber] = useState(0);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [hoveredBucket, setHoveredBucket] = useState<string | null>(null);
  const [tooltipPoint, setTooltipPoint] = useState<TooltipPoint | null>(null);
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
  const todayKey = now ? localToday(now) : '';
  const queueMode = tab === 'overview' && period === 'today' && !!todayKey &&
    rangeStart === todayKey && rangeEnd === todayKey;
  useEffect(() => {
    if (!queueMode) return;
    const controller = new AbortController();
    let active = true;
    setQueueLoading(true);
    setQueueError('');
    const load = async () => {
      try {
        const response = await fetch('/api/chamadas/filas', {
          cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            if (active) { setQueues(null); setExtra(null); }
            throw new Error('Sessão expirada ou acesso não autorizado às filas.');
          }
          throw new Error('Dados atuais das filas indisponíveis ou desatualizados.');
        }
        const parsed = parseQueueApiResponse(await response.json());
        if (active) setQueues({
          key: todayKey, rows: parsed.rows, summary: parsed.summary,
          sourceUpdatedAt: new Date(parsed.sourceUpdatedAt),
          consultedAt: new Date(parsed.consultedAt),
        });
      } catch (cause) {
        if (active && !controller.signal.aborted) {
          setQueueError(cause instanceof Error ? cause.message : 'Falha na atualização das filas.');
        }
      } finally {
        if (active) setQueueLoading(false);
      }
    };
    void load();
    return () => { active = false; controller.abort(); };
  }, [queueMode, todayKey, requestNumber]);
  useEffect(() => {
    if (!rangeKey || queueMode) return;
    const controller = new AbortController();
    let active = true;
    setRefreshing(true); setError(''); setSelectedBucket(null); setHoveredBucket(null);
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
        if (active) setSnapshot({ key: rangeKey, rows });
      } catch (cause) {
        if (active && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Falha na atualização.');
      } finally { if (active) setRefreshing(false); }
    };
    void load();
    return () => { active = false; controller.abort(); };
  }, [rangeStart, rangeEnd, rangeKey, queueMode, requestNumber]);
  useEffect(() => {
    if (!rangeKey || queueMode) { setExtra(null); return; }
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
  }, [rangeStart, rangeEnd, rangeKey, queueMode, requestNumber]);
  const refresh = useCallback(() => {
    if (!refreshing && !queueLoading) { setNow(new Date()); setRequestNumber(value => value + 1); }
  }, [refreshing, queueLoading]);
  const data = useMemo(() => {
    if (!range || snapshot?.key !== rangeKey) return null;
    try { return buildAggregateDashboard(snapshot.rows, range); } catch { return null; }
  }, [range, rangeKey, snapshot]);
  const queueData = queueMode && queues?.key === todayKey && now &&
    now.getTime() - queues.sourceUpdatedAt.getTime() <= 3 * 60 * 60 * 1000 &&
    queues.sourceUpdatedAt.getTime() - now.getTime() <= 5 * 60 * 1000 ? queues : null;
  const shownSummary = queueMode ? queueData?.summary ?? null : data?.summary ?? null;
  const activeBucket = data?.buckets.find(bucket => bucket.key === selectedBucket);
  const hoveredItem = data?.buckets.find(bucket => bucket.key === hoveredBucket);
  const max = Math.max(1, ...(data?.buckets.map(bucket => bucket.total) ?? []));
  const times = extra?.key === rangeKey && extra.status === 'ready' ? extra : null;
  const timeStatus = queueMode
    ? queueData ? 'ready' : queueError ? 'unavailable' : 'loading'
    : extra?.key !== rangeKey ? 'loading' : extra.status;
  const shownTimes = queueMode
    ? queueData ? {
      tma: queueData.summary.tmaSeconds, tme: queueData.summary.tmeSeconds,
      waitKind: 'queue_tme' as const,
      tmaQueues: queueData.summary.tmaQueues, tmeQueues: queueData.summary.tmeQueues,
    } : null
    : shownSummary && times ? {
      tma: times.tma, tme: times.wait,
      waitKind: times.semantics === 'tef' ? 'tef' as const : 'tet_legacy' as const,
    } : null;
  const showPeriod = tab === 'overview' || tab === 'hour';
  return <div className={styles.workspace}>
    <div className={styles.header}>
      <div><h2>Chamadas</h2></div>
      <button type="button" data-presentation-control className="outline-button" onClick={refresh} disabled={refreshing || queueLoading}>
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
      {!queueMode && error && <p className={styles.alert} role="alert">{error} {data ? 'Exibindo a última consulta válida do mesmo período.' : ''}</p>}
      {queueMode && queueError && <p className={styles.alert} role="alert">
        {queueError} {queueData ? 'Exibindo a última coleta válida do mesmo dia.' : 'Nenhum volume foi estimado.'}
      </p>}
    </section>}
    {CALL_CENTER_TABS.map(item => <section key={item.id} className={styles.panel}
      aria-label={item.label} hidden={tab !== item.id}>
      {tab === item.id && item.id === 'overview' && <div className={styles.stack}>
        <CallCenterSummary summary={shownSummary} sourceMode={queueMode ? 'snapshot' : 'history'}
          loading={!shownSummary && !(queueMode ? queueError : error) && !resolved?.error}
          partial={!!now && rangeEnd === localToday(now)}
          times={shownTimes}
          timeStatus={shownSummary ? timeStatus : ((queueMode ? queueError : error) || resolved?.error) ? 'unavailable' : 'loading'} />
        {queueMode && queueData && <section className={`panel ${styles.chart}`} aria-label="Estado atual das filas">
          <div className="panel-head"><div>
            <h2>Filas — último estado disponível</h2>
            <p>Última coleta: {new Intl.DateTimeFormat('pt-BR', {
              timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short',
            }).format(queueData.sourceUpdatedAt)} (Brasília). Não representa histórico horário.</p>
          </div></div>
          <div className={styles.plotScroll}>
            <table style={{ width: '100%', minWidth: 530, borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr>
                {['Fila', 'Recebidas', 'Atendidas', 'Abandonadas', 'Em espera'].map(column =>
                  <th key={column} scope="col" style={{ textAlign: column === 'Fila' ? 'left' : 'right', padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>{column}</th>)}
              </tr></thead>
              <tbody>{queueData.rows.map(queue => <tr key={queue.id}>
                <th scope="row" style={{ textAlign: 'left', padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>{queue.name}</th>
                {[queue.received, queue.answered, queue.abandoned, queue.waiting].map((value, index) =>
                  <td key={index} style={{ textAlign: 'right', padding: '10px 8px', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums' }}>{number(value)}</td>)}
              </tr>)}</tbody>
            </table>
          </div>
          <p className={styles.hint}>Fonte listar_filas, último lote identificado pelo n8n. TMA/TME são médias simples dos valores informados pelas filas atendidas nesta coleta; não representam a média ponderada por chamadas. A hora da consulta não comprova uma atualização da coleta.</p>
        </section>}
        {!queueMode && data && <section className={`panel ${styles.chart}`} aria-label="Evolução das chamadas recebidas">
          <div className="panel-head"><div><h2>Evolução das chamadas recebidas</h2><p>{rangeStart === rangeEnd ? 'Dia completo, de 0h a 24h, em intervalos de duas horas.' : data.range.granularity === 'month' ? 'Totais por mês no período.' : 'Totais por dia no período.'}</p></div></div>
          <div className={styles.legend}>{categories.map(category => <span key={category.key}><i aria-hidden="true" style={{ background: category.color }} />{category.label}</span>)}</div>
          {data.summary.total === 0 ? <p className={styles.hint}>Sem registros disponíveis na base para este período.</p> : <div className={styles.plotScroll}>
            <div className={styles.plot}>
              {data.buckets.map(bucket => <button key={bucket.key} type="button" className={styles.bar} aria-pressed={selectedBucket === bucket.key}
                aria-label={`${bucket.label}: ${bucket.total} recebidas, ${bucket.answered} atendidas, ${bucket.abandoned} abandonadas, ${bucket.unanswered} sem atendimento, ${bucket.other} outras`}
                onMouseEnter={event => { setHoveredBucket(bucket.key); setTooltipPoint(pointFromMouse(event)); }}
                onMouseMove={event => setTooltipPoint(pointFromMouse(event))}
                onMouseLeave={() => setHoveredBucket(null)}
                onFocus={event => { setHoveredBucket(bucket.key); setTooltipPoint(pointFromFocus(event)); }}
                onBlur={() => setHoveredBucket(null)}
                onClick={event => { setSelectedBucket(selectedBucket === bucket.key ? null : bucket.key); setTooltipPoint(pointFromMouse(event)); }}>
                <span className={styles.barTotal}>{number(bucket.total)}</span>
                <span className={styles.barSegments} style={{ height: bucket.total / max * 180 }}>
                  {categories.map(category => <span key={category.key} style={{ width: '100%', height: `${bucket.total ? bucket[category.key] / bucket.total * 100 : 0}%`, background: category.color }} />)}
                </span>
                <span className={styles.barLabel}>{bucket.label}</span>
              </button>)}
            </div>
          </div>}
          <ChartTooltip open={Boolean(hoveredItem)} point={tooltipPoint}
            title={hoveredItem?.label ?? ''}
            values={hoveredItem ? [
              { label: 'Recebidas', value: number(hoveredItem.total), color: '#2d74ca' },
              { label: 'Atendidas', value: number(hoveredItem.answered), color: '#12b981' },
              { label: 'Sem atendimento', value: number(hoveredItem.unanswered), color: '#f5b83d' },
              { label: 'Abandonadas', value: number(hoveredItem.abandoned), color: '#f05a73' },
              { label: 'Outras', value: number(hoveredItem.other), color: '#7d8590' },
            ] : []}/>
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
    </section>)}
  </div>;
}
