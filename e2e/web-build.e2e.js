// Tests the production web export as an installable app: manifest, service worker,
// offline start, deep links, backup export/restore, and a coach call.
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium, devices } = require('playwright');

const DIST = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist'));
const PORT = 4173;
const BASE = `http://localhost:${PORT}`;
const OUT = path.join(__dirname, 'screenshots');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.css': 'text/css' };

// Static server with SPA fallback (like Netlify's _redirects).
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(DIST, url);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch();
  const { defaultBrowserType, ...iphone } = devices['iPhone 13 Pro'];
  const ctx = await browser.newContext({ ...iphone, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('dialog', (d) => d.accept());
  const v = (loc) => loc.filter({ visible: true }).first();

  // 1. Installable
  await page.goto(BASE);
  await v(page.getByText('Volgende training')).waitFor({ timeout: 30000 });
  const head = await page.evaluate(() => ({
    manifest: document.querySelector('link[rel=manifest]')?.getAttribute('href'),
    touchIcon: document.querySelector('link[rel=apple-touch-icon]')?.getAttribute('href'),
    capable: document.querySelector('meta[name=apple-mobile-web-app-capable]')?.getAttribute('content'),
    viewport: document.querySelector('meta[name=viewport]')?.getAttribute('content'),
    lang: document.documentElement.lang,
  }));
  assert.strictEqual(head.manifest, '/manifest.json');
  assert.ok(head.viewport.includes('viewport-fit=cover'));
  const manifest = await (await page.request.get(BASE + '/manifest.json')).json();
  assert.strictEqual(manifest.display, 'standalone');
  for (const icon of ['/apple-touch-icon.png', '/icon-192.png', '/icon-512.png'])
    assert.strictEqual((await page.request.get(BASE + icon)).headers()['content-type'], 'image/png', icon);
  console.log('installable:', JSON.stringify(head));

  // 2. Service worker controls the page after a reload
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await v(page.getByText('Volgende training')).waitFor();
  assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'service worker active');
  // Visit every tab once so its code is cached.
  for (const p of ['/train', '/plans', '/food', '/coach', '/goals', '/weight', '/']) {
    await page.goto(BASE + p);
    await page.waitForTimeout(1200);
  }

  // 3. Deep link + offline start
  await ctx.setOffline(true);
  await page.goto(BASE + '/');
  await v(page.getByText('Volgende training')).waitFor({ timeout: 15000 });
  await page.goto(BASE + '/food');
  await v(page.getByText('Ontbijt')).waitFor({ timeout: 15000 });
  await page.screenshot({ path: path.join(OUT, 'pwa-offline-food.png') });
  await ctx.setOffline(false);
  console.log('offline start ok');

  // 4. Backup: make one, change data, restore it
  await page.goto(BASE + '/weight');
  await v(page.getByLabel('Gewicht in kg')).fill('72,4');
  await v(page.getByText('Opslaan', { exact: true })).click();
  await page.goto(BASE + '/goals');
  await v(page.getByText('Back-up maken')).waitFor();
  await page.screenshot({ path: path.join(OUT, 'pwa-settings.png'), fullPage: false });
  const [download] = await Promise.all([page.waitForEvent('download'), v(page.getByText('Back-up maken')).click()]);
  const backupPath = path.join(OUT, 'backup-test.json');
  await download.saveAs(backupPath);
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  assert.strictEqual(backup.app, 'fitlog');
  assert.strictEqual(backup.data.bodyWeights[0].kg, 72.4);
  assert.ok(!JSON.stringify(backup).includes('fake-test-key'), 'no API key in backup');
  // Wipe the weight, then restore
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('fitlog-store'));
    s.state.bodyWeights = [];
    localStorage.setItem('fitlog-store', JSON.stringify(s));
  });
  await page.reload();
  await v(page.getByText('Back-up terugzetten')).waitFor();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), v(page.getByText('Back-up terugzetten')).click()]);
  await chooser.setFiles(backupPath);
  await page.waitForTimeout(800);
  await page.goto(BASE + '/');
  await v(page.getByText('72,4')).waitFor({ timeout: 10000 });
  console.log('backup export + restore ok:', download.suggestedFilename());

  // 5. Coach call from the production build (simulated API)
  let headers = null;
  await page.route('https://api.anthropic.com/**', async (route) => {
    headers = route.request().headers();
    await route.fulfill({
      status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ id: 'm1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: 'Hoi, alles werkt.' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } }),
    });
  });
  await page.evaluate(() => localStorage.setItem('anthropic-api-key', 'fake-test-key'));
  await page.goto(BASE + '/coach');
  await v(page.getByLabel('Bericht aan de coach')).fill('Werkt het?');
  await v(page.getByLabel('Versturen')).click();
  await v(page.getByText('Hoi, alles werkt.')).waitFor({ timeout: 15000 });
  assert.strictEqual(headers['anthropic-dangerous-direct-browser-access'], 'true');
  await page.screenshot({ path: path.join(OUT, 'pwa-coach.png') });
  console.log('coach from production build ok');

  await page.goto(BASE + '/');
  await v(page.getByText('Volgende training')).waitFor();
  await page.screenshot({ path: path.join(OUT, 'pwa-today.png') });

  console.log('errors:', errors.length ? [...new Set(errors)].slice(0, 10) : 'none');
  await browser.close();
  server.close();
})().catch((e) => {
  console.error('FAILED:', e.message);
  server.close();
  process.exit(1);
});
