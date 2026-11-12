import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import AppShell from '@/components/app-shell';
import { SESSION_COOKIE } from '@/lib/server/auth-session';
import { getAuthorizedUser } from '@/lib/server/auth-session';
import { getSupabaseServerConfig } from '@/lib/server/supabase-config';
import { isDashboardItem, existingDashboards, type DashboardItem } from '@/lib/dashboard-registry';

export const dynamic='force-dynamic';

type Topico={nome:string;slug:string};
function isTopico(value:unknown):value is Topico {
 return !!value&&typeof value==='object'
  && typeof (value as Topico).nome==='string'
  && typeof (value as Topico).slug==='string';
}
async function catalogRpc(token:string,name:string,payload:object):Promise<unknown> {
 const {url,publishableKey}=getSupabaseServerConfig();
 const response=await fetch(`${url}/rest/v1/rpc/${name}`,{
  method:'POST',
  headers:{apikey:publishableKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
  body:JSON.stringify(payload),
  cache:'no-store',
  signal:AbortSignal.timeout(12000),
 });
 if(!response.ok)throw new Error('Catalogo indisponivel');
 return response.json();
}

export default async function TopicDashboardPage({
 params,searchParams,
}:{
 params:Promise<{slug:string}>;
 searchParams:Promise<{dashboard?:string|string[]}>;
}){
 const user=await getAuthorizedUser();
 if(!user)redirect('/login');
 // Enquanto as APIs de chamadas nao consultarem a ACL contextual,
 // nao expor os indicadores a gerentes por URL direta.
 if(user.role!=='administrador')notFound();

 const {slug}=await params;
 if(!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)||slug.length>120)notFound();
 const token=(await cookies()).get(SESSION_COOKIE)?.value;
 if(!token)redirect('/login');

 let topics:unknown;
 let dashboards:unknown;
 try{
  [topics,dashboards]=await Promise.all([
   catalogRpc(token,'dashboard_catalogo_listar_topicos',{}),
   catalogRpc(token,'dashboard_catalogo_listar_dashboards_topico',{p_slug:slug})
  ]);
 }catch{
  return <div className="catalog-unavailable" role="alert">Catálogo indisponível. Verifique a migração e tente novamente.</div>;
 }
 if(!Array.isArray(topics)||!topics.every(isTopico))notFound();
 const topic=topics.find((t:Topico)=>t.slug===slug);
 if(!topic||!Array.isArray(dashboards)||!dashboards.every(isDashboardItem))notFound();

 const rows= dashboards as DashboardItem[];
 const filters=await searchParams;
 const chosen=typeof filters.dashboard==='string'?filters.dashboard:rows[0]?.codigo;
 if(chosen&&!rows.some(item=>item.codigo===chosen))notFound();

 const view=existingDashboards.find(item=>item.codigo===chosen);
 if(chosen&&!view)notFound();

 return <AppShell
  section="chamadas"
  role={user.role}
  callView={view?.callView??'geral'}
  topic={{nome:topic.nome,slug:topic.slug,dashboards:rows,activeCode:chosen??null}}
 />;
}
