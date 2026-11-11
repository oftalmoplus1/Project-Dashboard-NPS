import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/server/auth-session';
import { verifySupabaseUser } from '@/lib/server/verify-supabase-user';
import { getSupabaseServerConfig } from '@/lib/server/supabase-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control':'private, no-store' };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
type DayRow = { dia:string; tma_segundos:number|null; tme_segundos:number|null };
function dateNumber(value:string|null):number|null {
 if(!value || !DATE.test(value)) return null;
 const n=Date.parse(value+'T00:00:00Z');
 return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===value?n:null;
}
function validRow(value:unknown):value is DayRow {
 if(!value || typeof value!=='object')return false;
 const r=value as Record<string,unknown>;
 const validMetric=(v:unknown)=>v===null||(typeof v==='number'&&Number.isFinite(v)&&v>=0);
 return typeof r.dia==='string'&&dateNumber(r.dia)!==null&&validMetric(r.tma_segundos)&&validMetric(r.tme_segundos);
}
export async function GET(request:Request) {
 const params=new URL(request.url).searchParams;
 const start=params.get('start'),end=params.get('end');
 const first=dateNumber(start),last=dateNumber(end);
 if(first===null||last===null||last<first||(last-first)/86400000>365)
  return NextResponse.json({error:'Período inválido.'},{status:400,headers:noStore});
 const token=(await cookies()).get(SESSION_COOKIE)?.value;
 if(!token)return NextResponse.json({error:'Sessão necessária.'},{status:401,headers:noStore});
 try {
  if(!await verifySupabaseUser(token))return NextResponse.json({error:'Acesso não autorizado.'},{status:403,headers:noStore});
  const {url,publishableKey}=getSupabaseServerConfig();
  const result=await fetch(url+'/rest/v1/rpc/dashboard_chamadas_tempos_por_dia',{
   method:'POST',
   headers:{apikey:publishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},
   body:JSON.stringify({p_inicio:start,p_fim:end}),
   cache:'no-store',signal:AbortSignal.timeout(15000),
  });
  if(!result.ok)return NextResponse.json({error:'Indicadores diários ainda indisponíveis.'},{status:503,headers:noStore});
  const payload:unknown=await result.json();
  const expected=Math.round((last-first)/86400000)+1;
  if(!Array.isArray(payload)||payload.length!==expected||!payload.every(validRow)||
     payload.some((r:DayRow,i:number)=>r.dia!==new Date(first+i*86400000).toISOString().slice(0,10)))
   return NextResponse.json({error:'Dados diários inconsistentes.'},{status:502,headers:noStore});
  return NextResponse.json({rows:payload},{headers:noStore});
 } catch {
  return NextResponse.json({error:'Não foi possível carregar TMA e TME diários.'},{status:503,headers:noStore});
 }
}
