'use client';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { RefreshCw, Table2 } from 'lucide-react';
import { resolvePeriod, type Period } from '@/lib/call-dashboard';
import { buildAggregateDashboard, type RpcRow } from '@/lib/call-dashboard-aggregates';
const periods: { key: Period; label: string }[] = [{ key: 'today', label: 'Hoje' }, { key: 'yesterday', label: 'Ontem' }, { key: 'last7', label: 'Últimos 7 dias' }, { key: 'month', label: 'Este mês' }, { key: 'custom', label: 'Personalizado' }];
const categories = [{ key: 'answered', label: 'Atendidas', color: '#12b981' }, { key: 'unanswered', label: 'Sem atendimento', color: '#f5b83d' }, { key: 'abandoned', label: 'Abandonadas', color: '#f05a73' }] as const;
const number = (n: number) => n.toLocaleString('pt-BR');
export default function CallDashboard() {
 const [period, setPeriod] = useState<Period>('today');
 const [start, setStart] = useState('');
 const [end, setEnd] = useState('');
 const [now, setNow] = useState<Date | null>(null);
 const [lastSuccess, setLastSuccess] = useState<Date | null>(null);
 const [tableOpen, setTableOpen] = useState(false);
 const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
 const [error, setError] = useState('');
 const [refreshing, setRefreshing] = useState(false);
 const [snapshot, setSnapshot] = useState<{ key: string; rows: RpcRow[] } | null>(null);
 const [requestNumber, setRequestNumber] = useState(0);
 useEffect(() => {
  setNow(new Date());
  const timer = window.setInterval(() => {
   if (document.visibilityState === 'visible') { setNow(new Date()); setRequestNumber(n => n + 1); }
  }, 60000);
  return () => window.clearInterval(timer);
 }, []);
 const resolved = useMemo(() => {
  if (!now) return null;
  try { return { range: resolvePeriod(period, now, start, end), error: '' }; }
  catch (e) { return { range: null, error: e instanceof Error ? e.message : 'Período inválido' }; }
 }, [period, start, end, now]);
 const range = resolved?.range;
 const rangeKey = range ? `${range.start}:${range.end}` : '';
 useEffect(() => {
  if (!range || !rangeKey) return;
  const controller = new AbortController();
  let active = true;
  const load = async () => {
   setRefreshing(true);
   setError('');
   try {
    const response = await fetch(`/api/chamadas?start=${range.start}&end=${range.end}`, {
     cache: 'no-store', signal: controller.signal,
    });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403
     ? 'Sessão expirada ou acesso não autorizado.' : 'Não foi possível atualizar os indicadores.');
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object' || !('rows' in result) ||
        !Array.isArray(result.rows)) throw new Error('Resposta de dados inválida.');
    const rows = result.rows as RpcRow[];
    buildAggregateDashboard(rows, range);
    if (active) { setSnapshot({ key: rangeKey, rows }); setLastSuccess(new Date()); }
   } catch (e) {
    if (active && !controller.signal.aborted)
     setError(e instanceof Error ? e.message : 'Falha na atualização.');
   } finally { if (active) setRefreshing(false); }
  };
  void load();
  return () => { active = false; controller.abort(); };
 }, [rangeKey, requestNumber]);
 const refresh = useCallback(() => {
  if (refreshing) return;
  setNow(new Date());
  setRequestNumber(n => n + 1);
 }, [refreshing]);
 const data = useMemo(() => {
  if (!range || snapshot?.key !== rangeKey) return null;
  try { return buildAggregateDashboard(snapshot.rows, range); }
  catch { return null; }
 }, [rangeKey, range?.granularity, snapshot]);
 const valid = data;
 const validation = resolved?.error ?? '';
 const chartBuckets = valid ? (valid.range.start === valid.range.end ? valid.buckets.filter(b => Number(b.key.slice(-2)) >= 8) : valid.buckets) : [];
 const activeBucket = chartBuckets.find(b => b.key === selectedBucket) ?? null;
 const max = Math.max(1, ...chartBuckets.map(b => b.answered + b.unanswered + b.abandoned));
 const formatTime = (date: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium' }).format(date);
 return <div>
  
  <section className="panel" style={{ padding: 20, marginBottom: 18 }}>
   <div className="panel-head"><div><h2>Período de consulta</h2><p>Horário de Brasília · America/Sao_Paulo</p></div><button className="outline-button" onClick={refresh} disabled={refreshing}><RefreshCw size={16}/> Atualizar agora</button></div>
   <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>{periods.map(p => <button key={p.key} type="button" aria-pressed={period === p.key} onClick={() => setPeriod(p.key)} className={period === p.key ? 'primary-button' : 'outline-button'}>{p.label}</button>)}</div>
   {period === 'custom' && <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}><label>Data inicial <input type="date" value={start} onChange={e => setStart(e.target.value)}/></label><label>Data final <input type="date" value={end} onChange={e => setEnd(e.target.value)}/></label></div>}
   <p style={{ fontSize: 13, opacity: .75 }}>Última atualização bem-sucedida: {lastSuccess ? formatTime(lastSuccess) : 'Carregando...'}. Consulta automática a cada 60 segundos enquanto a página estiver visível. Os dados são importados da LigSim pelo n8n a cada 2 horas (7h às 21h); não são em tempo real. O horário acima indica a atualização da tela, não a última sincronização do n8n.</p>
   {validation && <p role="alert" style={{ color: 'var(--red)' }}>{validation}</p>}
   {error && <p role="alert">{error} {valid ? "Exibindo os últimos dados válidos para este período." : ""}</p>}
   {!valid && !validation && !error && <p role="status">Carregando indicadores reais...</p>}
  </section>
  {valid && <>
   <div className="stats-grid" style={{ marginBottom: 18 }}>
    {[{ label: 'Registros recebidos', value: number(valid.summary.total) }, { label: 'Atendidos', value: number(valid.summary.answered) }, { label: 'Sem atendimento', value: number(valid.summary.unanswered) }, { label: 'Abandonados', value: number(valid.summary.abandoned) }, { label: 'Taxa de atendimento', value: valid.summary.answerRate === null ? '—' : valid.summary.answerRate.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%' }].map(card => <div className="stat-card" key={card.label}><div className="stat-top"><span>{card.label}</span></div><strong>{card.value}</strong><small>Registros operacionais · Supabase</small></div>)}
   </div>
   <section className="panel" style={{ padding: 20 }}>
    <div className="panel-head"><div><h2>Evolução das chamadas recebidas</h2><p>Colunas empilhadas · {valid.range.granularity === 'hour' ? 'das 8h às 24h, agrupadas a cada 2 horas' : valid.range.granularity === 'day' ? 'por dia' : 'por mês'}</p></div></div>
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>{categories.map(c => <span key={c.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}><span style={{ width: 11, height: 11, borderRadius: 2, background: c.color }}/>{c.label}</span>)}</div>
    {valid.summary.total === 0 ? <p>Nenhuma chamada no período selecionado.</p> : <>
     <div tabIndex={0} aria-label="Gráfico de chamadas recebidas, navegação horizontal disponível" style={{ overflowX: 'auto', padding: '16px 4px 12px', scrollBehavior: 'smooth' }}>
      <div style={{ display: 'flex', alignItems: 'end', gap: valid.range.start === valid.range.end ? 0 : 12, minWidth: '100%', width: 'max-content', height: 255, borderBottom: '1px solid var(--border, #aaa)' }}>
       {chartBuckets.map(bucket => {
        const selected = activeBucket?.key === bucket.key;
        const known = bucket.answered + bucket.unanswered + bucket.abandoned;
        return <button key={bucket.key} type="button" onClick={() => setSelectedBucket(selected ? null : bucket.key)} aria-pressed={selected} aria-label={`${bucket.label}: ${bucket.answered} atendidas, ${bucket.unanswered} sem atendimento, ${bucket.abandoned} abandonadas, ${bucket.other} outros. Total ${bucket.total}.`} title={`${bucket.label} · ${bucket.total} registros`} style={{ width: valid.range.start === valid.range.end ? 64 : 44, display: 'flex', flexDirection: 'column', justifyContent: 'end', alignItems: 'center', height: '100%', flexShrink: 0, border: 0, background: selected ? 'rgba(18,185,129,.12)' : 'transparent', borderRadius: 4, padding: '0 3px', cursor: 'pointer', outlineOffset: 3, transition: 'background .2s ease, transform .2s ease', transform: selected ? 'translateY(-3px)' : undefined }}>
         <span style={{ fontSize: 11, fontWeight: selected ? 700 : 500, opacity: known ? 1 : .5, marginBottom: 6 }}>{known ? number(known) : '·'}</span>
         <span style={{ width: 40, height: 196, display: 'flex', flexDirection: 'column', justifyContent: 'end' }}>
          <span style={{ width: '100%', display: 'flex', flexDirection: 'column-reverse', height: (known / max * 188) + 'px', overflow: 'hidden', borderRadius: '5px 5px 2px 2px', boxShadow: selected ? '0 0 0 2px rgba(37,139,120,.35)' : '0 2px 8px rgba(0,0,0,.09)', transition: 'height .35s ease, box-shadow .2s ease' }}>
           {categories.map(c => <span key={c.key} style={{ height: known ? (bucket[c.key] / known * 100) + '%' : 0, background: c.color, opacity: .82, transition: 'height .35s ease' }}/>)}
          </span>
         </span>
         <span style={{ fontSize: 10, height: 32, paddingTop: 8, whiteSpace: 'nowrap', fontWeight: selected ? 700 : 400 }}>{valid.range.start === valid.range.end ? '' : bucket.label}</span>
        </button>;
       })}
      </div>
      {valid.range.start === valid.range.end && <div aria-label="Escala horária de 8h a 24h, com marcações de uma em uma hora; colunas agrupadas em duas horas" style={{ position: 'relative', width: 512, minWidth: 512, height: 22, marginTop: 4 }}>
       {Array.from({ length: 17 }, (_, index) => index + 8).map(hour => <span key={hour} style={{ position: 'absolute', left: (hour - 8) * 32, transform: 'translateX(-50%)', fontSize: 10, whiteSpace: 'nowrap', opacity: .8 }}>{hour}h</span>)}
      </div>}
     </div>
     <p style={{ fontSize: 12, opacity: .7, marginTop: 6 }}>Selecione uma coluna para ver seus detalhes. Em dias individuais, o gráfico começa às 8h e mantém intervalos de 2 horas; os indicadores e a tabela incluem o dia completo. Use a rolagem horizontal para acessar os intervalos.</p>
     {activeBucket && <div role="status" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, marginTop: 12, padding: 14, border: '1px solid var(--border, #ddd)', borderRadius: 12, background: 'var(--surface, transparent)' }}>
      <strong style={{ marginRight: 8 }}>{activeBucket.label}</strong>
      <span>Total: <strong>{number(activeBucket.total)}</strong></span>
      <span>Atendidas: <strong>{number(activeBucket.answered)}</strong></span>
      <span>Sem atendimento: <strong>{number(activeBucket.unanswered)}</strong></span>
      <span>Abandonadas: <strong>{number(activeBucket.abandoned)}</strong></span>
      {activeBucket.other > 0 && <span>Outros: <strong>{number(activeBucket.other)}</strong></span>}
      <button className="outline-button" type="button" onClick={() => setSelectedBucket(null)} aria-label="Fechar detalhes da coluna">Fechar</button>
     </div>}
    </>}
    {valid.summary.other > 0 && <p role="status">Existem {number(valid.summary.other)} registros em Outros, não representados nas colunas.</p>}
    <div style={{ marginTop: 18 }}><button className="outline-button" type="button" aria-expanded={tableOpen} onClick={() => setTableOpen(v => !v)}><Table2 size={16}/>{tableOpen ? 'Ocultar tabela' : 'Ver dados em tabela'}</button></div>
    {tableOpen && <div className="table-wrap" style={{ marginTop: 16, overflowX: 'auto' }}><table><thead><tr><th>Período</th><th>Atendidas</th><th>Sem atendimento</th><th>Abandonadas</th><th>Outros</th><th>Total</th></tr></thead><tbody>{valid.buckets.map(b => <tr key={b.key}><td>{b.label}</td><td>{number(b.answered)}</td><td>{number(b.unanswered)}</td><td>{number(b.abandoned)}</td><td>{number(b.other)}</td><td>{number(b.total)}</td></tr>)}<tr><td><strong>Total geral</strong></td><td><strong>{number(valid.summary.answered)}</strong></td><td><strong>{number(valid.summary.unanswered)}</strong></td><td><strong>{number(valid.summary.abandoned)}</strong></td><td><strong>{number(valid.summary.other)}</strong></td><td><strong>{number(valid.summary.total)}</strong></td></tr></tbody></table></div>}
   </section>
  </>}
 </div>;
}
