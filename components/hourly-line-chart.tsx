'use client';

import { useEffect, useMemo, useState } from 'react';

type HourRow = {hora:number; total:number; atendidas:number; nao_atendidas:number; abandonadas:number; outras:number};
const series = [
  {key:'atendidas',label:'Atendidas',color:'#2d74ca'},
  {key:'nao_atendidas',label:'Não atendidas',color:'#38964a'},
  {key:'abandonadas',label:'Abandonadas',color:'#d65f33'}
] as const;
const display = (n:number) => n.toLocaleString('pt-BR');
function parseRows(value:unknown):HourRow[] {
  if (!value || typeof value!=='object' || !('rows' in value) || !Array.isArray(value.rows))
    throw new Error('Resposta horária inválida.');
  const rows:HourRow[] = value.rows;
  const seen=new Set<number>();
  for (const row of rows) {
    if (!row || !Number.isInteger(row.hora) || row.hora<0 || row.hora>23 || seen.has(row.hora) ||
      !['total','atendidas','nao_atendidas','abandonadas','outras'].every(key=>{
        const n=row[key as keyof HourRow];
        return Number.isSafeInteger(n) && n>=0;
      }) ||
      row.total!==row.atendidas+row.nao_atendidas+row.abandonadas+row.outras)
      throw new Error('Contagens horárias inconsistentes.');
    seen.add(row.hora);
  }
  return rows;
}
export default function HourlyLineChart({start,end,refreshKey}:{start:string;end:string;refreshKey:number}) {
  const [snapshot,setSnapshot]=useState<{key:string;rows:HourRow[]}|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [selected,setSelected]=useState<number|null>(null);
  const [hovered,setHovered]=useState<number|null>(null);
  const key=start+':'+end;
  useEffect(()=>{
    const controller=new AbortController();
    let active=true;
    setLoading(true);setError('');setSelected(null);setHovered(null);
    const load=async()=>{
      try {
        const res=await fetch('/api/chamadas/por-hora?start='+start+'&end='+end,{cache:'no-store',signal:controller.signal});
        if (!res.ok) throw new Error(res.status===401||res.status===403?'Sessão expirada ou acesso negado.':'Agregação por hora ainda indisponível.');
        const rows=parseRows(await res.json());
        if (active) setSnapshot({key,rows});
      } catch(e) {
        if(active && !controller.signal.aborted) setError(e instanceof Error?e.message:'Falha ao carregar o gráfico.');
      } finally {if(active)setLoading(false);}
    };
    void load();
    return ()=>{active=false;controller.abort();};
  },[key,start,end,refreshKey]);
  const values=useMemo(()=>{
    if(snapshot?.key!==key)return null;
    const hours=Array.from({length:24},(_,hour)=>({hora:hour,total:0,atendidas:0,nao_atendidas:0,abandonadas:0,outras:0}));
    for(const item of snapshot.rows)hours[item.hora]=item;
    return hours;
  },[snapshot,key]);
  const max=Math.max(1,...(values?.flatMap(v=>series.map(s=>v[s.key]))??[0]));
  const ceiling=Math.max(4,Math.ceil(max/4)*4);
  const left=48,top=18,width=842,height=245;
  const posX=(hour:number)=>left+hour/23*width;
  const posY=(n:number)=>top+height-(n/ceiling)*height;
  const line=(field:typeof series[number]['key']) => values ? values.map((v,i)=>
    (i===0?'M':'L')+posX(v.hora).toFixed(2)+','+posY(v[field]).toFixed(2)
  ).join(' ') : '';
  const active=selected!==null && values ? values[selected] : null;
  const highlightedHour=hovered ?? selected;
  const highlighted=highlightedHour!==null && values ? values[highlightedHour] : null;
  const tooltipX=highlightedHour===null ? 0 : Math.max(left+4,Math.min(left+width-190,posX(highlightedHour)-95));
  return <section className="panel" style={{padding:20,marginBottom:18}}>
    <div className="panel-head"><div><h2>Chamadas por hora</h2><p>Gráfico de linhas · intervalos exatos de 1 hora · horário de Brasília</p></div></div>
    {loading && <p role="status" style={{fontSize:12}}>Atualizando dados horários...</p>}
    {error && <p role="alert" style={{fontSize:12}}>{error} Nenhum valor foi estimado a partir de intervalos de duas horas.</p>}
    {values && <div>
      <div role="img" aria-label="Gráfico de linhas interativo de chamadas por hora, com valores de atendidas, não atendidas e abandonadas. Use mouse, toque ou teclado para consultar as 24 horas." style={{width:'100%',overflowX:'auto'}}>
        <svg viewBox="0 0 920 325" style={{display:'block',width:'100%',minWidth:620,height:'auto'}} xmlns="http://www.w3.org/2000/svg">
          {[0,1,2,3,4].map(i=>{
            const val=ceiling*i/4,y=posY(val);
            return <g key={i}>
              <line x1={left} x2={left+width} y1={y} y2={y} stroke="var(--border)" strokeDasharray="3 4"/>
              <text x={left-10} y={y+4} textAnchor="end" fontSize="11" fill="var(--muted)">{display(val)}</text>
            </g>;
          })}
          {Array.from({length:24},(_,i)=>i).filter(h=>h%2===0||h===23).map(h=>
            <text key={h} x={posX(h)} y={top+height+24} textAnchor="middle" fontSize="11" fill="var(--muted)">{String(h).padStart(2,'0')}h</text>
          )}
          {series.map(s=><g key={s.key}>
            <path d={line(s.key)} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            {values.map(v=><circle key={v.hora} cx={posX(v.hora)} cy={posY(v[s.key])}
              r={highlightedHour===v.hora ? 5.5 : 3.6} fill={s.color} stroke="var(--panel)" strokeWidth="1.5"/>)}
          </g>)}
          {highlighted && highlightedHour!==null && <g pointerEvents="none">
            <line x1={posX(highlightedHour)} x2={posX(highlightedHour)} y1={top} y2={top+height}
              stroke="var(--muted)" strokeDasharray="4 4" opacity=".8"/>
            <rect x={tooltipX} y={top+6} width="190" height="124" rx="9"
              fill="var(--panel)" stroke="var(--border)" strokeWidth="1.5"/>
            <text x={tooltipX+12} y={top+27} fontSize="13" fontWeight="700" fill="var(--text)">
              {String(highlightedHour).padStart(2,'0')}h–{String(highlightedHour).padStart(2,'0')}h59 · Total: {display(highlighted.total)}
            </text>
            {series.map((serie,i)=><g key={serie.key}>
              <circle cx={tooltipX+18} cy={top+47+i*23} r="4" fill={serie.color}/>
              <text x={tooltipX+30} y={top+51+i*23} fontSize="12" fill="var(--text)">{serie.label}</text>
              <text x={tooltipX+177} y={top+51+i*23} textAnchor="end" fontSize="12" fontWeight="700" fill="var(--text)">
                {display(highlighted[serie.key])}
              </text>
            </g>)}
          </g>}
          {values.map((v,i)=><rect key={v.hora}
            x={i===0 ? left-12 : (posX(i-1)+posX(i))/2}
            y={top} width={i===0 || i===23 ? (width/23)/2+12 : width/23}
            height={height+9} fill="transparent" style={{cursor:'crosshair'}}
            role="button" tabIndex={0}
            aria-label={String(v.hora).padStart(2,'0')+'h: '+display(v.total)+' chamadas; '+display(v.atendidas)+' atendidas, '+display(v.nao_atendidas)+' não atendidas, '+display(v.abandonadas)+' abandonadas'}
            onMouseEnter={()=>setHovered(v.hora)}
            onMouseLeave={()=>setHovered(null)}
            onFocus={()=>setHovered(v.hora)}
            onBlur={()=>setHovered(null)}
            onClick={()=>{setSelected(v.hora);setHovered(null);}}
            onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(v.hora);setHovered(null);}}}
          />)}
        </svg>
      </div>
      <div style={{display:'flex',gap:18,flexWrap:'wrap',justifyContent:'center',marginTop:4}}>
        {series.map(s=><span key={s.key} style={{display:'flex',alignItems:'center',gap:7,fontSize:12}}>
          <span style={{height:9,width:9,borderRadius:'50%',background:s.color}}/>{s.label}
        </span>)}
      </div>
      <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',marginTop:16}}>
        <label htmlFor="hour-detail" style={{fontSize:12}}>Detalhar hora</label>
        <select id="hour-detail" value={selected??''} onChange={e=>setSelected(e.target.value===''?null:Number(e.target.value))}
          style={{background:'var(--panel)',color:'var(--text)',border:'1px solid var(--border)',padding:8,borderRadius:8}}>
          <option value="">Selecione uma hora</option>
          {values.map(row=><option key={row.hora} value={row.hora}>{String(row.hora).padStart(2,'0')}h</option>)}
        </select>
        {active && <span role="status" style={{fontSize:12}}>{display(active.total)} no total · {display(active.atendidas)} atendidas · {display(active.nao_atendidas)} não atendidas · {display(active.abandonadas)} abandonadas{active.outras>0?' · '+display(active.outras)+' outras':''}</span>}
      </div>
      <p style={{fontSize:11,opacity:.7,marginTop:12}}>Passe o mouse sobre o gráfico para ver os valores de cada hora. Clique, toque ou use Enter para fixar uma hora; o seletor abaixo também permite consultar os detalhes. Horário de Brasília; os filtros do dashboard são respeitados.</p>
    </div>}
  </section>;
}
