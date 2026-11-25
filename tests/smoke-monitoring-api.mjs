import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const id = '00000000-0000-4000-8000-000000000031';
const published = {
 dashboard_id: id, nome: 'Monitoramento sintético',
 descricao: 'Somente testes', topico_nome: 'Call Center',
 versao: 2, publicado_em: '2026-11-25T10:00:00+00:00',
 blocos: [{
  id: 'texto', kind: 'text', title: 'Aviso', x: 0, y: 0, w: 4, h: 2,
  source: null, metric: '', chartOrientation: 'vertical', text: 'Sem métricas simuladas',
 }]
};
let granted = false;
let mode = 'normal';
let dataCalls = 0;
let passed = 0;
const upstream = createServer(async (req, res) => {
 const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
 const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
 if (req.headers.apikey !== 'monitor-test-only') return send(401, {});
 const token = req.headers.authorization;
 if (path === '/auth/v1/user') {
  const role = token === 'Bearer monitor-admin' ? 'admin' :
   token === 'Bearer monitor-manager' ? 'manager' : null;
  return role ? send(200, {
   id: role === 'admin' ? '00000000-0000-4000-8000-000000000001' : '00000000-0000-4000-8000-000000000002',
   app_metadata: { dashboard_role: role }, user_metadata: { dashboard_role: 'admin' },
  }) : send(401, {});
 }
 dataCalls++;
 if (!path.startsWith('/rest/v1/rpc/dashboard_monitoramento_') || req.method !== 'POST') {
  return send(500, { error: 'Unexpected data access' });
 }
 let raw = '';
 for await (const chunk of req) raw += chunk;
 const params = JSON.parse(raw || '{}');
 const allowed = token === 'Bearer monitor-admin' || (token === 'Bearer monitor-manager' && granted);
 if (mode === 'missing') return send(404, { code: 'PGRST202' });
 if (path.endsWith('/dashboard_monitoramento_listar')) {
  assert.deepEqual(params, {});
  if (mode === 'malformed') return send(200, [{ invalid: true }]);
  return send(200, allowed ? [{ ...published, blocos: undefined }] : []);
 }
 if (path.endsWith('/dashboard_monitoramento_obter')) {
  assert.equal(params.p_dashboard_id, id);
  if (!allowed) return send(404, { code: 'P0002' });
  if (mode === 'malformed') return send(200, [{ ...published, blocos: [] }]);
  return send(200, [published]);
 }
 return send(404, { code: 'PGRST202' });
});
await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));

const port = 3225;
const origin = 'http://127.0.0.1:' + port;
const app = spawn(process.execPath, [
 'node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)
], {
 env: {
  ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
  SUPABASE_URL: 'http://127.0.0.1:' + upstream.address().port,
  SUPABASE_PUBLISHABLE_KEY: 'monitor-test-only', APP_ORIGIN: origin,
 }, stdio: ['ignore', 'pipe', 'pipe']
});
let logs = '';
for (const stream of [app.stdout, app.stderr]) {
 stream.on('data', chunk => { logs = (logs + chunk).slice(-14000); });
}
const request = (path, token, method = 'GET') => fetch(origin + path, {
 method, redirect: 'manual',
 headers: token ? { Cookie: 'dashboard_tools_access_token=' + token } : {},
 signal: AbortSignal.timeout(12000),
});
async function check(name, fn) { await fn(); passed++; console.log('ok ' + passed + ' - ' + name); }

try {
 let ready = false;
 for (let attempt = 0; attempt < 100; attempt++) {
  if (app.exitCode !== null) throw new Error('Application exited before readiness');
  try { if ((await request('/api/monitoramento')).status === 401) { ready = true; break; } } catch {}
  await delay(100);
 }
 assert.ok(ready);

 await check('session required and direct URLs denied', async () => {
  assert.equal((await request('/api/monitoramento')).status, 401);
  assert.equal((await request('/api/monitoramento/' + id)).status, 401);
  assert.equal((await request('/monitoramento')).status, 307);
  assert.equal((await request('/monitoramento/' + id)).status, 307);
  assert.equal(dataCalls, 0);
 });
 await check('manager with forged user_metadata is limited by grant', async () => {
  const list = await request('/api/monitoramento', 'monitor-manager');
  assert.equal(list.status, 200);
  assert.deepEqual((await list.json()).rows, []);
  const direct = await request('/api/monitoramento/' + id, 'monitor-manager');
  assert.equal(direct.status, 404);
  assert.equal((await request('/monitoramento', 'monitor-manager')).status, 200);
  assert.equal((await request('/monitoramento/' + id, 'monitor-manager')).status, 404);
 });
 await check('admin can read published snapshot and nothing else', async () => {
  const list = await request('/api/monitoramento', 'monitor-admin');
  assert.equal(list.status, 200);
  assert.equal(list.headers.get('cache-control'), 'private, no-store');
  assert.equal((await list.json()).rows[0].dashboard_id, id);
  const screen = await request('/api/monitoramento/' + id, 'monitor-admin');
  assert.equal(screen.status, 200);
  const result = await screen.json();
  assert.deepEqual(result.blocos, published.blocos);
  assert.equal(result.versao, 2);
  assert.equal('sql' in result, false);
  assert.equal((await request('/api/monitoramento/invalid', 'monitor-admin')).status, 400);
 });
 await check('grant takes effect for manager without publish', async () => {
  granted = true;
  assert.equal((await (await request('/api/monitoramento', 'monitor-manager')).json()).rows.length, 1);
  assert.equal((await request('/api/monitoramento/' + id, 'monitor-manager')).status, 200);
  assert.equal((await request('/monitoramento/' + id, 'monitor-manager')).status, 200);
 });
 await check('revoke blocks direct access on next server check', async () => {
  granted = false;
  assert.equal((await (await request('/api/monitoramento', 'monitor-manager')).json()).rows.length, 0);
  assert.equal((await request('/api/monitoramento/' + id, 'monitor-manager')).status, 404);
 });
 await check('uninstalled migrations fail closed instead of showing fake cards', async () => {
  mode = 'missing';
  assert.equal((await request('/api/monitoramento', 'monitor-admin')).status, 503);
  assert.equal((await request('/api/monitoramento/' + id, 'monitor-admin')).status, 503);
  mode = 'normal';
 });
 await check('unexpected RPC data never reaches screen', async () => {
  mode = 'malformed';
  assert.equal((await request('/api/monitoramento', 'monitor-admin')).status, 502);
  assert.equal((await request('/api/monitoramento/' + id, 'monitor-admin')).status, 502);
  mode = 'normal';
 });
 await check('no write methods are exposed', async () => {
  const before = dataCalls;
  assert.equal((await request('/api/monitoramento', 'monitor-admin', 'POST')).status, 405);
  assert.equal((await request('/api/monitoramento/' + id, 'monitor-admin', 'PUT')).status, 405);
  assert.equal(dataCalls, before);
 });
 console.log('MONITORAMENTO_FASE4A_HTTP_PASSED=' + passed);
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
