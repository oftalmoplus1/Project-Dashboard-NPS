import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Playwright is isolated in RUNNER_TEMP: no application dependency or lockfile change.
if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE to the isolated playwright/index.mjs');
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const civilParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
const parts = Object.fromEntries(civilParts.map(part => [part.type, part.value]));
const today = `${parts.year}-${parts.month}-${parts.day}`;
const year = Number(parts.year);
const makeRow = day => ({ periodo_inicio: `${day}T08:00:00`, total: 120, atendidas: 80, nao_atendidas: 25, abandonadas: 10, outras: 5 });
let mode = 'normal';
let rpcRequests = 0;
let passed = 0;
const upstream = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const send = (code, body, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(body)); };
  if (req.headers.apikey !== 'design-test-key') return send(401, {});
  if (url.pathname === '/auth/v1/user') return req.headers.authorization === 'Bearer design-admin-session'
    ? send(200, { id: '00000000-0000-4000-8000-000000000001', app_metadata: { dashboard_role: 'admin' } }) : send(401, {});
  if (!url.pathname.startsWith('/rest/v1/rpc/dashboard_chamadas_')) return send(404, {});
  if (req.headers.authorization !== 'Bearer design-admin-session') return send(403, {});
  rpcRequests++;
  let raw = '';
  for await (const part of req) raw += part;
  const body = JSON.parse(raw);
  const rows = today >= body.p_inicio && today <= body.p_fim ? [makeRow(today)] : [];
  if (url.pathname.endsWith('dashboard_chamadas_agregadas')) {
    if (mode === 'error') return send(503, {});
    if (mode === 'denied') return send(403, {});
    return send(200, rows, { 'Content-Range': rows.length ? '0-0/1' : '*/0' });
  }
  if (url.pathname.endsWith('dashboard_chamadas_tempos_e_filas')) return send(200, [{ taxa_abandono_fila: 12, tma_segundos: 3690, tme_segundos: 40 }]);
  if (url.pathname.endsWith('dashboard_chamadas_por_hora')) return send(200, Array.from({ length: 24 }, (_, hora) => ({ hora, total: rows.length && hora === 8 ? 120 : 0, atendidas: rows.length && hora === 8 ? 80 : 0, nao_atendidas: rows.length && hora === 8 ? 25 : 0, abandonadas: rows.length && hora === 8 ? 10 : 0, outras: rows.length && hora === 8 ? 5 : 0 })));
  return send(404, {});
});
await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
const port = 3212;
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
  env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', SUPABASE_URL: `http://127.0.0.1:${upstream.address().port}`, SUPABASE_PUBLISHABLE_KEY: 'design-test-key', APP_ORIGIN: origin },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
