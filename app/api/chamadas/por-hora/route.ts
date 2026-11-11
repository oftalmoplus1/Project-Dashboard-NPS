import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/server/auth-session';
import { verifySupabaseUser } from '@/lib/server/verify-supabase-user';
import { getSupabaseServerConfig } from '@/lib/server/supabase-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const headers = { 'Cache-Control': 'private, no-store' };
type HourRow = {
  hora: number; total: number; atendidas: number;
  nao_atendidas: number; abandonadas: number; outras: number;
};
function dateNumber(raw: string | null): number | null {
  if (!raw || !DATE.test(raw)) return null;
  const time = Date.parse(raw + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === raw ? time : null;
}
function validRow(value: unknown): value is HourRow {
  if (value === null || typeof value !== 'object') return false;
  const row = value as Record<string,unknown>;
  return ['hora','total','atendidas','nao_atendidas','abandonadas','outras']
    .every(key => typeof row[key] === 'number' && Number.isSafeInteger(row[key]) && (row[key] as number) >= 0)
    && (row.hora as number) <= 23
    && row.total === (row.atendidas as number)+(row.nao_atendidas as number)+(row.abandonadas as number)+(row.outras as number);
}
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const start=params.get('start'), end=params.get('end');
  const first=dateNumber(start), last=dateNumber(end);
  if (first === null || last === null || last < first || (last-first)/86400000 > 365)
    return NextResponse.json({error:'Período inválido.'},{status:400,headers});
  const token=(await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({error:'Sessão necessária.'},{status:401,headers});
  try {
    if ((await verifySupabaseUser(token))?.role !== 'administrador')
      return NextResponse.json({error:'Acesso não autorizado.'},{status:403,headers});
    const {url,publishableKey}=getSupabaseServerConfig();
    const result=await fetch(url+'/rest/v1/rpc/dashboard_chamadas_por_hora',{
      method:'POST',
      headers:{apikey:publishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({p_inicio:start,p_fim:end}),
      cache:'no-store',signal:AbortSignal.timeout(15000),
    });
    if (!result.ok) return NextResponse.json({error:'Agregação horária indisponível.'},{status:503,headers});
    const rows:unknown=await result.json();
    if (!Array.isArray(rows) || !rows.every(validRow) ||
        new Set(rows.map((r:HourRow)=>r.hora)).size !== rows.length)
      return NextResponse.json({error:'Dados horários inconsistentes.'},{status:502,headers});
    return NextResponse.json({rows},{headers});
  } catch {
    return NextResponse.json({error:'Não foi possível carregar o gráfico horário.'},{status:503,headers});
  }
}
