import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Required PLAYWRIGHT_MODULE');
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);

const draftId = '00000000-0000-4000-8000-000000000099';
const publishedId = '00000000-0000-4000-8000-000000000088';
const drafts = [
 { id: draftId, nome: 'Dashboard de teste', descricao: '', estado: 'rascunho',
   topico_slug: 'call-center', topico_nome: 'Call Center', criado_em: '2026-11-24T12:00:00Z' },
 { id: publishedId, nome: 'Dashboard publicado', descricao: '', estado: 'publicado',
   topico_slug: 'call-center', topico_nome: 'Call Center', criado_em: '2026-11-24T12:00:00Z' }
];
let catalogCalls = 0;
let unexpectedQueries = 0;
let layoutReads = 0;
let layoutWrites = 0;
let savedRevision = 0;
let savedBlocks = [];
const upstream = createServer(async (req, res) => {
 const url = new URL(req.url ?? '/', 'http://127.0.0.1');
 const send = (status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(value));
 };
 if (req.headers.apikey !== 'visual-test-only') return send(401, {});
 const token = req.headers.authorization;
 if (url.pathname === '/auth/v1/user') {
  if (token === 'Bearer visual-admin') return send(200, {
   id: '00000000-0000-4000-8000-000000000001',
   app_metadata: { dashboard_role: 'admin' }
  });
  if (token === 'Bearer visual-manager') return send(200, {
   id: '00000000-0000-4000-8000-000000000002',
   app_metadata: { dashboard_role: 'manager' }, user_metadata: { dashboard_role: 'admin' }
  });
  return send(401, {});
 }
 if (url.pathname === '/rest/v1/rpc/dashboard_catalogo_listar_personalizados') {
  if (token !== 'Bearer visual-admin') return send(403, {});
  catalogCalls++;
  return send(200, drafts);
 }
 if (url.pathname === '/rest/v1/rpc/dashboard_editor_layout_ler') {
  if (token !== 'Bearer visual-admin') return send(403, { code: '42501' });
  layoutReads++;
  return send(200, [{ revisao: savedRevision, blocos: savedBlocks }]);
 }
 if (url.pathname === '/rest/v1/rpc/dashboard_editor_layout_salvar') {
  if (token !== 'Bearer visual-admin') return send(403, { code: '42501' });
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  if (body.p_dashboard_id !== draftId || !Array.isArray(body.p_blocos)) {
   return send(400, { code: '22023' });
  }
  if (body.p_revisao_esperada !== savedRevision) return send(409, { code: '40001' });
  savedRevision++;
  savedBlocks = body.p_blocos;
  layoutWrites++;
  return send(200, [{ revisao: savedRevision, blocos: savedBlocks }]);
 }
 unexpectedQueries++;
 return send(500, { error: 'Editor must not read operational data or write drafts' });
});
await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));

const port = 3226;
const origin = `http://127.0.0.1:${port}`;
const editorUrl = origin + '/editor/dashboards/' + draftId;
const app = spawn(process.execPath,
 ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)],
 { env: {
  ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
  SUPABASE_URL: `http://127.0.0.1:${upstream.address().port}`,
  SUPABASE_PUBLISHABLE_KEY: 'visual-test-only', APP_ORIGIN: origin,
 }, stdio: ['ignore', 'pipe', 'pipe'] }
);
let logs = '';
for (const stream of [app.stdout, app.stderr]) {
 stream.on('data', chunk => { logs = (logs + chunk).slice(-12000); });
}
let browser;
let page;
let passed = 0;
async function check(name, fn) {
 await fn();
 passed++;
 console.log(`ok ${passed} - ${name}`);
}

