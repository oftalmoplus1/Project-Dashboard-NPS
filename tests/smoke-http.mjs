import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

// Synthetic services only. No real credentials, users or call records.
const fixtures = [
  { periodo_inicio: '2026-01-02T00:00:00', total: 120, atendidas: 80, nao_atendidas: 20, abandonadas: 15, outras: 5 },
  { periodo_inicio: '2026-01-03T00:00:00', total: 30, atendidas: 20, nao_atendidas: 5, abandonadas: 3, outras: 2 },
];
let mode = 'normal';
let rpcRequests = 0;
let passed = 0;
const upstream = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const send = (status, body, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    res.end(JSON.stringify(body));
  };
  try {
    if (req.headers.apikey !== 'test-only-key') return send(401, { message: 'invalid test key' });
    if (url.pathname === '/auth/v1/user') {
      const token = req.headers.authorization;
      if (token === 'Bearer expired-test-session') return send(401, { message: 'expired' });
      const role = token === 'Bearer admin-test-session' ? 'admin' : token === 'Bearer manager-test-session' ? 'manager' : null;
      return send(200, { id: '00000000-0000-4000-8000-000000000001', app_metadata: { dashboard_role: role }, user_metadata: { dashboard_role: 'admin' } });
    }
    rpcRequests++;
    assert.equal(req.method, 'POST');
    assert.equal(req.headers.authorization, 'Bearer admin-test-session');
    let body = '';
    for await (const part of req) body += part;
    assert.deepEqual(JSON.parse(body), { p_inicio: '2026-01-02', p_fim: '2026-01-03' });
    if (mode === 'denied') return send(403, { message: 'forbidden' });
    if (url.pathname.endsWith('/dashboard_chamadas_agregadas')) {
      assert.equal(url.searchParams.get('order'), 'periodo_inicio.asc');
      assert.equal(req.headers.prefer, 'count=exact');
      const offset = Number(url.searchParams.get('offset'));
      if (mode === 'empty') return send(200, [], { 'Content-Range': '*/0' });
      // Emulate a server cap lower than the requested page size.
      return send(206, fixtures.slice(offset, offset + 1), mode === 'missing-count' ? {} : { 'Content-Range': `${offset}-${offset}/2` });
    }
    if (url.pathname.endsWith('/dashboard_chamadas_por_hora')) return send(200, Array.from({ length: 24 }, (_, hora) => ({ hora, total: hora === 8 ? 120 : 0, atendidas: hora === 8 ? 80 : 0, nao_atendidas: hora === 8 ? 20 : 0, abandonadas: hora === 8 ? 15 : 0, outras: hora === 8 ? 5 : 0 })));
    if (url.pathname.endsWith('/dashboard_chamadas_tempos_e_filas')) return send(200, [{ taxa_abandono_fila: 12, tma_segundos: 90, tme_segundos: 40 }]);
    if (url.pathname.endsWith('/dashboard_chamadas_tempos_por_dia')) return send(200, [{ dia: '2026-01-02', tma_segundos: 90, tme_segundos: 40 }, { dia: '2026-01-03', tma_segundos: null, tme_segundos: null }]);
    return send(404, { message: 'Unexpected test endpoint' });
  } catch (error) {
    console.error('Synthetic upstream assertion:', error.message);
    return send(500, { message: 'test assertion failed' });
  }
});
await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
const port = 3210;
const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
  env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', SUPABASE_URL: `http://127.0.0.1:${upstream.address().port}`, SUPABASE_PUBLISHABLE_KEY: 'test-only-key', APP_ORIGIN: `http://127.0.0.1:${port}` },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
for (const stream of [app.stdout, app.stderr]) stream.on('data', part => { logs = (logs + part).slice(-10000); });
const query = '?start=2026-01-02&end=2026-01-03';
const request = (path, token) => fetch(`http://127.0.0.1:${port}${path}`, { headers: token ? { Cookie: `dashboard_tools_access_token=${token}` } : {}, signal: AbortSignal.timeout(10000) });
const check = async (title, run) => { await run(); passed++; console.log(`ok ${passed} - ${title}`); };
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (app.exitCode !== null) throw new Error('Application exited before readiness');
    try { if ((await request('/api/chamadas' + query)).status === 401) { ready = true; break; } } catch { /* Wait for local test server. */ }
    await delay(100);
  }
  assert.ok(ready, 'Application readiness');
  for (const route of ['/api/chamadas', '/api/chamadas/por-hora', '/api/chamadas/indicadores', '/api/chamadas/tempos-por-dia', '/api/chamadas/ramais']) {
    await check(`session required: ${route}`, async () => assert.equal((await request(route + query)).status, 401));
  }
  for (const token of ['manager-test-session', 'expired-test-session', 'unprivileged-test-session']) {
    await check(`deny unauthorized profile: ${token}`, async () => {
      const before = rpcRequests;
      assert.equal((await request('/api/chamadas' + query, token)).status, 403);
      assert.equal(rpcRequests, before);
    });
  }
  await check('reject invalid date before RPC', async () => assert.equal((await request('/api/chamadas?start=2026-02-30&end=2026-03-01', 'admin-test-session')).status, 400));
  await check('read every page under caller session', async () => {
    const response = await request('/api/chamadas' + query, 'admin-test-session');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual((await response.json()).rows, fixtures);
  });
  await check('reject missing count instead of partial data', async () => {
    mode = 'missing-count';
    const response = await request('/api/chamadas' + query, 'admin-test-session');
    assert.equal(response.status, 502);
    assert.equal('rows' in await response.json(), false);
  });
  await check('preserve upstream access denial', async () => { mode = 'denied'; assert.equal((await request('/api/chamadas' + query, 'admin-test-session')).status, 403); });
  await check('accept proven empty result', async () => { mode = 'empty'; const response = await request('/api/chamadas' + query, 'admin-test-session'); assert.equal(response.status, 200); assert.deepEqual((await response.json()).rows, []); });
  mode = 'normal';
  await check('hourly route returns complete 24-hour data', async () => { const response = await request('/api/chamadas/por-hora' + query, 'admin-test-session'); assert.equal(response.status, 200); assert.equal((await response.json()).rows.length, 24); });
  await check('legacy time route remains compatible but is explicitly not TEF', async () => {
    const response = await request('/api/chamadas/indicadores' + query, 'admin-test-session');
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.metrics.tma_segundos, 90);
    assert.equal(data.tme_semantics, 'tet_legacy');
  });
  await check('daily time route labels legacy wait explicitly', async () => {
    const response = await request('/api/chamadas/tempos-por-dia' + query, 'admin-test-session');
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.tme_semantics, 'tet_legacy');
    assert.equal(data.rows.length, 2);
  });
  await check('extension endpoint requires admin and never uses service role', async () => {
    for (const role of ['manager-test-session', 'expired-test-session']) {
      assert.equal((await request('/api/chamadas/ramais' + query, role)).status, 403);
    }
    const response = await request('/api/chamadas/ramais' + query, 'admin-test-session');
    assert.equal(response.status, 503); // integration intentionally absent in synthetic CI
  });
  console.log(`HTTP_SMOKE_PASSED=${passed}; source=synthetic; production_validation=false`);
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
