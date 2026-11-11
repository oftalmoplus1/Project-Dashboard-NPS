import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/server/auth-session';
import { verifySupabaseUser } from '@/lib/server/verify-supabase-user';
import { getSupabaseServerConfig } from '@/lib/server/supabase-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
function parseDate(value: string | null): number | null {
  if (!value || !DATE.test(value)) return null;
  const timestamp = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null;
}
type Metric = number | null;
type Metrics = { taxa_abandono_fila: Metric; tma_segundos: Metric; tme_segundos: Metric };
function metric(value: unknown): value is Metric {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}
function valid(value: unknown): value is Metrics {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return metric(record.taxa_abandono_fila) && metric(record.tma_segundos) && metric(record.tme_segundos)
    && (record.taxa_abandono_fila === null || (record.taxa_abandono_fila as number) <= 100);
}
const noStore = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const start = params.get('start');
  const end = params.get('end');
  const a = parseDate(start), b = parseDate(end);
  if (a === null || b === null || b < a || (b - a) / 86400000 > 365)
    return NextResponse.json({error:'Período inválido.'},{status:400,headers:noStore});
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({error:'Sessão necessária.'},{status:401,headers:noStore});
  try {
    if ((await verifySupabaseUser(token))?.role !== 'administrador') return NextResponse.json({error:'Acesso não autorizado.'},{status:403,headers:noStore});
    const {url,publishableKey} = getSupabaseServerConfig();
    // A RPC deverá ser criada apenas após validar os eventos de fila e as permissões.
    const response = await fetch(`${url}/rest/v1/rpc/dashboard_chamadas_tempos_e_filas`, {
      method:'POST',
      headers:{apikey:publishableKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({p_inicio:start,p_fim:end}),
      cache:'no-store',
      signal:AbortSignal.timeout(15000),
    });
    if (!response.ok) return NextResponse.json({metrics:null,status:'unavailable'},{headers:noStore});
    const payload: unknown = await response.json();
    const row: unknown = Array.isArray(payload) && payload.length === 1 ? payload[0] : payload;
    if (!valid(row)) return NextResponse.json({metrics:null,status:'unavailable'},{headers:noStore});
    return NextResponse.json({metrics:row,status:'ready'},{headers:noStore});
  } catch {
    return NextResponse.json({metrics:null,status:'unavailable'},{headers:noStore});
  }
}
