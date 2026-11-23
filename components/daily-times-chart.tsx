'use client';
import { useEffect, useMemo, useState } from 'react';
import ChartTooltip, { pointFromMouse, pointFromFocus, type TooltipPoint } from './chart-tooltip';
import { resolvePeriod, type Period } from '@/lib/call-dashboard';

type DayRow={dia:string;tma_segundos:number|null;tme_segundos:number|null};
const options:{key:Period;label:string}[]=[
 {key:'today',label:'Hoje'},{key:'yesterday',label:'Ontem'},
 {key:'last7',label:'Últimos 7 dias'},{key:'month',label:'Este mês'},
 {key:'custom',label:'Personalizado'}
];

function fmt(n:number|null){if(n===null)return 'Sem dados';const seconds=Math.round(n);return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');}
export default function DailyTimesChart(){
 const [now,setNow]=useState<Date|null>(null);
 const [period,setPeriod]=useState<Period>('month');
 const [start,setStart]=useState('');const [end,setEnd]=useState('');
 const [snapshot,setSnapshot]=useState<{key:string;rows:DayRow[];semantics:'tef'|'tet_legacy'}|null>(null);
 const [loading,setLoading]=useState(false);const [error,setError]=useState('');
 const [hovered,setHovered]=useState<number|null>(null);
 const [selected,setSelected]=useState<number|null>(null);
 const [pointer,setPointer]=useState<TooltipPoint|null>(null);
 useEffect(()=>{setNow(new Date());},[]);
 const resolved=useMemo(()=>{
  if(!now)return null;
  try{return {range:resolvePeriod(period,now,start,end),error:''};}
  catch(e){return {range:null,error:e instanceof Error?e.message:'Período inválido.'};}
 },[period,now,start,end]);
 const range=resolved?.range;
 const key=range?range.start+':'+range.end:'';
 useEffect(()=>{
  if(!range)return;
  const controller=new AbortController();let active=true;
  setLoading(true);setError('');setHovered(null);setSelected(null);setPointer(null);
  async function load(){
   try{
    const result=await fetch('/api/chamadas/tempos-por-dia?start='+range!.start+'&end='+range!.end,{cache:'no-store',signal:controller.signal});
    if(!result.ok){if((result.status===401||result.status===403)&&active)setSnapshot(null);throw new Error(result.status===401||result.status===403?'Sessão expirada ou acesso negado.':'Dados diários indisponíveis. Valide a função SQL no Supabase.');}
    const payload:unknown=await result.json();
    if(!payload||typeof payload!=='object'||!('rows' in payload)||!Array.isArray(payload.rows))
     throw new Error('Resposta diária inválida.');
    const semantics = 'tme_semantics' in payload ? payload.tme_semantics : null;
    if(semantics!=='tef'&&semantics!=='tet_legacy')throw new Error('Semântica dos tempos não verificada.');
    if(active)setSnapshot({key,rows:payload.rows as DayRow[],semantics});
   }catch(e){if(active&&!controller.signal.aborted)setError(e instanceof Error?e.message:'Falha ao carregar.');}
   finally{if(active)setLoading(false);}
  }
  void load();return()=>{active=false;controller.abort();};
 },[key]);
 const rows=snapshot?.key===key?snapshot.rows:null;
 const tefVerified=snapshot?.key===key&&snapshot.semantics==='tef';
 const series=[
  {key:'tma_segundos',label:'TMA',color:'#2d74ca'},
  {key:'tme_segundos',label:tefVerified?'TME de fila (TEF)':'Espera total (TET legado)',color:'#38964a'},
 ] as const;
 const all=rows?.flatMap(r=>series.map(s=>r[s.key]).filter((v):v is number=>v!==null))??[];
 const ceiling=Math.max(60,Math.ceil(Math.max(0,...all)/60)*60);
 const chartWidth=Math.max(920,(rows?.length??0)*29+76);
 const left=45,top=24,width=chartWidth-left-25,height=235;
 const slotWidth=rows?.length?width/rows.length:width;
 const barWidth=Math.min(15,slotWidth*.32);
 const barGap=Math.min(4,slotWidth*.08);
 const groupWidth=barWidth*2+barGap;
 const posX=(i:number)=>left+(i+.5)*slotWidth;
 const posY=(n:number)=>top+height-(n/ceiling)*height;
 const barX=(i:number,serieIndex:number)=>posX(i)-groupWidth/2+serieIndex*(barWidth+barGap);
 const highlighted=hovered??selected;
 const active=highlighted!==null?rows?.[highlighted]:null;
 return <section className="panel" style={{padding:20,marginBottom:18}}>
  <div className="panel-head"><div><h2>{tefVerified?'TMA e TME de fila diário':'TMA e espera total diária (TET legado)'}</h2><p>Colunas agrupadas por dia · tempo de atendimento e {tefVerified?'espera em fila (TEF)':'espera total (TET)'} · horário de Brasília</p></div></div>
  <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
   {options.map(o=><button key={o.key} type="button" aria-pressed={period===o.key} className={period===o.key?'primary-button':'outline-button'} onClick={()=>setPeriod(o.key)}>{o.label}</button>)}
  </div>
  {period==='custom'&&<div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:12}}>
   <label>Data inicial <input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label>
   <label>Data final <input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label>
  </div>}
  {resolved?.error&&<p role="alert">{resolved.error}</p>}
  {loading&&<p role="status">Carregando médias diárias...</p>}
  {error&&<p role="alert">{error}</p>}
  {rows&&<div>
   <div style={{width:'100%',overflowX:'auto'}} aria-label="Gráfico de colunas agrupadas de TMA e TME por dia. Passe o mouse ou use o teclado para inspecionar os valores.">
    <svg viewBox={`0 0 ${chartWidth} 325`} style={{width:'100%',minWidth:chartWidth>920?chartWidth:600,display:'block'}} xmlns="http://www.w3.org/2000/svg">
     {[0,1,2,3,4].map(i=>{const v=ceiling*i/4,y=posY(v);return <g key={i}>
      <line x1={left} x2={left+width} y1={y} y2={y} stroke="var(--border)" strokeDasharray="3 4"/>
      <text x={left-8} y={y+4} textAnchor="end" fontSize="10" fill="var(--muted)">{Math.round(v)}</text>
     </g>;})}
     {rows.map((r,i)=>i%(rows.length>60?Math.ceil(rows.length/10):rows.length>15?Math.ceil(rows.length/12):1)===0||i===rows.length-1?
      <text key={r.dia} x={posX(i)} y={top+height+22} textAnchor="middle" fontSize="10" fill="var(--muted)">{r.dia.slice(8,10)+'/'+r.dia.slice(5,7)}</text>:null)}
     {series.map((serie,serieIndex)=><g key={serie.key}>
      {rows.map((r,i)=>{
       const value=r[serie.key];
       if(value===null)return null;
       const y=posY(value);
       return <rect key={r.dia} x={barX(i,serieIndex)} y={y}
        width={barWidth} height={Math.max(0,top+height-y)}
        rx={Math.min(2,barWidth/4)}
        fill={serie.color} opacity={highlighted===null||highlighted===i?1:.65}
        style={{transition:'opacity 180ms ease-out, fill 180ms ease-out'}}/>;
      })}
     </g>)}
     {rows.map((r,i)=><rect key={r.dia} x={left+i*slotWidth} y={top}
      width={slotWidth} height={height+6}
      fill="transparent" style={{cursor:'crosshair'}} role="button" tabIndex={0}
      aria-label={r.dia+': TMA '+fmt(r.tma_segundos)+', TME '+fmt(r.tme_segundos)}
      onMouseEnter={e=>{setPointer(pointFromMouse(e));setHovered(i);}} onMouseMove={e=>setPointer(pointFromMouse(e))}
      onMouseLeave={()=>setHovered(null)}
      onFocus={e=>{setHovered(i);setPointer(pointFromFocus(e));}} onBlur={()=>setHovered(null)}
      onClick={e=>{setSelected(selected===i?null:i);setPointer(pointFromMouse(e));}}
      onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(i);setHovered(null);}}}/>)}
    </svg>
   </div>
   <ChartTooltip open={Boolean(active)} point={pointer} title={active ? active.dia.slice(8,10)+'/'+active.dia.slice(5,7)+'/'+active.dia.slice(0,4) : ''}
    values={active ? series.map(item=>({label:item.label,value:fmt(active[item.key]),color:item.color})) : []}
    note={tefVerified ? 'TME de fila (TEF) validado.' : 'TET legado não é TME de fila.'}/>
   <div style={{display:'flex',gap:18,justifyContent:'center',flexWrap:'wrap'}}>
    {series.map(s=><span key={s.key} style={{display:'flex',gap:7,alignItems:'center',fontSize:12}}>
     <span style={{height:9,width:9,borderRadius:'50%',background:s.color}}/>{s.label}</span>)}
   </div>
   <p style={{fontSize:11,opacity:.7,marginTop:12}}>Valores em segundos no eixo vertical; detalhes em mm:ss. TET legado não é TME de fila. Dias sem registros aparecem sem barras. Passe o mouse para ver o tooltip ou selecione pelo teclado.</p>
  </div>}
 </section>;
}