try {
 let ready = false;
 for (let attempt = 0; attempt < 100; attempt++) {
  if (app.exitCode !== null) throw new Error('Server exited during startup');
  try {
   const response = await fetch(origin + '/api/catalogo/fontes-editor');
   if (response.status === 401) { ready = true; break; }
  } catch { /* startup */ }
  await delay(100);
 }
 assert.ok(ready, 'Next must start');

 browser = await chromium.launch({ headless: true });
 const context = await browser.newContext({
  viewport: { width: 1536, height: 1100 }, locale: 'pt-BR', reducedMotion: 'reduce'
 });
 page = await context.newPage();
 page.setDefaultTimeout(12000);
 const errors = [];
 page.on('pageerror', error => errors.push(error.message));

 await check('anonymous cannot open editor by URL', async () => {
  await page.goto(editorUrl);
  assert.match(page.url(), /\/login/);
  assert.equal(catalogCalls, 0);
 });
 await context.addCookies([{
  name: 'dashboard_tools_access_token', value: 'visual-manager',
  domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax'
 }]);
 await check('manager cannot open editor even with forged user_metadata', async () => {
  const response = await page.goto(editorUrl);
  assert.equal(response.status(), 404);
  assert.equal(catalogCalls, 0);
 });
 await context.addCookies([{
  name: 'dashboard_tools_access_token', value: 'visual-admin',
  domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax'
 }]);
 await check('published and unknown dashboard IDs stay inaccessible', async () => {
  assert.equal((await page.goto(origin + '/editor/dashboards/' + publishedId)).status(), 404);
  assert.equal((await page.goto(origin + '/editor/dashboards/00000000-0000-4000-8000-000000000077')).status(), 404);
  assert.equal((await page.goto(origin + '/editor/dashboards/not-a-uuid')).status(), 404);
 });
 await check('admin loads existing draft with 3 panels and controlled autosave', async () => {
  assert.equal((await page.goto(editorUrl)).status(), 200);
  await page.getByTestId('visual-editor').waitFor();
  await page.getByRole('complementary', { name: 'Catálogo de componentes' }).waitFor();
  await page.getByRole('main').getByTestId('editor-canvas').waitFor();
  await page.getByRole('complementary', { name: 'Propriedades do componente' }).waitFor();
  assert.match(await page.getByRole('heading', { name: 'Dashboard de teste' }).innerText(), /Dashboard de teste/);
  await page.getByRole('status').filter({ hasText: /Sem alterações pendentes/i }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Salvar agora' }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Publicar', exact: true }).isDisabled(), true);
 });
 await check('catalog has all 8 requested component types', async () => {
  const catalog = page.getByRole('complementary', { name: 'Catálogo de componentes' });
  const expected = ['Cartão KPI', 'Linhas', 'Barras', 'Área', 'Pizza', 'Rosca', 'Tabela', 'Texto'];
  for (const name of expected) {
   assert.equal(await catalog.getByRole('button', { name: new RegExp('^' + name) }).count(), 1);
  }
 });
 await check('click adds KPI and lines without overlapping', async () => {
  const catalog = page.getByRole('complementary', { name: 'Catálogo de componentes' });
  await catalog.getByRole('button', { name: /^Cartão KPI/ }).click();
  await catalog.getByRole('button', { name: /^Linhas/ }).click();
  const cards = page.getByTestId('editor-block');
  assert.equal(await cards.count(), 2);
  const frames = await cards.evaluateAll(items => items.map(item => {
   const r = item.getBoundingClientRect();
   return { x: r.x, y: r.y, w: r.width, h: r.height };
  }));
  const [a,b] = frames;
  assert.equal(a.x < b.x + b.w && a.x + a.w > b.x
   && a.y < b.y + b.h && a.y + a.h > b.y, false);
 });
 await check('selected chart can change title and candidate source locally', async () => {
  await page.getByLabel('Título do componente').fill('Chamadas por período');
  await page.getByLabel('Fonte candidata').selectOption('relatorio_chamadas');
  await page.getByLabel('Indicador candidato').selectOption('quantidade_chamadas');
  assert.equal(await page.getByTestId('editor-block').last().getByText('Chamadas por período').count(), 1);
  assert.match(await page.getByTestId('editor-block').last().innerText(), /Sem dados reais/);
 });
 await check('text component can be added and edited', async () => {
  const catalog = page.getByRole('complementary', { name: 'Catálogo de componentes' });
  await catalog.getByRole('button', { name: /^Texto/ }).click();
  await page.getByLabel('Conteúdo do texto').fill('Resumo do atendimento');
  assert.match(await page.getByTestId('editor-block').last().innerText(), /Resumo do atendimento/);
 });
 await check('undo, redo, remove and preview operate on local state', async () => {
  await page.getByRole('button', { name: 'Remover do layout local' }).click();
  assert.equal(await page.getByTestId('editor-block').count(), 2);
  await page.getByRole('button', { name: 'Desfazer' }).click();
  assert.equal(await page.getByTestId('editor-block').count(), 3);
  await page.getByRole('button', { name: 'Refazer' }).click();
  assert.equal(await page.getByTestId('editor-block').count(), 2);
  await page.getByRole('button', { name: 'Pré-visualizar' }).click();
  assert.equal(await page.getByRole('complementary', { name: 'Catálogo de componentes' }).isVisible(), false);
  await page.getByRole('button', { name: 'Voltar à edição' }).click();
 });
 await check('existing cards can be dragged without overlap and resized', async () => {
  const card = page.getByTestId('editor-block').last();
  await card.click();
  const before = await card.getAttribute('style');
  const handle = card.getByRole('button', { name: 'Mover Chamadas por período' });
  await handle.dragTo(page.getByTestId('editor-canvas'), { targetPosition: { x: 140, y: 340 } });
  const moved = await card.getAttribute('style');
  assert.notEqual(moved, before, 'drag should move the card in the grid');

  await page.getByRole('button', { name: 'Aumentar largura' }).click();
  const widened = await card.getAttribute('style');
  assert.notEqual(widened, moved, 'inspector should resize the card');

  const resizeHandle = card.getByRole('button', { name: 'Redimensionar Chamadas por período' });
  const frame = await resizeHandle.boundingBox();
  assert.ok(frame);
  await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
  await page.mouse.down();
  await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2 + 80, { steps: 5 });
  await page.mouse.up();
  const resized = await card.getAttribute('style');
  assert.notEqual(resized, widened, 'pointer handle should resize the card height');

  const frames = await page.getByTestId('editor-block').evaluateAll(items => items.map(item => {
   const rect = item.getBoundingClientRect();
   return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
  }));
  for (let i = 0; i < frames.length; i++) for (let j = i + 1; j < frames.length; j++) {
   const a = frames[i], b = frames[j];
   assert.equal(a.x < b.x + b.w && a.x + a.w > b.x
    && a.y < b.y + b.h && a.y + a.h > b.y, false, 'No card may overlap');
  }
 });
 await check('autosave is confirmed and persists after reload', async () => {
  await page.getByRole('status').filter({ hasText: /Sem alterações pendentes/i }).waitFor({ timeout: 15000 });
  assert.ok(layoutWrites > 0);
  assert.equal(savedBlocks.length, 2);
  await page.reload();
  await page.getByTestId('editor-block').first().waitFor();
  assert.equal(await page.getByTestId('editor-block').count(), 2);
  assert.ok(await page.getByTestId('editor-block').last().getByText('Chamadas por período').count());
  assert.ok(layoutReads >= 2);
  assert.equal(unexpectedQueries, 0);
  assert.ok(catalogCalls > 0);
 });
 await check('external save causes 409 and prevents silent overwrites', async () => {
  savedRevision++;
  const writesBefore = layoutWrites;
  const cards = page.getByTestId('editor-block');
  await cards.last().click();
  await page.getByLabel('Título do componente').fill('Alteração em conflito');
  await page.getByRole('status').filter({ hasText: /Outro acesso alterou o rascunho/i }).waitFor({ timeout: 15000 });
  assert.equal(layoutWrites, writesBefore);
  assert.equal(await page.getByRole('button', { name: /^Cartão KPI/ }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Salvar agora' }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Recarregar do servidor' }).count(), 1);
 });
 await check('no browser errors, no operational data requests', async () => {
  assert.deepEqual(errors, []);
  assert.equal(unexpectedQueries, 0);
 });
 console.log(`VISUAL_EDITOR_SMOKE_PASSED=${passed};mode=autosave;server_saves=${layoutWrites}`);
} catch (error) {
 console.error(logs);
 throw error;
} finally {
 if (browser) await browser.close();
 app.kill('SIGTERM');
 upstream.closeAllConnections();
 await new Promise(resolve => upstream.close(resolve));
 if (app.exitCode === null) {
  await Promise.race([new Promise(resolve => app.once('exit', resolve)), delay(3000)]);
  if (app.exitCode === null) app.kill('SIGKILL');
 }
}
