import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const uuid = '00000000-0000-4000-8000-000000000099';
const publicOrigin = 'http://dashboards.example.test';
const records = [];
let writes = 0;
let mode = 'normal';
let passed = 0;

const upstream = createServer(async (req, res) => {
 const url = new URL(req.url, 'http://127.0.0.1');
 const send = (status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
 };
 if (req.headers.apikey !== 'drafts-test-key') return send(401, {});
 if (url.pathname === '/auth/v1/user') {
  const role = req.headers.authorization === 'Bearer drafts-admin-token' ? 'admin'
   : req.headers.authorization === 'Bearer drafts-manager-token' ? 'manager' : null;
  return role ? send(200, {
   id: '00000000-0000-4000-8000-000000000001',
   app_metadata: { dashboard_role: role }
  }) : send(401, {});
 }
 if (req.headers.authorization !== 'Bearer drafts-admin-token') return send(403, { code: '42501' });
 if (req.method !== 'POST') return send(405, {});
 let raw = '';
 for await (const chunk of req) raw += chunk;
 const args = JSON.parse(raw || '{}');

 if (url.pathname.endsWith('/dashboard_catalogo_listar_personalizados')) {
  if (mode === 'missing') return send(404, { code: 'PGRST202' });
  if (mode === 'bad-list') return send(200, { invalid: true });
  return send(200, records);
 }
 if (url.pathname.endsWith('/dashboard_catalogo_criar_personalizado')) {
  if (mode === 'missing') return send(404, { code: 'PGRST202' });
  if (mode === 'missing-topic') return send(404, { code: 'P0002' });
  writes++;
  assert.equal(args.p_topico_slug, 'relatorios');
  assert.equal(args.p_nome, 'Indicadores Operacionais');
  assert.equal(args.p_descricao, 'Indicadores consolidados');
  records.push({
   id: uuid,
   nome: args.p_nome,
   descricao: args.p_descricao,
   estado: 'rascunho',
   topico_slug: args.p_topico_slug,
   topico_nome: 'Relatórios',
   criado_em: '2026-11-24T12:00:00+00:00'
  });
  if (mode === 'bad-creation') return send(200, { id: uuid });
  return send(200, uuid);
 }
 return send(404, { code: 'PGRST202' });
});
await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));

const port = 3218;
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, [
 'node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)
], {
 env: {
  ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
  SUPABASE_URL: `http://127.0.0.1:${upstream.address().port}`,
  SUPABASE_PUBLISHABLE_KEY: 'drafts-test-key', APP_ORIGIN: publicOrigin
 },
 stdio: ['ignore', 'pipe', 'pipe']
});
let logs = '';
for (const stream of [app.stdout, app.stderr]) {
 stream.on('data', chunk => { logs = (logs + chunk).slice(-12000); });
}
const endpoint = '/api/catalogo/dashboards/personalizados';
const valid = { nome: 'Indicadores Operacionais', descricao: 'Indicadores consolidados', topico_slug: 'relatorios' };
async function request(token, method = 'GET', body, headers = {}) {
 return fetch(origin + endpoint, {
  method,
  headers: {
   ...(token ? { Cookie: `dashboard_tools_access_token=${token}` } : {}),
   ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
   ...headers
  },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  signal: AbortSignal.timeout(12000)
 });
}
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
 assert.ok(ready);

 await check('anonymous and manager cannot list/create drafts', async () => {
  assert.equal((await request()).status, 401);
  assert.equal((await request(undefined, 'POST', valid, { Origin: publicOrigin })).status, 401);
  assert.equal((await request('drafts-manager-token')).status, 403);
  assert.equal((await request('drafts-manager-token', 'POST', valid, { Origin: publicOrigin })).status, 403);
  assert.equal(writes, 0);
 });
 await check('admin list is empty before first draft and cache is private', async () => {
  const response = await request('drafts-admin-token');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual((await response.json()).rows, []);
 });
 await check('invalid origins cannot mutate', async () => {
  for (const extra of [
   { Origin: 'https://evil.example' },
   { Origin: publicOrigin, 'Sec-Fetch-Site': 'cross-site' },
   { Origin: origin, 'X-Forwarded-Host': 'dashboards.example.test' }
  ]) assert.equal((await request('drafts-admin-token', 'POST', valid, extra)).status, 403);
  assert.equal(writes, 0);
 });
 await check('bad JSON shapes are rejected before the RPC', async () => {
  for (const body of [
   { ...valid, nome: ' ' },
   { ...valid, nome: 'x'.repeat(121) },
   { ...valid, topico_slug: 'RELATORIOS' },
   { ...valid, descricao: 'x'.repeat(501) },
   { ...valid, nome: { name: 'wrong' } },
   { ...valid, extra: 'unexpected' },
   null, [], {}
  ]) {
   assert.equal((await request('drafts-admin-token', 'POST', body, { Origin: publicOrigin })).status, 400);
  }
  assert.equal(writes, 0);
 });
 await check('admin creates draft with transaction RPC and no permissions', async () => {
  const response = await request('drafts-admin-token', 'POST', valid, { Origin: publicOrigin });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await response.json(), { id: uuid, estado: 'rascunho' });
  assert.equal(writes, 1);
  const list = await request('drafts-admin-token');
  assert.equal(list.status, 200);
  const result = await list.json();
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].estado, 'rascunho');
  assert.equal(result.rows[0].topico_slug, 'relatorios');
 });
 await check('missing topic is 404 without saving', async () => {
  mode = 'missing-topic';
  assert.equal((await request('drafts-admin-token', 'POST', valid, { Origin: publicOrigin })).status, 404);
  assert.equal(writes, 1);
  mode = 'normal';
 });
 await check('absent migration reports 503 (no false success)', async () => {
  mode = 'missing';
  assert.equal((await request('drafts-admin-token')).status, 503);
  assert.equal((await request('drafts-admin-token', 'POST', valid, { Origin: publicOrigin })).status, 503);
  assert.equal(writes, 1);
  mode = 'normal';
 });
 await check('unexpected RPC response fails closed', async () => {
  mode = 'bad-list';
  assert.equal((await request('drafts-admin-token')).status, 502);
  mode = 'bad-creation';
  assert.equal((await request('drafts-admin-token', 'POST', valid, { Origin: publicOrigin })).status, 502);
  mode = 'normal';
 });
 console.log(`DASHBOARD_DRAFTS_SMOKE_PASSED=${passed};source=synthetic;database_migration_verified=false`);
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