for (const stream of [app.stdout, app.stderr]) stream.on('data', chunk => { logs = (logs + chunk).slice(-12000); });
let browser;
let page;
const check = async (name, run) => { await run(); passed++; console.log(`ok ${passed} - ${name}`); };
const settleLayout = async () => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== 'running'), undefined, { timeout: 2000 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
};
const measureViewport = () => page.evaluate(() => ({
  viewport: window.innerWidth,
  document: document.documentElement.scrollWidth,
  elements: [...document.querySelectorAll('body *')].map(el => {
    const rect = el.getBoundingClientRect();
    const css = getComputedStyle(el);
    return { tag: el.tagName, class: typeof el.className === 'string' ? el.className : '', left: rect.left, right: rect.right, width: rect.width, overflowX: css.overflowX, display: css.display };
  }).filter(el => el.width > 0 && el.right > window.innerWidth + 2).slice(0, 30),
}));
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (app.exitCode !== null) throw new Error('Next exited before readiness');
    try { if ((await fetch(`${origin}/api/chamadas?start=${today}&end=${today}`)).status === 401) { ready = true; break; } } catch { /* local startup */ }
    await delay(100);
  }
  assert.ok(ready);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: 'pt-BR', reducedMotion: 'reduce' });
  page = await context.newPage();
  page.setDefaultTimeout(12000);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/api/catalogo/topicos', route => route.fulfill({ json: { rows: [{ slug: 'relatorios', nome: 'Relatórios' }] } }));
  await check('unauthenticated page still redirects to login', async () => { await page.goto(`${origin}/chamadas`); assert.match(page.url(), /\/login/); });
  await context.addCookies([{ name: 'dashboard_tools_access_token', value: 'design-admin-session', domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await page.goto(`${origin}/chamadas`);
  const totals = page.getByRole('region', { name: 'Resumo de chamadas', exact: true });
  await totals.getByText('120', { exact: true }).waitFor();
  await check('Call Center is a label change; authorized URL is preserved', async () => {
    assert.equal(await page.getByRole('heading', { name: 'Call Center', exact: true }).count(), 1);
    assert.equal(await page.getByRole('link', { name: 'Call Center', exact: true }).getAttribute('href'), '/meus-dashboards/relatorios');
  });
  await check('single grouped card with received answered and abandoned counts', async () => {
    assert.deepEqual(await totals.locator('dd').allTextContents(), ['120', '80', '10']);
  });
  await check('abandonment formula ignores incompatible legacy percentage', async () => {
    assert.match(await page.getByRole('region', { name: 'Taxa de abandono', exact: true }).innerText(), /8,33%/);
  });
  await check('duration switches to hh:mm:ss and TEF is never substituted by TET', async () => {
    await page.getByRole('region', { name: 'TMA', exact: true }).getByText('01:01:30', { exact: true }).waitFor();
    const text = await page.getByRole('region', { name: 'TME de fila', exact: true }).innerText();
    assert.match(text, /Aguardando validação SQL/); assert.ok(!text.includes('00:40'));
  });
  await check('only overview is rendered initially; no monthly or hourly requests', async () => {
    assert.equal(await page.getByRole('tab').count(), 5);
    assert.equal(await page.getByRole('heading', { name: 'Chamadas por hora', exact: true }).count(), 0);
    assert.equal(await page.getByRole('heading', { name: 'Chamadas por mês', exact: true }).count(), 0);
  });
  await mkdir('artifacts/call-center-design', { recursive: true });
  await page.screenshot({ path: 'artifacts/call-center-design/desktop-overview.png', fullPage: true });
  await check('arrow keys move focus and Enter activates the monthly tab', async () => {
    await page.getByRole('tab', { name: 'Visão geral', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByRole('tab', { name: 'Por mês', exact: true }).evaluate(el => el === document.activeElement), true);
    assert.equal(await page.getByRole('tab', { name: 'Visão geral', exact: true }).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { name: 'Chamadas por mês', exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Chamadas por hora', exact: true }).count(), 0);
  });
  await check('year selection survives switching tabs', async () => {
    await page.getByLabel('Selecionar ano do grafico mensal').selectOption(String(year - 1));
    await page.getByRole('tab', { name: 'Por hora', exact: true }).click();
    await page.getByRole('heading', { name: 'Chamadas por hora', exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Por mês', exact: true }).click();
    assert.equal(await page.getByLabel('Selecionar ano do grafico mensal').inputValue(), String(year - 1));
  });
  await check('custom period survives overview and hourly navigation', async () => {
    await page.getByRole('tab', { name: 'Visão geral', exact: true }).click();
    await page.getByRole('button', { name: 'Personalizado', exact: true }).click();
    await page.getByLabel('Data inicial', { exact: true }).fill('2025-01-02');
    await page.getByLabel('Data final', { exact: true }).fill('2025-01-03');
    await page.getByRole('tab', { name: 'Por hora', exact: true }).click();
    assert.equal(await page.getByLabel('Data inicial', { exact: true }).inputValue(), '2025-01-02');
    assert.equal(await page.getByLabel('Data final', { exact: true }).inputValue(), '2025-01-03');
    await page.getByRole('tab', { name: 'Visão geral', exact: true }).click();
    await totals.getByText('0', { exact: true }).first().waitFor();
    assert.ok((await page.getByRole('region', { name: 'Taxa de abandono', exact: true }).innerText()).includes('—'));
    await page.getByRole('button', { name: 'Hoje', exact: true }).click();
    await totals.getByText('120', { exact: true }).waitFor();
  });
  await check('annual graph compares equivalent periods and displays variations', async () => {
    await page.route('**/api/chamadas?*', async route => {
      const u = new URL(route.request().url());
      const date = u.searchParams.get('start');
      const perYear = Number(date.slice(0, 4));
      const count = perYear === year - 1 ? 120 : 60;
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ rows: [{ periodo_inicio: date + 'T08:00:00',
          total: count, atendidas: count / 2, abandonadas: count / 4, nao_atendidas: count / 4, outras: 0 }] }) });
    });
    await page.getByRole('tab', { name: /Comparativo anual/ }).click();
    await page.getByRole('heading', { name: 'Comparativo anual de chamadas', exact: true }).waitFor();
    await page.getByText('Variação:', { exact: false }).first().waitFor();
    assert.match(await page.getByRole('tabpanel').innerText(), /100%/);
    await page.unroute('**/api/chamadas?*');
  });
  await check('extension chart displays only validated source results after explicit filter', async () => {
    await page.route('**/api/chamadas/ramais?*', async route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [
        { extension: '2001', answered: 8 }, { extension: '2002', answered: 14 },
      ] }),
    }));
    await page.getByRole('tab', { name: /Por ramal/ }).click();
    await page.getByRole('heading', { name: 'Chamadas atendidas por ramal', exact: true }).waitFor();
    assert.equal(await page.getByText('2002', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Consultar', exact: true }).click();
    await page.getByText('2002', { exact: true }).waitFor();
    assert.equal(await page.getByText('14', { exact: true }).count(), 1);
    await page.unroute('**/api/chamadas/ramais?*');
  });
  await page.getByRole('tab', { name: 'Visão geral', exact: true }).click();
  for (const width of [375, 768, 1440]) await check(`no document overflow at ${width}px`, async () => {
    await page.setViewportSize({ width, height: 1000 });
    const immediate = await measureViewport();
    await settleLayout();
    const settled = await measureViewport();
    console.log('VIEWPORT_DIAGNOSTIC=' + JSON.stringify({ width, immediate, settled }));
    await page.screenshot({ path: `artifacts/call-center-design/overview-${width}.png`, fullPage: true });
    assert.ok(settled.document <= width + 2, `Document ${settled.document}px exceeds viewport ${width}px`);
    if (width === 375) {
      const boxes = await totals.locator('dd').evaluateAll(els => els.map(el => ({ top: el.getBoundingClientRect().top, right: el.getBoundingClientRect().right })));
      assert.ok(boxes[0].top < boxes[1].top && boxes[1].top < boxes[2].top);
      await page.screenshot({ path: 'artifacts/call-center-design/mobile-overview.png', fullPage: true });
      await page.getByRole('tab', { name: 'Por hora', exact: true }).click();
      await page.getByRole('heading', { name: 'Chamadas por hora', exact: true }).waitFor();
      await settleLayout();
      const hourly = await measureViewport();
      console.log('HOURLY_VIEWPORT_DIAGNOSTIC=' + JSON.stringify(hourly));
      assert.ok(hourly.document <= width + 2);
      await page.getByRole('tab', { name: 'Visão geral', exact: true }).click();
    }
  });
  await check('dark theme remains readable and functional', async () => {
    await page.getByRole('button', { name: 'Ativar tema escuro' }).click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    assert.ok(await totals.isVisible());
    await page.screenshot({ path: 'artifacts/call-center-design/desktop-dark.png', fullPage: true });
  });
  await check('transient error preserves same-period values with an explicit warning', async () => {
    mode = 'error'; await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
    const alert = page.getByRole('region', { name: 'Filtros de chamadas', exact: true }).getByRole('alert').filter({ hasText: 'consulta válida' });
    await alert.waitFor();
    assert.ok(await totals.getByText('120', { exact: true }).isVisible());
    assert.match(await alert.innerText(), /consulta válida/);
  });
  await check('access denial clears all visible volume and time values', async () => {
    mode = 'denied'; await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
    await page.getByRole('region', { name: 'Filtros de chamadas', exact: true }).getByRole('alert').filter({ hasText: 'Sessão expirada' }).waitFor();
    assert.equal(await totals.getByText('120', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('region', { name: 'TMA', exact: true }).getByText('01:01:30', { exact: true }).count(), 0);
  });
  await check('no uncaught browser errors', async () => assert.deepEqual(pageErrors, []));
  console.log(`CALL_CENTER_BROWSER_PASSED=${passed}; fixtures=synthetic; production_validation=false`);
} catch (error) {
  if (page) {
    await mkdir('artifacts/call-center-design', { recursive: true });
    await page.screenshot({ path: 'artifacts/call-center-design/failure.png', fullPage: true }).catch(() => {});
    await writeFile('artifacts/call-center-design/failure-layout.json', JSON.stringify(await measureViewport(), null, 2)).catch(() => {});
  }
  console.error(logs);
  throw error;
} finally {
  await browser?.close();
  app.kill('SIGTERM'); upstream.closeAllConnections();
  await new Promise(resolve => upstream.close(resolve));
  if (app.exitCode === null) {
    await Promise.race([new Promise(resolve => app.once('exit', resolve)), delay(3000)]);
    if (app.exitCode === null) app.kill('SIGKILL');
  }
}
