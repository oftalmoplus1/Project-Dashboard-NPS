'use client';
import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Table2 } from 'lucide-react';
import { aggregateCalls, createDemoCalls, resolvePeriod, type Period } from '@/lib/call-dashboard';
const periods: { key: Period; label: string }[] = [{ key: 'today', label: 'Hoje' }, { key: 'yesterday', label: 'Ontem' }, { key: 'last7', label: 'Últimos 7 dias' }, { key: 'month', label: 'Este mês' }, { key: 'custom', label: 'Personalizado' }];
const categories = [{ key: 'answered', label: 'Atendidas', color: '#258b78' }, { key: 'unanswered', label: 'Sem atendimento', color: '#d5a047' }, { key: 'abandoned', label: 'Abandonadas', color: '#bc6370' }] as const;
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
 useEffect(() => {
  const initial = new Date();
  setNow(initial); setLastSuccess(initial);
  const timer = window.setInterval(() => { if (document.visibilityState === 'visible') { const date = new Date(); setNow(date); setLastSuccess(date); } }, 60000);
  return () => window.clearInterval(timer);
 }, []);
 const data = useMemo(() => {
  if (!now) return null;
  try {
   const range = resolvePeriod(period, now, start, end);
   return { ...aggregateCalls(createDemoCalls(now), range, now), range };
  } catch (e) { return { error: e instanceof Error ? e.message : 'Período inválido' }; }
 }, [period, start, end, now]);
 const refresh = () => { if (refreshing) return; setRefreshing(true); setError(''); const date = new Date(); setNow(date); setLastSuccess(date); setRefreshing(false); };
 const valid = data && 'summary' in data ? data : null;
 const validation = data && 'error' in data ? data.error : '';
 const activeBucket = valid?.buckets.find(b => b.key === selectedBucket) ?? null;
 const max = Math.max(1, ...(valid?.buckets.map(b => b.answered + b.unanswered + b.abandoned) ?? []));
 const formatTime = (date: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium' }).format(date);
 return <div>
  <div className="notice"><span className="notice-dot"/><span><strong>Dados simulados.</strong> Esta interface não consulta o Supabase nem representa chamadas reais. Os valores são gerados localmente para validar o comportamento do dashboard.</span></div>
  <section className="panel" style={{ padding: 20, marginBottom: 18 }}>
   <div className="panel-head"><div><h2>Período de consulta</h2><p>Horário de Brasília · America/Sao_Paulo</p></div><button className="outline-button" onClick={refresh} disabled={refreshing}><RefreshCw size={16}/> Atualizar agora</button></div>
   <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>{periods.map(p => <button key={p.key} type="button" aria-pressed={period === p.key} onClick={() => setPeriod(p.key)} className={period === p.key ? 'primary-button' : 'outline-button'}>{p.label}</button>)}</div>
   {period === 'custom' && <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}><label>Data inicial <input type="date" value={start} onChange={e => setStart(e.target.value)}/></label><label>Data final <input type="date" value={end} onChange={e => setEnd(e.target.value)}/></label></div>}
   <p style={{ fontSize: 13, opacity: .75 }}>Última atualização demonstrativa: {lastSuccess ? formatTime(lastSuccess) : 'Carregando...'}. Atualização local a cada 60 segundos enquanto a página estiver visível.</p>
   {validation && <p role="alert" style={{ color: 'var(--red)' }}>{validation}</p>}
   {error && <p role="alert">{error}</p>}
  </section>
  {valid && <>
   <div className="stats-grid" style={{ marginBottom: 18 }}>
    {[{ label: 'Registros recebidos', value: number(valid.summary.total) }, { label: 'Atendidos', value: number(valid.summary.answered) }, { label: 'Sem atendimento', value: number(valid.summary.unanswered) }, { label: 'Abandonados', value: number(valid.summary.abandoned) }, { label: 'Taxa de atendimento', value: valid.summary.answerRate === null ? '—' : valid.summary.answerRate.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%' }].map(card => <div className="stat-card" key={card.label}><div className="stat-top"><span>{card.label}</span></div><strong>{card.value}</strong><small>Registros operacionais · demonstração</small></div>)}
   </div>
   <section className="panel" style={{ padding: 20 }}>
    <div className="panel-head"><div><h2>Evolução das chamadas recebidas</h2><p>Colunas empilhadas · {valid.range.granularity === 'hour' ? 'por hora' : valid.range.granularity === 'day' ? 'por dia' : 'por mês'}</p></div></div>
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>{categories.map(c => <span key={c.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}><span style={{ width: 11, height: 11, borderRadius: 2, background: c.color }}/>{c.label}</span>)}</div>
    {valid.summary.total === 0 ? <p>Nenhuma chamada no período selecionado.</p> : <>
     <div tabIndex={0} aria-label="Gráfico de chamadas recebidas, navegação horizontal disponível" style={{ overflowX: 'auto', padding: '16px 4px 12px', scrollBehavior: 'smooth' }}>
      <div style={{ display: 'flex', alignItems: 'end', gap: 12, minWidth: '100%', width: 'max-content', height: 255, borderBottom: '1px solid var(--border, #aaa)' }}>
       {valid.buckets.map(bucket => {
        const selected = activeBucket?.key === bucket.key;
        const known = bucket.answered + bucket.unanswered + bucket.abandoned;
        return <button key={bucket.key} type="button" onClick={() => setSelectedBucket(selected ? null : bucket.key)} aria-pressed={selected} aria-label={`${bucket.label}: ${bucket.answered} atendidas, ${bucket.unanswered} sem atendimento, ${bucket.abandoned} abandonadas, ${bucket.other} outros. Total ${bucket.total}.`} title={`${bucket.label} · ${bucket.total} registros`} style={{ width: 44, display: 'flex', flexDirection: 'column', justifyContent: 'end', alignItems: 'center', height: '100%', flexShrink: 0, border: 0, background: selected ? 'rgba(37,139,120,.10)' : 'transparent', borderRadius: 10, padding: '0 3px', cursor: 'pointer', outlineOffset: 3, transition: 'background .2s ease, transform .2s ease', transform: selected ? 'translateY(-3px)' : undefined }}>
         <span style={{ fontSize: 11, fontWeight: selected ? 700 : 500, opacity: known ? 1 : .5, marginBottom: 6 }}>{known ? number(known) : '·'}</span>
         <span style={{ width: 30, height: 196, display: 'flex', flexDirection: 'column', justifyContent: 'end' }}>
          <span style={{ width: '100%', display: 'flex', flexDirection: 'column-reverse', height: (known / max * 188) + 'px', overflow: 'hidden', borderRadius: '8px 8px 3px 3px', boxShadow: selected ? '0 0 0 2px rgba(37,139,120,.35)' : '0 2px 8px rgba(0,0,0,.09)', transition: 'height .35s ease, box-shadow .2s ease' }}>
           {categories.map(c => <span key={c.key} style={{ height: known ? (bucket[c.key] / known * 100) + '%' : 0, background: c.color, transition: 'height .35s ease' }}/>)}
          </span>
         </span>
         <span style={{ fontSize: 10, height: 32, paddingTop: 8, whiteSpace: 'nowrap', fontWeight: selected ? 700 : 400 }}>{bucket.label}</span>
        </button>;
       })}
      </div>
     </div>
     <p style={{ fontSize: 12, opacity: .7, marginTop: 6 }}>Selecione uma coluna para ver seus detalhes. Use a rolagem horizontal para acessar todos os intervalos.</p>
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
