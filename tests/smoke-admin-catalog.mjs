import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const userId = '00000000-0000-4000-8000-000000000001';
const topics = [
 { id: '00000000-0000-4000-8000-000000000010', nome: 'Relatórios', slug: 'relatorios', posicao: 0, quantidade_dashboards: 2 },
 { id: '00000000-0000-4000-8000-000000000011', nome: 'Financeiro', slug: 'financeiro', posicao: 1, quantidade_dashboards: 1 }
];
const registryRows = [
 { codigo: 'visao-geral-chamadas', nome: 'Visão geral de Chamadas', estado: 'publicado', posicao: 0 },
 { codigo: 'tma-tme-diario', nome: 'TMA e TME diário', estado: 'publicado', posicao: 1 }
];
let mode = 'normal';
let writes = 0;
let associations = 0;
let passed = 0;

const upstream = createServer(async (req,res) => {
 const url = new URL(req.url,'http://127.0.0.1');
 const send = (code,data) => { res.writeHead(code, { 'Content-Type':'application/json' }); res.end(JSON.stringify(data)); };
 if (req.headers.apikey !== 'admin-test-key') return send(401, {});
 if (url.pathname === '/auth/v1/user') {
  const role = req.headers.authorization === 'Bearer admin-catalog-session' ? 'admin'
   : req.headers.authorization === 'Bearer manager-catalog-session' ? 'manager' : null;
  return role ? send(200, { id:userId,app_metadata:{ dashboard_role:role } }) : send(401, {});
 }
 if (req.headers.authorization !== 'Bearer admin-catalog-session') return send(403, { code:'42501' });
 if (req.method !== 'POST') return send(405, {});
 let body = '';
 for await (const part of req) body += part;
 const args = JSON.parse(body);
 if (url.pathname.endsWith('/dashboard_catalogo_listar_topicos')) {
  assert.deepEqual(args,{});
  return send(200,topics);
 }
 if (url.pathname.endsWith('/dashboard_catalogo_listar_dashboards_topico')) {
  assert.ok(['relatorios','financeiro'].includes(args.p_slug));
  return send(200,args.p_slug==='relatorios' ? registryRows : [registryRows[0]]);
 }
 if (url.pathname.endsWith('/dashboard_catalogo_vincular_existente')) {
  associations++;
  assert.deepEqual(args,{p_topico_slug:'relatorios',p_codigo:'chamadas-por-mes'});
  return send(200,'00000000-0000-4000-8000-000000000020');
 }
 if (url.pathname.endsWith('/dashboard_catalogo_atualizar_topico')) {
  writes++;
  if (mode === 'rpc-missing') return send(404,{code:'PGRST202',message:'RPC missing'});
  assert.equal(args.p_slug,'relatorios');
  assert.equal(args.p_nome,'Call Center');
  topics[0].nome='Call Center';
  return send(200,topics[0].id);
 }
 if (url.pathname.endsWith('/dashboard_catalogo_excluir_topico')) {
  writes++;
  assert.deepEqual(args,{p_slug:'financeiro',p_confirmar_slug:'financeiro'});
  return send(200,{
   slug:'financeiro', nome:'Financeiro', vinculos_removidos:1,
   grants_topicos_removidos:0,grants_dashboards_removidos:0,
   dashboards_originais_preservados:true
  });
 }
 return send(404,{ code:'PGRST202' });
});
await new Promise(resolve => upstream.listen(0,'127.0.0.1',resolve));
const port = 3216;
const base = `http://127.0.0.1:${port}`;
// Simulate Coolify: the browser uses a public origin, Next sees an internal URL.
const publicOrigin = 'http://dashboard-public.example';
const app = spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)], {
 env:{ ...process.env,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',
  SUPABASE_URL:`http://127.0.0.1:${upstream.address().port}`,SUPABASE_PUBLISHABLE_KEY:'admin-test-key',APP_ORIGIN:publicOrigin },
 stdio:['ignore','pipe','pipe']
});
let logs = '';
for (const stream of [app.stdout,app.stderr]) stream.on('data',part => { logs=(logs+part).slice(-10000); });
async function request(path,token,method='GET',data,extra={}) {
 return fetch(base+path,{
  method,headers:{
   ...(token?{Cookie:`dashboard_tools_access_token=${token}`}:{}),
   ...(data!==undefined?{'Content-Type':'application/json'}:{}),...extra
  },
  ...(data!==undefined?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(12000)
 });
}
async function check(label,fn){ await fn();passed++;console.log(`ok ${passed} - ${label}`); }
try {
 let ready=false;
 for (let attempt=0;attempt<100;attempt++) {
  if (app.exitCode!==null) throw new Error('Next exited before ready');
  try { if ((await request('/api/catalogo/dashboards')).status===401){ready=true;break;} }
  catch { /* startup */ }
  await delay(100);
 }
 assert.ok(ready,'Next is listening');
 await check('admin inventory includes all 5 real views and unattached ones',async()=>{
  const response=await request('/api/catalogo/dashboards','admin-catalog-session');
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  const data=await response.json();
  assert.equal(data.rows.length,5);
  const linked=data.rows.find(row=>row.codigo==='visao-geral-chamadas');
  assert.equal(linked.topicos.length,2);
  assert.equal(linked.estado,'publicado');
  assert.equal(data.rows.filter(row=>row.estado==='disponivel').length,3);
  assert.equal(data.rows.some(row=>row.codigo==='chamadas-por-hora'),true);
  assert.equal(data.rows.some(row=>row.codigo==='comparativo-anual-chamadas'),true);
  assert.equal(data.rows.some(row=>row.codigo==='ramais'),false);
 });
 await check('manager, unauthenticated and invalid tokens cannot list catalog',async()=>{
  for(const token of [undefined,'manager-catalog-session','invalid']){
   const response=await request('/api/catalogo/dashboards',token);
   assert.equal(response.status,token?403:401);
  }
 });
 await check('public APP_ORIGIN can associate a dashboard behind reverse proxy',async()=>{
  const response=await request('/api/catalogo/topicos/relatorios/dashboards',
   'admin-catalog-session','POST',{codigo:'chamadas-por-mes'},
   {Origin:publicOrigin,'Sec-Fetch-Site':'same-origin'});
  assert.equal(response.status,200);
  assert.equal((await response.json()).id,'00000000-0000-4000-8000-000000000020');
  assert.equal(associations,1);
 });
 await check('malicious Origin and forged forwarded host cannot associate',async()=>{
  const before=associations;
  for(const headers of [
   {Origin:'https://evil.example','Sec-Fetch-Site':'same-origin'},
   {Origin:base,'Sec-Fetch-Site':'same-origin'},
   {Origin:'https://evil.example','X-Forwarded-Host':'evil.example','X-Forwarded-Proto':'https'}
  ]){
   const response=await request('/api/catalogo/topicos/relatorios/dashboards',
    'admin-catalog-session','POST',{codigo:'chamadas-por-mes'},headers);
   assert.equal(response.status,403);
   assert.equal((await response.json()).error,'Origem inválida.');
  }
  assert.equal(associations,before);
 });
 await check('Fetch Metadata cross-site is denied even with allowed Origin',async()=>{
  const before=associations;
  const response=await request('/api/catalogo/topicos/relatorios/dashboards',
   'admin-catalog-session','POST',{codigo:'chamadas-por-mes'},
   {Origin:publicOrigin,'Sec-Fetch-Site':'cross-site'});
  assert.equal(response.status,403);
  assert.equal(associations,before);
 });
 await check('topic CRUD accepts configured public Origin and rejects external Origin',async()=>{
  const route='/api/catalogo/topicos/relatorios';
  const valid=await request(route,'admin-catalog-session','PATCH',{nome:'Call Center'},{Origin:publicOrigin});
  assert.equal(valid.status,200);
  assert.equal((await valid.json()).id,topics[0].id);
  const before=writes;
  for(const method of ['PATCH','DELETE']){
   const payload=method==='PATCH'?{nome:'Call Center'}:{confirmar_slug:'relatorios'};
   const invalid=await request(route,'admin-catalog-session',method,payload,{Origin:'https://evil.example'});
   assert.equal(invalid.status,403);
  }
  assert.equal(writes,before);
 });
 await check('topic CRUD requires an admin on a protected route',async()=>{
  const before=writes;
  const route='/api/catalogo/topicos/relatorios';
  assert.equal((await request(route,'manager-catalog-session','PATCH',{nome:'Call Center'})).status,403);
  assert.equal((await request(route,'manager-catalog-session','DELETE',{confirmar_slug:'relatorios'})).status,403);
  assert.equal((await request(route,'admin-catalog-session','PATCH',{nome:'Call Center'},{Origin:'https://attacker.example'})).status,403);
  assert.equal(writes,before);
 });
 await check('topic edit retains slug and only changes name',async()=>{
  const response=await request('/api/catalogo/topicos/relatorios','admin-catalog-session','PATCH',{nome:'Call Center'});
  assert.equal(response.status,200);
  assert.equal((await response.json()).id,topics[0].id);
  assert.equal(topics[0].slug,'relatorios');
  assert.equal(topics[0].nome,'Call Center');
 });
 await check('RPC missing is unavailable, not an imaginary missing topic',async()=>{
  mode='rpc-missing';
  const response=await request('/api/catalogo/topicos/relatorios','admin-catalog-session','PATCH',{nome:'Call Center'});
  assert.equal(response.status,503);
  mode='normal';
 });
 await check('delete rejects wrong confirmation before DB call',async()=>{
  const before=writes;
  const response=await request('/api/catalogo/topicos/financeiro','admin-catalog-session','DELETE',{confirmar_slug:'other'});
  assert.equal(response.status,400);
  assert.equal(writes,before);
 });
 await check('delete calls scoped RPC and preserves dashboard definitions',async()=>{
  const response=await request('/api/catalogo/topicos/financeiro','admin-catalog-session','DELETE',{confirmar_slug:'financeiro'});
  assert.equal(response.status,200);
  const result=(await response.json()).result;
  assert.equal(result.vinculos_removidos,1);
  assert.equal(result.dashboards_originais_preservados,true);
 });
 await check('manager cannot access administration even by direct page URL',async()=>{
  assert.equal((await request('/topicos','manager-catalog-session')).status,404);
  assert.equal((await request('/dashboards','manager-catalog-session')).status,404);
 });
 console.log(`ADMIN_CATALOG_SMOKE_PASSED=${passed};source=synthetic;database_migration_verified=false`);
} catch (error) {
 console.error(logs);
 throw error;
} finally {
 app.kill('SIGTERM');
 upstream.closeAllConnections();
 await new Promise(resolve=>upstream.close(resolve));
 if(app.exitCode===null){
  await Promise.race([new Promise(resolve=>app.once('exit',resolve)),delay(3000)]);
  if(app.exitCode===null)app.kill('SIGKILL');
 }
}
