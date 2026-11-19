'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import CallPeriodCharts from './call-period-charts';
import { resolvePeriod, type Period } from '@/lib/call-dashboard';
import { buildAggregateDashboard, type RpcRow } from '@/lib/call-dashboard-aggregates';
import { localToday, parseAggregateRows, sumCounts } from '@/lib/call-chart-data';

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
const percent = (value: number | null) => value === null ? '—' : value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
const duration = (value: number | null | undefined) => value == null ? '—' :
  `${String(Math.floor(Math.round(value) / 60)).padStart(2, '0')}:${String(Math.round(value) % 60).padStart(2, '0')}`;
type Extra = { key: string; status: 'ready' | 'unavailable'; tma: number | null; tet: number | null };

export default function CallDashboard() {
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
    catch (cause) { return { range: null, error: cause instanceof Error ? cause.message : 'Periodo invalido.' }; }
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
            throw new Error('Sessao expirada ou acesso nao autorizado.');
          }
          throw new Error('Nao foi possivel atualizar todos os indicadores.');
        }
        const rows = parseAggregateRows(await response.json(), { start: rangeStart, end: rangeEnd });
        sumCounts(rows);
        if (active) setSnapshot({ key: rangeKey, rows, loadedAt: new Date() });
      } catch (cause) {
        if (active && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Falha na atualizacao.');
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
        if (!response.ok) throw new Error('Consulta de tempos indisponivel.');
        const payload: unknown = await response.json();
        if (!payload || typeof payload !== 'object' || !('metrics' in payload) || !payload.metrics || typeof payload.metrics !== 'object') throw new Error('Resposta invalida.');
        const metrics = payload.metrics as Record<string, unknown>;
        const valid = (value: unknown): value is number | null => value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
        if (!valid(metrics.tma_segundos) || !valid(metrics.tme_segundos)) throw new Error('Tempos invalidos.');
        if (active) setExtra({ key: rangeKey, status: 'ready', tma: metrics.tma_segundos, tet: metrics.tme_segundos });
      } catch {
        if (active && !controller.signal.aborted) setExtra({ key: rangeKey, status: 'unavailable', tma: null, tet: null });
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
  const timeStatus = extra?.key !== rangeKey ? 'Carregando...' : extra.status === 'unavailable' ? 'Consulta indisponivel.' : '';
  const updated = snapshot?.key === rangeKey ? new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium',
  }).format(snapshot.loadedAt) : '—';
  return <div>
    <section className="panel" style={{ padding: 20, marginBottom: 18 }}>
      <div className="panel-head"><h2>Período de consulta</h2><button className="outline-button" onClick={refresh} disabled={refreshing}><RefreshCw size={16} /> Atualizar agora</button></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>{periods.map(item => <button key={item.key} type="button" aria-pressed={period === item.key} onClick={() => setPeriod(item.key)} className={period === item.key ? 'primary-button' : 'outline-button'}>{item.label}</button>)}</div>
      {period === 'custom' && <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}><label>Data inicial <input type="date" value={start} onChange={event => setStart(event.target.value)} /></label><label>Data final <input type="date" value={end} onChange={event => setEnd(event.target.value)} /></label></div>}
      <p style={{ fontSize: 12 }}>Tela atualizada em: {updated}. Consulta a cada 60 segundos enquanto visível. Integração a cada 2 horas, das 7h às 21h, no horário de Brasília. Esse horário é da tela, não da sincronização.</p>
      {resolved?.error && <p role="alert">{resolved.error}</p>}
      {error && <p role="alert">{error} {data ? 'Exibindo a ultima consulta valida do mesmo periodo.' : ''}</p>}
      {!data && !resolved?.error && !error && <p role="status">Carregando registros...</p>}
    </section>
    {data && <>
      <div className="stats-grid" style={{ marginBottom: 18 }}>
        {[
          { label: 'Recebidas', value: number(data.summary.total), detail: 'Todos os status de chamadas recebidas.' },
          { label: 'Atendidas', value: number(data.summary.answered), detail: 'Recebidas com ANSWERED.' },
          { label: 'Abandonadas', value: number(data.summary.abandoned), detail: 'Recebidas com ABANDON; sem exigir nome de fila.' },
          { label: 'Taxa de abandono', value: percent(data.summary.abandonRate), detail: data.summary.total ? 'ABANDON dividido por todas as recebidas, vezes 100.' : 'Sem base de calculo; nao significa taxa zero.' },
          { label: 'Sem atendimento', value: number(data.summary.unanswered), detail: 'NO ANSWER nao e somado a ABANDON.' },
          { label: 'Taxa de atendimento', value: percent(data.summary.answerRate), detail: 'Atendidas divididas por todas as recebidas, vezes 100.' },
          { label: 'TMA - tempo medio de atendimento', value: duration(times?.tma), detail: timeStatus || 'Chamadas externas atendidas; media de TA valido.' },
          { label: 'Espera total - media de TET (legado)', value: duration(times?.tet), detail: timeStatus || 'Nao e TME de fila. Migracao para TEF depende da correcao da RPC.' },
        ].map(card => <div className="stat-card" key={card.label}><div className="stat-top"><span>{card.label}</span></div><strong>{card.value}</strong><small>{card.detail}</small></div>)}
      </div>
      <section className="panel" style={{ padding: 20, marginBottom: 18 }}>
        <div className="panel-head"><div><h2>Evolução das chamadas recebidas</h2><p>{rangeStart === rangeEnd ? 'Dia completo, de 0h a 24h, em intervalos de duas horas.' : data.range.granularity === 'month' ? 'Totais por mes no periodo.' : 'Totais por dia no periodo.'}</p></div></div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>{categories.map(item => <span key={item.key} style={{ fontSize: 12 }}><span aria-hidden="true" style={{ display: 'inline-block', width: 10, height: 10, marginRight: 6, background: item.color }} />{item.label}</span>)}</div>
        {data.summary.total === 0 ? <p>Sem registros disponíveis na base para este período.</p> : <div style={{ overflowX: 'auto', padding: '16px 4px' }}>
          <div style={{ display: 'flex', alignItems: 'end', gap: 12, width: 'max-content', minWidth: '100%', height: 245 }}>
            {data.buckets.map(bucket => <button key={bucket.key} type="button" aria-pressed={selectedBucket === bucket.key}
              aria-label={`${bucket.label}: ${bucket.total} recebidas, ${bucket.answered} atendidas, ${bucket.abandoned} abandonadas, ${bucket.unanswered} sem atendimento, ${bucket.other} outras`}
              onClick={() => setSelectedBucket(selectedBucket === bucket.key ? null : bucket.key)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'end', width: 62, height: '100%', padding: 3, border: 0, background: selectedBucket === bucket.key ? 'var(--soft)' : 'transparent', cursor: 'pointer' }}>
              <span style={{ fontSize: 11 }}>{number(bucket.total)}</span>
              <span style={{ display: 'flex', flexDirection: 'column-reverse', width: 40, height: bucket.total / max * 180 }}>
                {categories.map(item => <span key={item.key} style={{ width: '100%', height: `${bucket.total ? bucket[item.key] / bucket.total * 100 : 0}%`, background: item.color }} />)}
              </span>
              <span style={{ height: 28, paddingTop: 7, fontSize: 10, whiteSpace: 'nowrap' }}>{bucket.label}</span>
            </button>)}
          </div>
        </div>}
        {activeBucket && <p role="status">{activeBucket.label}: {number(activeBucket.total)} recebidas; {number(activeBucket.answered)} atendidas; {number(activeBucket.abandoned)} abandonadas; {number(activeBucket.unanswered)} sem atendimento; {number(activeBucket.other)} outras. <button type="button" className="outline-button" onClick={() => setSelectedBucket(null)}>Fechar</button></p>}
        <p style={{ fontSize: 11, opacity: .75 }}>Volumes refletem os registros disponíveis no Supabase. Leitura completa da consulta não comprova a coleta completa do histórico na origem.</p>
      </section>
      <CallPeriodCharts rows={snapshot?.rows ?? []} rangeStart={data.range.start} rangeEnd={data.range.end} year={annualYear}
        onYearChange={setAnnualYear} currentYear={now ? Number(localToday(now).slice(0, 4)) : annualYear} refreshKey={requestNumber} />
    </>}
  </div>;
}
