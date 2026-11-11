import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/server/auth-session';
import { verifySupabaseUser } from '@/lib/server/verify-supabase-user';
import { getSupabaseServerConfig } from '@/lib/server/supabase-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control':'private, no-store' };
type Topico = {
 id: string;
 nome: string;
 slug: string;
 posicao: number;
 quantidade_dashboards: number;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validTopico(value:unknown):value is Topico {
 if (!value || typeof value !== 'object') return false;
 const t=value as Record<string,unknown>;
 return typeof t.id==='string' && UUID.test(t.id)
   && typeof t.nome==='string' && t.nome.length>0 && t.nome.length<=120
   && typeof t.slug==='string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(t.slug)
   && typeof t.posicao==='number' && Number.isSafeInteger(t.posicao) && t.posicao>=0
   && typeof t.quantidade_dashboards==='number'
   && Number.isSafeInteger(t.quantidade_dashboards) && t.quantidade_dashboards>=0;
}

async function rpc(token:string,name:string,payload:object){
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

export async function GET(){
 const token=(await cookies()).get(SESSION_COOKIE)?.value;
 if(!token)return NextResponse.json({error:'Sessão necessária.'},{status:401,headers});
 try {
  const user=await verifySupabaseUser(token);
  if(!user)return NextResponse.json({error:'Acesso não autorizado.'},{status:403,headers});
  const result=await rpc(token,'dashboard_catalogo_listar_topicos',{});
  if(!result.ok)return NextResponse.json(
   {error:'Catálogo de tópicos ainda não disponível.'},
   {status:result.status===401||result.status===403?403:503,headers}
  );
  const rows:unknown=await result.json();
  if(!Array.isArray(rows)||!rows.every(validTopico)){
   return NextResponse.json({error:'Dados do catálogo inconsistentes.'},{status:502,headers});
  }
  return NextResponse.json({rows},{headers});
 } catch {
  return NextResponse.json({error:'Catálogo de tópicos indisponível.'},{status:503,headers});
 }
}

export async function POST(request:Request){
 const origin=request.headers.get('origin');
 const site=request.headers.get('sec-fetch-site');
 if((origin && origin!==new URL(request.url).origin) || site==='cross-site'){
  return NextResponse.json({error:'Origem inválida.'},{status:403,headers});
 }
 if(!request.headers.get('content-type')?.includes('application/json')){
  return NextResponse.json({error:'Formato inválido.'},{status:415,headers});
 }
 const token=(await cookies()).get(SESSION_COOKIE)?.value;
 if(!token)return NextResponse.json({error:'Sessão necessária.'},{status:401,headers});
 let payload:unknown;
 try{payload=await request.json();}catch{
  return NextResponse.json({error:'Dados inválidos.'},{status:400,headers});
 }
 if(!payload || typeof payload!=='object'||Array.isArray(payload)){
  return NextResponse.json({error:'Dados inválidos.'},{status:400,headers});
 }
 const {nome}=payload as Record<string,unknown>;
 if(typeof nome!=='string'||nome.trim().length<1||nome.trim().length>120){
  return NextResponse.json({error:'Informe um nome entre 1 e 120 caracteres.'},{status:400,headers});
 }
 const cleanName=nome.trim();
 const slug=cleanName.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,120).replace(/-$/,'');
 if(!slug){
  return NextResponse.json({error:'Nome sem identificador válido.'},{status:400,headers});
 }
 try {
  const user=await verifySupabaseUser(token);
  if(!user||user.role!=='administrador'){
   return NextResponse.json({error:'Somente administradores podem criar tópicos.'},{status:403,headers});
  }
  const result=await rpc(token,'dashboard_catalogo_criar_topico',{p_nome:cleanName,p_slug:slug});
  if(!result.ok){
   if(result.status===409)return NextResponse.json(
    {error:'Já existe um tópico com este identificador.'},{status:409,headers}
   );
   return NextResponse.json({error:'Não foi possível criar o tópico.'},
    {status:result.status===401||result.status===403?403:503,headers});
  }
  const newId:unknown=await result.json();
  if(typeof newId!=='string'||!UUID.test(newId)){
   return NextResponse.json({error:'Confirmação de cadastro inesperada.'},{status:502,headers});
  }
  return NextResponse.json({id:newId},{status:201,headers});
 } catch {
  return NextResponse.json({error:'Não foi possível criar o tópico.'},{status:503,headers});
 }
}
