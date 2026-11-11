import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/server/auth-session';
import { verifySupabaseUser } from '@/lib/server/verify-supabase-user';
import { getSupabaseServerConfig } from '@/lib/server/supabase-config';
import { isDashboardItem, isExistingDashboardCode } from '@/lib/dashboard-registry';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const noStore={'Cache-Control':'private, no-store'};
const validSlug=(value:string)=>value.length<=120 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value);
const unauthorized=()=>NextResponse.json({error:'Acesso não autorizado.'},{status:403,headers:noStore});

async function rpc(token:string,name:string,payload:Record<string,string>){
 const {url,publishableKey}=getSupabaseServerConfig();
 return fetch(`${url}/rest/v1/rpc/${name}`,{
  method:'POST',
  headers:{
   apikey:publishableKey,
   Authorization:`Bearer ${token}`,
   'Content-Type':'application/json',
   Accept:'application/json',
  },
  body:JSON.stringify(payload),
  cache:'no-store',
  signal:AbortSignal.timeout(12000),
 });
}

export async function GET(
 _request:Request,{params}:{params:Promise<{slug:string}>}
){
 const {slug}=await params;
 if(!validSlug(slug))return NextResponse.json({error:'Tópico inválido.'},{status:400,headers:noStore});
 const token=(await cookies()).get(SESSION_COOKIE)?.value;
 if(!token)return NextResponse.json({error:'Sessão necessária.'},{status:401,headers:noStore});
 try {
  if(!await verifySupabaseUser(token))return unauthorized();
  const response=await rpc(token,'dashboard_catalogo_listar_dashboards_topico',{p_slug:slug});
  if(!response.ok)return NextResponse.json(
   {error:'Associações de dashboards ainda indisponíveis.'},
   {status:response.status===401||response.status===403?403:503,headers:noStore}
  );
  const payload:unknown=await response.json();
  if(!Array.isArray(payload)||!payload.every(isDashboardItem)){
   return NextResponse.json({error:'Associações inconsistentes.'},{status:502,headers:noStore});
  }
  return NextResponse.json({rows:payload},{headers:noStore});
 }catch{
  return NextResponse.json({error:'Não foi possível carregar os dashboards.'},{status:503,headers:noStore});
 }
}

export async function POST(
 request:Request,{params}:{params:Promise<{slug:string}>}
){
 const {slug}=await params;
 if(!validSlug(slug))return NextResponse.json({error:'Tópico inválido.'},{status:400,headers:noStore});
 const origin=request.headers.get('origin');
 const site=request.headers.get('sec-fetch-site');
 if((origin&&origin!==new URL(request.url).origin)||site==='cross-site'){
  return NextResponse.json({error:'Origem inválida.'},{status:403,headers:noStore});
 }
 if(!request.headers.get('content-type')?.includes('application/json')){
  return NextResponse.json({error:'Formato inválido.'},{status:415,headers:noStore});
 }
 const token=(await cookies()).get(SESSION_COOKIE)?.value;
 if(!token)return NextResponse.json({error:'Sessão necessária.'},{status:401,headers:noStore});
 let data:unknown;
 try{data=await request.json();}catch{
  return NextResponse.json({error:'Dados inválidos.'},{status:400,headers:noStore});
 }
 if(!data||typeof data!=='object'||Array.isArray(data)){
  return NextResponse.json({error:'Dados inválidos.'},{status:400,headers:noStore});
 }
 const codigo=(data as Record<string,unknown>).codigo;
 if(!isExistingDashboardCode(codigo)){
  return NextResponse.json({error:'Dashboard não reconhecido.'},{status:400,headers:noStore});
 }
 try{
  const user=await verifySupabaseUser(token);
  if(!user||user.role!=='administrador')return unauthorized();
  const response=await rpc(token,'dashboard_catalogo_vincular_existente',{
   p_topico_slug:slug,p_codigo:codigo
  });
  if(!response.ok)return NextResponse.json(
   {error:'Não foi possível associar o dashboard. Confira o tópico e a migração.'},
   {status:response.status===401||response.status===403?403:503,headers:noStore}
  );
  const dashboardId:unknown=await response.json();
  if(typeof dashboardId!=='string'||!(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).test(dashboardId)){
   return NextResponse.json({error:'Confirmação inesperada.'},{status:502,headers:noStore});
  }
  return NextResponse.json({id:dashboardId},{status:200,headers:noStore});
 }catch{
  return NextResponse.json({error:'Não foi possível associar o dashboard.'},{status:503,headers:noStore});
 }
}
