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
  if (url.pathname === '/rest/v1/rpc/dashboard_ligsim_filas_ativas') {
    if (req.method !== 'POST' || req.headers.authorization !== 'Bearer design-admin-session') return send(403, {});
    if (mode === 'error') return send(503, {});
    if (mode === 'denied') return send(403, {});
    const timestamp = new Date().toISOString();
    return send(200, {
      snapshotKind: 'latest_successful_batch', sourceUpdatedAt: timestamp,
      rows: [{ id: 1, name: 'FILA-TESTE', received: 120, answered: 80,
        abandon_less_30s: 2, abandon_more_30s: 8,
        waiting_calls: 4, tma: '00:03:25', tme: '00:01:21', updated_at: timestamp }]
    });
  }
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
  const menu = page.getByRole('navigation', { name: 'Dashboards do Call Center' });
  const nav = label => menu.getByRole('link', { name: label, exact: true });
  const totals = page.getByRole('region', { name: 'Resumo de chamadas', exact: true });
  await totals.getByText('120', { exact: true }).waitFor();
  await check('dashboard heading stays hidden while Call Center navigation keeps its route', async () => {
    // The dashboard heading was intentionally removed; sidebar navigation remains.
    assert.equal(await page.getByRole('heading', { name: 'Call Center', exact: true }).count(), 0);
    assert.equal(await page.getByRole('link', { name: 'Call Center', exact: true }).getAttribute('href'), '/meus-dashboards/relatorios');
  });
  await check('collapsed sidebar restores icons and routes including inactive admin group', async () => {
    const sidebar = page.getByRole('complementary', { name: 'Navegação principal' });
    const collapse = sidebar.getByRole('button', { name: 'Recolher menu lateral' });
    await collapse.click();
    const expand = sidebar.getByRole('button', { name: 'Expandir menu lateral' });
    await expand.waitFor({ state: 'visible' });
    assert.equal(await sidebar.locator('.brand-mark img').count(), 1);
    assert.equal(await sidebar.locator('.side-nav').isVisible(), true,
      'navigation icons must remain visible in collapsed mode');
    assert.equal(await sidebar.locator('.sidebar-bottom').isVisible(), true,
      'account and status icons must return as before');
    const links = sidebar.locator('.side-nav a.nav-item');
    await page.waitForFunction(() => {
      const sidebar = document.querySelector('aside.sidebar');
      return sidebar && [...sidebar.querySelectorAll('.side-nav a.nav-item')].some(el => el.getAttribute('href') === '/meus-dashboards/relatorios');
    });
    const checked = await links.evaluateAll(elements => elements.map(link => {
      const style = getComputedStyle(link);
      return { href: link.getAttribute('href'), title: link.getAttribute('title'),
        svg: !!link.querySelector('svg'), visible: style.display !== 'none',
        inert: !!link.closest('[inert]') };
    }));
    assert.ok(checked.length >= 3, 'show topic, admin and configuration icons');
    assert.ok(checked.every(item => item.title && item.svg && item.visible && !item.inert),
      'every icon has title and remains interactive rather than inert');
    const adminIcon = sidebar.locator('a.nav-item[href="/usuarios"]');
    await adminIcon.click();
    await page.waitForURL('**/usuarios');
    assert.equal(new URL(page.url()).pathname, '/usuarios', 'admin icon must navigate to its route');
    const settingsIcon = sidebar.locator('a.settings-direct-link[href="/configuracoes"]');
    await settingsIcon.click();
    await page.waitForURL('**/configuracoes');
    assert.equal(new URL(page.url()).pathname, '/configuracoes', 'settings icon must navigate');
    await expand.click();
    await sidebar.getByRole('button', { name: 'Recolher menu lateral' }).waitFor({ state: 'visible' });
    await page.goto(`${origin}/chamadas`);
    await totals.getByText('120', { exact: true }).waitFor();
  });
  await check('administration navigation hides retired entries and places demo overview outside groups', async () => {
    const sidebar = page.getByRole('complementary', { name: 'Navegação principal' });
    const categories = sidebar.getByRole('navigation', { name: 'Categorias' });
    const demo = categories.getByRole('link', { name: 'Visão geral demonstrativa' });
    const settings = categories.getByRole('link', { name: 'Configurações' });
    assert.equal(await categories.getByRole('link', { name: 'Operações administrativas' }).count(), 0);
    assert.equal(await categories.getByRole('link', { name: 'Histórico e auditoria' }).count(), 0);
    assert.equal(await categories.getByRole('link', { name: 'Monitoramento', exact: true }).count(), 0);
    assert.equal(await demo.count(), 1);
    assert.equal(await demo.getAttribute('href'), '/inicio');
    assert.equal(await settings.getAttribute('href'), '/configuracoes');
    assert.equal(await demo.evaluate(element => element.closest('.accordion-panel') === null), true,
      'demo overview should be a direct link outside accordion categories');
    await sidebar.getByRole('button', { name: 'Recolher menu lateral' }).click();
    assert.equal(await demo.isVisible(), true, 'demo icon remains visible when sidebar is collapsed');
    assert.equal(await demo.locator('svg').count(), 1, 'demo retains its icon');
    assert.equal((await page.goto(`${origin}/monitoramento`)).status(), 404,
      'retired monitoring URL must not be accessible directly');
    await page.goto(`${origin}/chamadas`);
    await demo.click();
    await page.waitForURL('**/inicio');
    assert.equal(new URL(page.url()).pathname, '/inicio');
    await sidebar.getByRole('button', { name: 'Expandir menu lateral' }).click();
    await page.goto(`${origin}/chamadas`);
    await totals.getByText('120', { exact: true }).waitFor();
  });
  await check('requested informational footer descriptions are absent', async () => {
    assert.equal(await page.getByText(/Consulta do resumo:/).count(), 0);
    assert.equal(await page.getByText(/A consulta da tela não comprova a sincronização da origem/).count(), 0);
  });
  await check('single grouped card with received answered and abandoned counts', async () => {
    assert.deepEqual(await totals.locator('dd').allTextContents(), ['120', '80', '10']);
  });
  await check('overview metric cards appear as TME, TMA and abandonment rate', async () => {
    const cards = page.locator('section[aria-label="TME de fila"], section[aria-label="TMA"], section[aria-label="Taxa de abandono"]');
    assert.deepEqual(await cards.evaluateAll(elements => elements.map(el => el.getAttribute('aria-label'))),
      ['TME de fila', 'TMA', 'Taxa de abandono']);
  });
  await check('shared TV presentation enters fullscreen without losing filters, theme or charts', async () => {
    const tv=page.getByRole('button',{name:'Iniciar modo de apresentação'});
    assert.equal(await tv.count(),1,'presentation action is available on Call Center dashboards');
    const selected=page.getByRole('button',{name:'Hoje',exact:true});
    assert.equal(await selected.getAttribute('aria-pressed'),'true');
    const originalTheme=await page.locator('html').getAttribute('data-theme');
    await tv.click();
    await page.waitForFunction(()=>document.fullscreenElement?.classList.contains('presentation-surface'));
    assert.equal(await page.locator('html').getAttribute('data-theme'),originalTheme,'theme must be preserved');
    assert.equal(await page.getByRole('navigation',{name:'Dashboards do Call Center'}).isVisible(),false);
    assert.equal(await page.getByRole('region',{name:'Filtros de chamadas'}).isVisible(),false);
    assert.equal(await page.getByRole('button',{name:'Atualizar',exact:true}).isVisible(),false);
    assert.equal(await page.getByRole('region',{name:'Resumo de chamadas'}).isVisible(),true);
    const scroll=await page.locator('main:fullscreen').evaluate(el=>({y:getComputedStyle(el).overflowY,x:getComputedStyle(el).overflowX}));
    assert.equal(scroll.y,'auto','presentation scroll must remain manual');
    assert.equal(scroll.x,'auto','horizontal scrolling remains available');
    await page.mouse.move(250,250);
    const exit=page.getByRole('button',{name:'Sair da apresentação'});
    await exit.waitFor({state:'visible'});
    await exit.click();
    await page.waitForFunction(()=>document.fullscreenElement===null);
    assert.equal(await page.getByRole('region',{name:'Filtros de chamadas'}).isVisible(),true);
    assert.equal(await selected.getAttribute('aria-pressed'),'true','selected period persists after exit');
    assert.equal(await page.getByRole('button',{name:'Atualizar',exact:true}).isVisible(),true);
    assert.equal(await page.locator('html').getAttribute('data-theme'),originalTheme);
  });
  await check('abandonment formula ignores incompatible legacy percentage', async () => {
    assert.match(await page.getByRole('region', { name: 'Taxa de abandono', exact: true }).innerText(), /8,33%/);
  });
  await check('simplified card descriptions and no complementary indicators block', async () => {
    const labels = [
      ['Taxa de abandono', 'Saiu da fila sem ser atendida'],
      ['TMA', 'Tempo médio de atendimento'],
      ['TME de fila', 'Tempo médio de espera'],
    ];
    for (const [region, description] of labels) {
      const card = page.getByRole('region', { name: region, exact: true });
      assert.equal(await card.locator('p').last().innerText(), description);
    }
    assert.equal(await page.getByText('Indicadores complementares', { exact: true }).count(), 0);
    assert.equal(await page.locator('details').count(), 0);
  });
  await check('Hoje uses the two API-provided queue averages, not CDR', async () => {
    const tma = page.getByRole('region', { name: 'TMA', exact: true });
    const tme = page.getByRole('region', { name: 'TME de fila', exact: true });
    await tma.getByText('03:25', { exact: true }).waitFor();
    await tme.getByText('01:21', { exact: true }).waitFor();
    assert.match(await tma.innerText(), /Tempo médio de atendimento/);
    assert.match(await tme.innerText(), /Tempo médio de espera/);
  });
  await check('one upper menu shows five dashboards after retiring ramal and loads only overview initially', async () => {
    assert.equal(await menu.getByRole('link').count(), 5);
    assert.equal(await nav('Visão geral').getAttribute('aria-current'), 'page');
    assert.equal(await page.getByRole('heading', { name: 'Chamadas por hora', exact: true }).count(), 0);
    assert.equal(await page.getByRole('heading', { name: 'Chamadas por mês', exact: true }).count(), 0);
  });
  await check('tabs match reference with rounded active button and teal underline', async () => {
    const result = await nav('Visão geral').evaluate(element => {
      const selected = getComputedStyle(element);
      const menu = element.closest('nav');
      const menuStyle = menu ? getComputedStyle(menu) : null;
      return {
        radius: parseFloat(selected.borderTopLeftRadius),
        insetShadow: selected.boxShadow,
        background: selected.backgroundColor,
        borderColor: selected.borderTopColor,
        menuBorder: menuStyle?.borderBottomWidth,
        noWrap: menuStyle?.flexWrap,
        count: menu?.querySelectorAll('a').length,
      };
    });
    assert.ok(result.radius >= 8 && result.radius <= 10, 'active tab has rounded corners like the reference');
    assert.match(result.insetShadow, /inset/, 'active tab has the bottom teal accent');
    assert.equal(result.noWrap, 'nowrap', 'dashboard links remain in one horizontally scrollable row');
    assert.equal(result.menuBorder, '1px', 'single subtle separator remains below the tabs');
    assert.equal(result.count, 5, 'keep the five configured Call Center dashboards');
  });
  await check('Hoje shows validated queue snapshot and protects detailed members', async () => {
    await page.getByRole('heading', { name: 'Filas — último estado disponível' }).waitFor();
    await page.getByRole('rowheader', { name: 'FILA-TESTE' }).waitFor();
    assert.equal(await nav('Por ramal').count(), 0);
    assert.equal(await page.getByRole('region', { name: 'Evolução das chamadas recebidas' }).count(), 0);
    assert.match(await totals.innerText(), /listar_filas/);
    assert.equal(await page.getByText('member', { exact: true }).count(), 0);
  });
  await mkdir('artifacts/call-center-design', { recursive: true });
  await page.screenshot({ path: 'artifacts/call-center-design/desktop-overview.png', fullPage: true });
  // Retain the e4ee559 visual checks on CDR history; the queue snapshot itself
  // has no hourly breakdown, so its "Hoje" panel must not invent evolution bars.
  await page.getByRole('button', { name: 'Personalizado', exact: true }).click();
  await page.getByLabel('Data inicial', { exact: true }).fill(today);
  await page.getByLabel('Data final', { exact: true }).fill(today);
  await page.getByRole('region', { name: 'Evolução das chamadas recebidas' }).waitFor();
  await check('custom historical filter keeps the existing CDR time calculations', async () => {
    await page.getByRole('region', { name: 'TMA', exact: true }).getByText('01:01:30', { exact: true }).waitFor();
    const tme = await page.getByRole('region', { name: 'TME de fila', exact: true }).innerText();
    assert.match(tme, /Aguardando validação SQL/);
  });
  await check('call evolution columns use rounded visible corners', async () => {
    const columns = page.getByRole('region', { name: 'Evolução das chamadas recebidas' }).locator('[class*="barSegments"]');
    await columns.first().waitFor({ state: 'attached' });
    const visible = await columns.evaluateAll(elements => elements.some(el => el.getBoundingClientRect().height > 0));
    assert.ok(visible, 'at least one column should contain observed calls');
    const style = await columns.first().evaluate(element => {
      const computed = getComputedStyle(element);
      return { radius: parseFloat(computed.borderTopLeftRadius), clipping: computed.overflow };
    });
    assert.ok(style.radius >= 4 && style.radius <= 5, 'evolution columns should have a subtle 4px corner radius');
    assert.equal(style.clipping, 'hidden', 'all stacked segments must be clipped to the rounded outline');
  });
  await check('overview tooltip closes after pointer exits a selected column', async () => {
    const region = page.getByRole('region', { name: 'Evolução das chamadas recebidas' });
    const column = region.getByRole('button', { name: /08h.*10h/ });
    await column.hover();
    const tooltip = page.getByRole('tooltip');
    await tooltip.waitFor({ state: 'visible' });
    await column.click();
    await page.mouse.move(12, 12);
    await page.locator('[role="tooltip"][data-open="false"]').waitFor();
    assert.equal(await region.getByRole('button', { name: 'Fechar' }).count(), 1,
      'selected bar details remain available after tooltip closes');
  });
  await page.getByRole('button', { name: 'Hoje', exact: true }).click();
  await page.getByRole('heading', { name: 'Filas — último estado disponível' }).waitFor();
  await check('Tab and Enter navigate the unified dashboard links', async () => {
    await nav('Visão geral').focus();
    await page.keyboard.press('Tab');
    assert.equal(await nav('Por mês').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { name: 'Chamadas por mês', exact: true }).waitFor();
    assert.equal(await nav('Por mês').getAttribute('aria-current'), 'page');
  });
  await check('monthly chart uses vertical grouped columns and smooth accessible tooltip', async () => {
    await page.getByLabel('Selecionar ano do grafico mensal').selectOption(String(year));
    const chart = page.getByRole('group', { name: 'Atendidas, recebidas e abandonadas por mês' });
    await chart.waitFor();
    assert.match(await page.getByText('Colunas verticais agrupadas; recebidas incluem todas as situações.').innerText(), /Colunas verticais/);
    const month = chart.locator('rect[role="button"]').last();
    await month.hover();
    const tooltip = page.getByRole('tooltip');
    await tooltip.waitFor({ state: 'visible' });
    assert.match(await tooltip.innerText(), /Recebidas/);
    assert.match(await tooltip.innerText(), /Atendidas/);
    assert.match(await tooltip.innerText(), /Abandonadas/);
    await month.focus();
    assert.equal(await tooltip.getAttribute('data-open'), 'true');
  });
  await check('hourly chart uses same tooltip on hover and keyboard', async () => {
    await nav('Por hora').click();
    await page.getByRole('heading', { name: 'Chamadas por hora', exact: true }).waitFor();
    const chart = page.getByRole('group', { name: /Chamadas recebidas, atendidas e abandonadas por hora/ });
    assert.equal(await page.getByLabel('Serie da media horaria').count(), 0,
      'the mean metric dropdown must not be displayed');
    assert.equal(await page.getByLabel('Detalhar hora').count(), 0,
      'the hour selector must not be displayed');
    assert.equal(await page.getByRole('option', { name: 'Selecione' }).count(), 0,
      'the hour placeholder must not be displayed');
    const meanTitle = chart.locator('line > title');
    assert.match(await meanTitle.textContent(), /Média de recebidas/,
      'the received-call average should remain in the chart');
    const hour = chart.locator('rect[role="button"]').nth(8);
    await hour.hover();
    const tooltip = page.getByRole('tooltip');
    await tooltip.waitFor({ state: 'visible' });
    assert.match(await tooltip.innerText(), /8h/);
    await hour.focus();
    assert.equal(await tooltip.getAttribute('data-open'), 'true');
  });
  await check('period filters and overview remain functional after link navigation', async () => {
    await nav('Visão geral').click();
    await page.getByRole('button', { name: 'Personalizado', exact: true }).click();
    await page.getByLabel('Data inicial', { exact: true }).fill('2025-01-02');
    await page.getByLabel('Data final', { exact: true }).fill('2025-01-03');
    await totals.getByText('0', { exact: true }).first().waitFor();
    assert.ok((await page.getByRole('region', { name: 'Taxa de abandono', exact: true }).innerText()).includes('—'));
    await page.getByRole('button', { name: 'Hoje', exact: true }).click();
    await totals.getByText('120', { exact: true }).waitFor();
  });
  await check('annual grouped columns are vertical and average is a horizontal line', async () => {
    let previousMissing = false;
    await page.route('**/api/chamadas?*', async route => {
      const u = new URL(route.request().url());
      const date = u.searchParams.get('start');
      const perYear = Number(date.slice(0, 4));
      if (previousMissing && perYear === year - 1) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [] }) });
        return;
      }
      const count = perYear === year - 1 ? 120 : 60;
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ rows: [{ periodo_inicio: date + 'T08:00:00',
          total: count, atendidas: count / 2, abandonadas: count / 4, nao_atendidas: count / 4, outras: 0 }] }) });
    });
    await nav('Comparativo anual').click();
    // Monthly tab intentionally retains an older year: select the target year explicitly.
    await page.getByLabel('Ano da comparação anual').selectOption(String(year));
    await page.getByRole('heading', { name: 'Comparativo anual de chamadas', exact: true }).waitFor();
    const chart = page.getByTestId('annual-vertical-chart');
    await chart.waitFor();
    assert.match(await chart.getAttribute('aria-label'), /Gráfico de colunas verticais agrupadas/);
    assert.equal(await page.getByText(/Colunas verticais agrupadas: recebidas, atendidas e abandonadas por ano/).count(), 0);
    assert.equal(await page.getByText(/Comparação .* x .* Períodos equivalentes/).count(), 0);
    assert.equal(await page.getByText(/Os números vêm dos registros disponíveis no Supabase/).count(), 0);
    assert.equal(await page.getByText(/Linha horizontal tracejada: média dos dois anos/).count(), 0);
    for (const metric of ['total', 'atendidas', 'abandonadas']) {
      assert.equal(await page.getByTestId('annual-column-' + metric + '-' + year).count(), 1);
      assert.equal(await page.getByTestId('annual-column-' + metric + '-' + (year - 1)).count(), 1);
    }
    const line = page.getByTestId('annual-mean-horizontal-line');
    // SVG horizontal <line> has a zero-height geometry box; check attachment, not Playwright visibility.
    await line.waitFor({ state: 'attached' });
    assert.equal(await line.getAttribute('y1'), await line.getAttribute('y2'), 'average must be horizontal');
    assert.notEqual(await line.getAttribute('x1'), await line.getAttribute('x2'), 'average has width');
    const previousY = await line.getAttribute('y1');
    await page.getByLabel('Série da média anual').selectOption('atendidas');
    assert.notEqual(await line.getAttribute('y1'), previousY, 'changing metric moves the average line vertically');
    const totalColumn = page.getByTestId('annual-column-total-' + year);
    await totalColumn.hover();
    const floating = page.getByTestId('annual-column-tooltip');
    await floating.waitFor({ state: 'visible' });
    assert.match(await floating.innerText(), /Recebidas/);
    assert.match(await floating.innerText(), new RegExp(String(year)));
    assert.match(await floating.innerText(), /chamadas/i);
    assert.match(await floating.innerText(), /Média entre anos/);
    const tooltipBounds = await floating.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: window.innerWidth, height: window.innerHeight };
    });
    assert.ok(tooltipBounds.left >= 0 && tooltipBounds.right <= tooltipBounds.width + 1,
      'annual tooltip must stay within horizontal viewport');
    assert.ok(tooltipBounds.top >= 0 && tooltipBounds.bottom <= tooltipBounds.height + 1,
      'annual tooltip must stay within vertical viewport');
    const hasOverlap = await floating.evaluate(element => {
      return Array.from(element.querySelectorAll('[class*="line"]')).some(line => {
        const label = line.querySelector('[class*="label"]');
        const value = line.querySelector('[class*="value"]');
        if (!label || !value) return false;
        return label.getBoundingClientRect().right + 8 > value.getBoundingClientRect().left;
      });
    });
    assert.equal(hasOverlap, false, 'tooltip labels and values must not overlap');

    await page.mouse.move(12, 12);
    await page.locator('[data-testid="annual-column-tooltip"][data-open="false"]').waitFor();
    await totalColumn.focus();
    await floating.waitFor();
    await page.getByRole('status').filter({ hasText: 'Recebidas · ' + year }).waitFor();
    await page.getByLabel('Série da média anual').focus();
    await page.locator('[data-testid="annual-column-tooltip"][data-open="false"]').waitFor();
    await page.screenshot({ path: 'artifacts/call-center-design/desktop-annual-vertical.png', fullPage: true });

    // Real production condition: current year is present and prior year has no records.
    previousMissing = true;
    // Reload only the annual comparison; keep overview snapshot independent.
    await page.getByLabel('Ano da comparação anual').selectOption(String(year - 1));
    await page.getByLabel('Ano da comparação anual').selectOption(String(year));
    await page.getByTestId('annual-missing-total-' + (year - 1)).waitFor({ state: 'attached' });
    assert.equal(await page.getByText(/Um dos anos não contém registros/).count(), 0);
    assert.equal(await page.getByTestId('annual-column-total-' + (year - 1)).count(), 0);
    assert.equal(await page.getByTestId('annual-missing-total-' + (year - 1)).count(), 1);
    assert.equal(await page.getByTestId('annual-column-total-' + year).count(), 1);
    // There is no interannual average: use the real year's volume as a
    // distinct, clearly labeled visual reference, not as a two-year mean.
    assert.equal(await page.getByTestId('annual-mean-horizontal-line').count(), 0,
      'never label a single observed year as an interannual average');
    const oneYearReference = page.getByTestId('annual-reference-horizontal-line');
    await oneYearReference.waitFor({ state: 'attached' });
    assert.equal(await oneYearReference.getAttribute('y1'), await oneYearReference.getAttribute('y2'));
    assert.match(await page.getByRole('region', { name: 'Comparativo anual' }).innerText(), new RegExp('Referência ' + year));
    assert.match(await page.getByRole('region', { name: 'Comparativo anual' }).innerText(), /Variação: — \(histórico de um dos anos ausente\)/);
    await totalColumn.hover();
    await floating.waitFor();
    assert.match(await floating.innerText(), new RegExp('Referência ' + year));
    assert.match(await floating.innerText(), /Variação/);
    assert.match(await floating.innerText(), /sem dados em/);

    await page.setViewportSize({ width: 375, height: 900 });
    await settleLayout();
    const mobile = await measureViewport();
    assert.ok(mobile.document <= 377, 'annual chart must not overflow the mobile document');
    const scroll = await page.locator('[class*="annualChartScroll"]').evaluate(element =>
      ({ width: element.clientWidth, scroll: element.scrollWidth }));
    assert.ok(scroll.scroll > scroll.width, 'annual chart must scroll within its own viewport');
    await page.screenshot({ path: 'artifacts/call-center-design/mobile-annual-vertical.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.unroute('**/api/chamadas?*');
  });
  await check('daily times chart omits the requested explanatory paragraph', async () => {
    await nav('TMA e TME diário').click();
    assert.equal(await page.getByText(/Valores em segundos no eixo vertical; detalhes em mm:ss/).count(), 0);
    assert.equal(await page.getByText(/TET legado não é TME de fila\. Dias sem registros/).count(), 0);
  });
  await check('Por ramal has no navigation or API after retirement', async () => {
    assert.equal(await menu.getByRole('link', { name: 'Por ramal' }).count(), 0);
    assert.equal((await page.request.get(origin + '/api/chamadas/ramais')).status(), 404);
  });
  await nav('Visão geral').click();
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
      await nav('Por hora').click();
      await page.getByRole('heading', { name: 'Chamadas por hora', exact: true }).waitFor();
      await settleLayout();
      const hourly = await measureViewport();
      console.log('HOURLY_VIEWPORT_DIAGNOSTIC=' + JSON.stringify(hourly));
      assert.ok(hourly.document <= width + 2);
      await nav('Visão geral').click();
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
    const alert = page.getByRole('region', { name: 'Filtros de chamadas', exact: true }).getByRole('alert').filter({ hasText: 'última coleta válida do mesmo dia' });
    await alert.waitFor();
    assert.ok(await totals.getByText('120', { exact: true }).isVisible());
    assert.match(await alert.innerText(), /última coleta válida do mesmo dia/);
  });
  await check('access denial clears all visible volume and time values', async () => {
    mode = 'denied'; await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
    await page.getByRole('region', { name: 'Filtros de chamadas', exact: true }).getByRole('alert').filter({ hasText: 'Sessão expirada' }).waitFor();
    assert.equal(await totals.getByText('120', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('region', { name: 'TMA', exact: true }).getByText('03:25', { exact: true }).count(), 0);
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
