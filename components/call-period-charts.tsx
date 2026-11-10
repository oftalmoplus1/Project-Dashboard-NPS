'use client';

import { useEffect, useMemo, useState } from 'react';
import type { RpcRow } from '@/lib/call-dashboard-aggregates';

type Counts = { answered: number; unanswered: number; abandoned: number; other: number; total: number };
const zero = (): Counts => ({ answered: 0, unanswered: 0, abandoned: 0, other: 0, total: 0 });
const colors = [
  { key: 'answered', label: 'Atendidas', color: '#12b981' },
  { key: 'unanswered', label: 'Sem atendimento', color: '#f5b83d' },
  { key: 'abandoned', label: 'Abandonadas', color: '#f05a73' },
] as const;
const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const fmt = (value: number) => value.toLocaleString('pt-BR');
function add(bucket: Counts, row: RpcRow) {
  bucket.answered += row.atendidas;
  bucket.unanswered += row.nao_atendidas;
  bucket.abandoned += row.abandonadas;
  bucket.other += row.outras;
  bucket.total += row.total;
}
function validateRows(payload: unknown): RpcRow[] {
  if (!payload || typeof payload !== 'object' || !('rows' in payload) || !Array.isArray(payload.rows)) throw new Error('Resposta mensal inválida.');
  return payload.rows.map((r: unknown) => {
    if (!r || typeof r !== 'object') throw new Error('Registro mensal inválido.');
    const row = r as Record<string, unknown>;
    if (typeof row.periodo_inicio !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:/.test(row.periodo_inicio) ||
      !['total','atendidas','nao_atendidas','abandonadas','outras'].every(k => Number.isSafeInteger(row[k]) && (row[k] as number) >= 0) ||
      row.total !== (row.atendidas as number) + (row.nao_atendidas as number) + (row.abandonadas as number) + (row.outras as number))
      throw new Error('Contagens mensais inconsistentes.');
    return row as RpcRow;
  });
}
function Legend() {
  return <div style={{display:'flex', gap:16, flexWrap:'wrap', marginBottom:16}}>
    {colors.map(c => <span key={c.key} style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:12}}><span style={{width:11,height:11,borderRadius:2,background:c.color}}/>{c.label}</span>)}
  </div>;
}
export default function CallPeriodCharts({ rows, rangeStart, rangeEnd, year, onYearChange, currentYear, refreshKey }:
  { rows: RpcRow[]; rangeStart: string; rangeEnd: string; year: number; onYearChange: (year:number)=>void; currentYear: number; refreshKey: number }) {
  const [annual, setAnnual] = useState<{year:number;rows:RpcRow[]}|null>(null);
  const [annualError, setAnnualError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<number|null>(null);
  const [selectedHour, setSelectedHour] = useState<number|null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const load = async () => {
      setLoading(true); setAnnualError('');
      try {
        // A RPC fornece intervalos de duas horas. Consultas bimestrais evitam
        // exceder limites de linhas do PostgREST ao consultar um ano inteiro.
        const ranges = Array.from({length:6},(_,index) => {
          const first = index*2+1;
          const start = `${year}-${String(first).padStart(2,'0')}-01`;
          const end = new Date(Date.UTC(year,first+1,0)).toISOString().slice(0,10);
          return {start,end};
        });
        const groups = await Promise.all(ranges.map(async ({start,end}) => {
          const response = await fetch(`/api/chamadas?start=${start}&end=${end}`,{cache:'no-store',signal:controller.signal});
          if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Acesso não autorizado.' : 'Não foi possível consultar o ano.');
          return validateRows(await response.json());
        }));
        if (active) setAnnual({year,rows:groups.flat()});
      } catch (error) {
        if (active && !controller.signal.aborted) setAnnualError(error instanceof Error ? error.message : 'Erro ao consultar os meses.');
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; controller.abort(); };
  }, [year,refreshKey]);
  const annualReady = annual?.year === year ? annual.rows : null;
  const monthData = useMemo(() => {
    if (!annualReady) return null;
    const buckets = Array.from({length:12}, zero);
    for (const row of annualReady) {
      const date = row.periodo_inicio.slice(0,10);
      if (!date.startsWith(String(year))) continue;
      const month = Number(date.slice(5,7)) - 1;
      if (month >= 0 && month < 12) add(buckets[month],row);
    }
    const firstRecorded = annualReady.length ? Math.min(...annualReady.map(r => Number(r.periodo_inicio.slice(5,7)) - 1)) : 12;
    return { buckets, firstRecorded };
  }, [annualReady,year]);
  const hourly = useMemo(() => {
    const buckets = Array.from({length:12},zero);
    for (const row of rows) {
      const date = row.periodo_inicio.slice(0,10);
      if (date < rangeStart || date > rangeEnd) continue;
      const hour = Number(row.periodo_inicio.slice(11,13));
      if (hour >= 0 && hour < 24 && hour % 2 === 0) add(buckets[hour/2],row);
    }
    return buckets;
  },[rows,rangeStart,rangeEnd]);
  const maxMonth = Math.max(1,...(monthData?.buckets.map(b=>b.answered+b.unanswered+b.abandoned) ?? []));
  const maxHour = Math.max(1,...hourly.map(b=>b.answered+b.unanswered+b.abandoned));
  const selectedMonthly = selectedMonth === null ? null : monthData?.buckets[selectedMonth];
  const selectedHourly = selectedHour === null ? null : hourly[selectedHour];
  return <div>
    <section className="panel" style={{padding:20,marginBottom:18}}>
      <div className="panel-head"><div><h2>Chamadas por mês</h2><p>Comparativo mensal no ano selecionado · barras horizontais empilhadas</p></div>
        <label style={{display:'flex',alignItems:'center',gap:8,fontSize:12}}>Ano
          <select aria-label="Selecionar ano do gráfico mensal" value={year} onChange={e=>{onYearChange(Number(e.target.value));setSelectedMonth(null);}}
            style={{padding:8,border:'1px solid var(--border)',borderRadius:8,background:'var(--panel)',color:'var(--text)'}}>
            {Array.from({length:5},(_,i)=>currentYear-i).map(y=><option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </div>
      <Legend/>
      {loading && <p role="status">Atualizando comparação mensal...</p>}
      {annualError && <p role="alert">{annualError}</p>}
      {monthData && <div style={{display:'grid',gap:10}}>
        {monthData.buckets.map((b,i)=>{
          const known=b.answered+b.unanswered+b.abandoned;
          const future = year===currentYear && i > Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',month:'numeric'}).format(new Date()))-1;
          const withoutHistory = i < monthData.firstRecorded || future;
          return <div key={i} style={{display:'grid',gridTemplateColumns:'36px minmax(0,1fr) 75px',gap:12,alignItems:'center'}}>
            <span style={{fontSize:12}}>{months[i]}</span>
            <button type="button" aria-label={`${months[i]}: ${withoutHistory?'sem histórico disponível':`${b.answered} atendidas, ${b.unanswered} sem atendimento, ${b.abandoned} abandonadas, ${b.other} outras`}`}
              aria-pressed={selectedMonth===i} disabled={withoutHistory} onClick={()=>setSelectedMonth(selectedMonth===i?null:i)}
              style={{border:0,padding:0,width:'100%',height:19,display:'flex',background:'var(--soft)',borderRadius:3,overflow:'hidden',cursor:withoutHistory?'default':'pointer',outlineOffset:3,boxShadow:selectedMonth===i?'0 0 0 2px var(--teal)':'none'}}>
              {known>0 && <div style={{display:'flex',width:`${known/maxMonth*100}%`,height:'100%'}}>
                {colors.map(c=><span key={c.key} style={{width:`${b[c.key]/known*100}%`,background:c.color}}/>)}
              </div>}
            </button>
            <span style={{textAlign:'right',fontSize:11,opacity:.75}}>{withoutHistory?'Sem dados':fmt(b.total)}</span>
          </div>;
        })}
      </div>}
      {selectedMonthly && <p role="status" style={{fontSize:12,marginTop:14}}><strong>{months[selectedMonth!]}:</strong> {fmt(selectedMonthly.total)} chamadas · {fmt(selectedMonthly.answered)} atendidas · {fmt(selectedMonthly.unanswered)} sem atendimento · {fmt(selectedMonthly.abandoned)} abandonadas{selectedMonthly.other? ` · ${fmt(selectedMonthly.other)} outras`:''}.</p>}
      <p style={{fontSize:11,opacity:.7,marginTop:14}}>Os meses anteriores ao primeiro registro disponível e os meses futuros não representam volume zero. O mês corrente pode estar incompleto. Os dados seguem a classificação de chamadas recebidas do dashboard.</p>
    </section>
    <section className="panel" style={{padding:20,marginBottom:18}}>
      <div className="panel-head"><div><h2>Chamadas por hora</h2><p>Distribuição no período selecionado · intervalos de 2 horas, conforme a consulta atual</p></div></div>
      <Legend/>
      <div tabIndex={0} aria-label="Gráfico por faixas horárias, com rolagem horizontal" style={{overflowX:'auto'}}>
        <div style={{display:'flex',height:255,alignItems:'end',gap:10,minWidth:690,borderBottom:'1px solid var(--border)'}}>
          {hourly.map((b,i)=>{
            const known=b.answered+b.unanswered+b.abandoned;
            return <button key={i} type="button" onClick={()=>setSelectedHour(selectedHour===i?null:i)} aria-pressed={selectedHour===i}
              title={`${String(i*2).padStart(2,'0')}h–${String(i*2+2).padStart(2,'0')}h: ${b.total} chamadas`}
              style={{flex:1,height:'100%',border:0,background:'transparent',color:'var(--text)',display:'flex',alignItems:'center',justifyContent:'end',flexDirection:'column',padding:'0 4px',outlineOffset:2}}>
              <span style={{fontSize:10,marginBottom:6}}>{known?fmt(known):'·'}</span>
              <span style={{height:196,width:'100%',display:'flex',flexDirection:'column',justifyContent:'end'}}>
                <span style={{height:`${known/maxHour*188}px`,width:'100%',display:'flex',flexDirection:'column-reverse',overflow:'hidden',borderRadius:'5px 5px 0 0',boxShadow:selectedHour===i?'0 0 0 2px var(--teal)':'none'}}>
                  {colors.map(c=><span key={c.key} style={{height:known?`${b[c.key]/known*100}%`:0,background:c.color}}/>)}
                </span>
              </span>
              <span style={{fontSize:10,marginTop:9,height:22}}>{String(i*2).padStart(2,'0')}h</span>
            </button>;
          })}
        </div>
      </div>
      {selectedHourly && <p role="status" style={{fontSize:12,marginTop:14}}><strong>{String(selectedHour!*2).padStart(2,'0')}h–{String(selectedHour!*2+2).padStart(2,'0')}h:</strong> {fmt(selectedHourly.total)} chamadas · {fmt(selectedHourly.answered)} atendidas · {fmt(selectedHourly.unanswered)} sem atendimento · {fmt(selectedHourly.abandoned)} abandonadas.</p>}
      <p style={{fontSize:11,opacity:.7,marginTop:12}}>O gráfico utiliza as faixas de duas horas disponíveis na RPC atual, para não inventar números por hora. Um agrupamento exato de uma hora exigirá ajuste validado da RPC no Supabase.</p>
    </section>
  </div>;
}
