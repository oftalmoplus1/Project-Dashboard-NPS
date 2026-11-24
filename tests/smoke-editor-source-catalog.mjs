import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

let authRequests = 0;
let dataRequests = 0;
let passed = 0;
const upstream = createServer(async (req, res) => {
 const url = new URL(req.url ?? '/', 'http://127.0.0.1');
 const send = (status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
 };
 if (req.headers.apikey !== 'editor-catalog-test') return send(401, {});
 if (url.pathname === '/auth/v1/user') {
  authRequests++;
  const token = req.headers.authorization;
  if (token === 'Bearer source-admin') return send(200, {
   id: '00000000-0000-4000-8000-000000000001',
   app_metadata: { dashboard_role: 'admin' }
  });
  if (token === 'Bearer source-manager') return send(200, {
   id: '00000000-0000-4000-8000-000000000002',
   app_metadata: { dashboard_role: 'manager' },
   user_metadata: { dashboard_role: 'admin' }
  });
  return send(401, {});
 }
 dataRequests++;
 return send(500, { error: 'Unexpected database access in metadata-only catalog' });
});
await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));

const port = 3221;
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, [
 'node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)
], {
 env: {
  ...process.env,
  NODE_ENV: 'production',
  NEXT_TELEMETRY_DISABLED: '1',
  SUPABASE_URL: `http://127.0.0.1:${upstream.address().port}`,
  SUPABASE_PUBLISHABLE_KEY: 'editor-catalog-test',
  APP_ORIGIN: origin
 },
 stdio: ['ignore', 'pipe', 'pipe']
});
let logs = '';
for (const stream of [app.stdout, app.stderr]) {
 stream.on('data', chunk => { logs = (logs + chunk).slice(-12000); });
}
const endpoint = '/api/catalogo/fontes-editor';
const request = (token, path = endpoint, method = 'GET') =>
 fetch(origin + path, {
  method,
  headers: token ? { Cookie: `dashboard_tools_access_token=${token}` } : {},
  signal: AbortSignal.timeout(12000)
 });
async function check(label, fn) {
 await fn();
 passed++;
 console.log(`ok ${passed} - ${label}`);
}

try {
 let ready = false;
 for (let attempt = 0; attempt < 100; attempt++) {
  if (app.exitCode !== null) throw new Error('Next exited before readiness');
  try {
   if ((await request()).status === 401) { ready = true; break; }
  } catch { /* startup */ }
  await delay(100);
 }
 assert.ok(ready, 'Application readiness');

 await check('unauthenticated requires session', async () => {
  assert.equal((await request()).status, 401);
 });
 await check('manager and forged metadata cannot view catalog', async () => {
  const manager = await request('source-manager');
  assert.equal(manager.status, 403);
  assert.equal((await request('source-invalid')).status, 403);
 });
 await check('admin receives only explicitly inventoried metadata', async () => {
  const response = await request('source-admin');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const result = await response.json();
  assert.equal(result.consultasHabilitadas, false);
  assert.deepEqual(result.rows.map(x => x.id), ['listar_filas', 'relatorio_chamadas']);
  assert.ok(result.rows.every(x => x.consultasHabilitadas === false));
  assert.equal(result.rows[0].natureza, 'fotografia_atual');
  assert.equal(result.rows[1].natureza, 'historico_de_eventos');
  assert.equal(result.rows[0].referenciaTemporal.includes('updated_at'), true);
  assert.equal(result.rows[1].referenciaTemporal.includes('init_time'), true);
  assert.ok(result.rows.every(x => x.fuso === 'America/Sao_Paulo'));
  assert.ok(result.rows.every(x => x.indicadoresCandidatos.every(y => y.situacao === 'em_analise')));
  const exposedIds = result.rows.flatMap(x => [
   x.id,
   ...x.indicadoresCandidatos.map(metric => metric.id),
   ...x.dimensoesCandidatas.map(dimension => dimension.id)
  ]);
  for (const forbidden of ['agent_name', 'dstchannel', 'src', 'dst', 'member']) {
   assert.ok(!exposedIds.includes(forbidden), `Sensitive identifier in catalog: ${forbidden}`);
  }
  assert.equal(dataRequests, 0, 'No RPC or table query allowed');
 });
 await check('dynamic query string cannot trigger SQL or arbitrary source selection', async () => {
  const response = await request('source-admin', endpoint + '?fonte=auth.users&sql=drop%20table%20x');
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).rows.map(x => x.id), ['listar_filas', 'relatorio_chamadas']);
  assert.equal(dataRequests, 0);
 });
 await check('state-changing methods are not accepted', async () => {
  assert.equal((await request('source-admin', endpoint, 'POST')).status, 405);
  assert.equal(dataRequests, 0);
 });
 assert.ok(authRequests > 0);
 console.log(`EDITOR_SOURCE_CATALOG_SMOKE_PASSED=${passed};source=synthetic;database_queries=0`);
} catch (error) {
 console.error(logs);
 throw error;
} finally {
 app.kill('SIGTERM');
 upstream.closeAllConnections();
 await new Promise(resolve => upstream.close(resolve));
 if (app.exitCode === null) {
  await Promise.race([new Promise(resolve => app.once('exit', resolve)), delay(3000)]);
  if (app.exitCode === null) app.kill('SIGKILL');
 }
}
