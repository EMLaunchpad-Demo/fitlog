// E2E for everything that needs the app's own server: the Worker API, the automatic
// encrypted backup (two "devices", restore, conflict) and reminder notifications.
//
// Starts `wrangler dev` itself with empty storage (it builds the web app first, which
// takes a minute or two). Set CLOUD_URL to test a server that is already running; it
// must have been started with `--var ALLOW_LOCAL_PUSH:1 --test-scheduled`.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const vm = require('vm');
const ece = require('http_ece');
const { testWorkerApi } = require('./worker.e2e');

const PORT = 8790;
const OUT = path.join(__dirname, 'screenshots');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b64url = (buf) => Buffer.from(buf).toString('base64url');

async function startServer() {
  if (process.env.CLOUD_URL) return { url: process.env.CLOUD_URL, stop: () => {} };
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'fitlog-kv-'));
  const child = spawn(
    'npx',
    ['--yes', 'wrangler@latest', 'dev', '--port', String(PORT), '--persist-to', state, '--var', 'ALLOW_LOCAL_PUSH:1', '--test-scheduled'],
    { cwd: path.join(__dirname, '..'), env: { ...process.env, CI: '1' }, stdio: 'ignore', detached: true },
  );
  const url = `http://localhost:${PORT}`;
  const stop = () => {
    try {
      process.kill(-child.pid);
    } catch {
      // already gone
    }
    fs.rmSync(state, { recursive: true, force: true });
  };
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(`${url}/api/health`)).ok) return { url, stop };
    } catch {
      // not up yet
    }
    await wait(2000);
  }
  stop();
  throw new Error('wrangler dev did not start');
}

async function testServiceWorkerPush() {
  const listeners = {};
  const shown = [];
  const opened = [];
  const windows = [];
  const self = {
    location: { origin: 'https://app.example' },
    addEventListener: (type, fn) => (listeners[type] = fn),
    registration: { showNotification: async (title, options) => shown.push({ title, ...options }) },
    clients: {
      matchAll: async () => windows,
      openWindow: async (url) => opened.push(url),
      claim: async () => {},
    },
    skipWaiting: async () => {},
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8'), { self, caches: {}, URL, fetch, Promise });
  const dispatch = async (type, event) => {
    let pending;
    listeners[type]({ ...event, waitUntil: (p) => (pending = p) });
    await pending;
  };

  await dispatch('push', { data: { json: () => ({ title: 'Bijna bedtijd', body: 'Licht uit om 22:30.', url: '/sleep', tag: 'bed' }) } });
  assert.deepStrictEqual(
    { title: shown[0].title, body: shown[0].body, tag: shown[0].tag, url: shown[0].data.url },
    { title: 'Bijna bedtijd', body: 'Licht uit om 22:30.', tag: 'bed', url: '/sleep' },
  );
  // A push without a readable message must still show something.
  await dispatch('push', { data: null });
  assert.strictEqual(shown[1].title, 'Fitlog');
  assert.ok(shown[1].body.length > 5);

  // Tap with the app closed: open it on the reminder's screen.
  let closed = 0;
  await dispatch('notificationclick', { notification: { close: () => closed++, data: { url: '/sleep' } } });
  assert.deepStrictEqual(opened, ['/sleep']);
  // Tap with the app open: bring it forward and go to that screen.
  const calls = [];
  windows.push({ focus: async () => calls.push('focus'), navigate: async (url) => calls.push(url) });
  await dispatch('notificationclick', { notification: { close: () => closed++, data: { url: '/weight' } } });
  assert.deepStrictEqual(calls, ['/weight', 'focus']);
  assert.strictEqual(opened.length, 1);
  assert.strictEqual(closed, 2);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const BASE = server.url;
  let browser;
  try {
    await testWorkerApi(BASE);

    browser = await chromium.launch();
    const errors = [];
    const device = async (init) => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ['notifications'] });
      if (init) await ctx.addInitScript(init.fn, init.arg);
      const page = await ctx.newPage();
      const dialogs = [];
      page.on('dialog', (d) => {
        dialogs.push(d.message());
        d.accept();
      });
      page.on('pageerror', (e) => errors.push(e.message));
      const v = (loc) => loc.filter({ visible: true }).first();
      const state = (key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null')?.state ?? null, key);
      const weigh = async (kg) => {
        await page.goto(BASE + '/weight');
        await v(page.getByLabel('Gewicht in kg')).fill(kg);
        await v(page.getByText('Opslaan', { exact: true })).click();
        await page.waitForTimeout(300);
      };
      return { ctx, page, dialogs, v, state, weigh };
    };

    // ── Device A: switch the automatic backup on ──
    const A = await device();
    const uploads = [];
    A.page.on('request', (r) => r.method() === 'PUT' && r.url().includes('/api/sync/') && uploads.push(r));
    await A.page.goto(BASE);
    await A.v(A.page.getByText('Volgende training')).waitFor({ timeout: 60000 });
    await A.weigh('75,5');
    await A.page.goto(BASE + '/cloud');
    await A.v(A.page.getByText('Zet automatische back-up aan')).click();
    await A.v(A.page.getByText('Staat aan')).waitFor({ timeout: 20000 });
    await A.v(A.page.getByText(/Laatste back-up zojuist/)).waitFor({ timeout: 20000 });
    const code = (await A.state('fitlog-cloud')).code;
    assert.ok(/^[2-9A-HJKMNP-TV-Z]{5}(-[2-9A-HJKMNP-TV-Z]{5}){3}$/.test(code), `recovery code format: ${code}`);
    await A.v(A.page.getByText(code)).waitFor(); // shown right after switching on
    await A.page.screenshot({ path: path.join(OUT, 'cloud-01-backup-aan.png') });

    // What left the device is ciphertext under an id that is not the code.
    assert.strictEqual(uploads.length, 1);
    const sent = JSON.parse(uploads[0].postData());
    const bytes = Buffer.from(sent.data, 'base64');
    assert.ok(bytes.length > 200, 'backup has content');
    assert.ok(!bytes.includes('bodyWeights') && !bytes.includes('75.5') && !sent.data.includes('bodyWeights'), 'backup is not readable on the way out');
    const vault = uploads[0].url().split('/').pop();
    assert.ok(/^[a-f0-9]{40}$/.test(vault) && !vault.includes(code.replace(/-/g, '').toLowerCase()), 'vault id is derived, not the code');
    const stored = await (await fetch(`${BASE}/api/sync/${vault}`)).json();
    assert.strictEqual(stored.data, sent.data, 'server stores exactly the ciphertext');
    console.log('automatic backup on; server only holds ciphertext');

    // A change is picked up and backed up without asking.
    await A.page.goto(BASE + '/food');
    await A.v(A.page.getByLabel('Glas water toevoegen')).click();
    await A.page.waitForFunction(() => JSON.parse(localStorage.getItem('fitlog-cloud')).state.dirty === true);
    await A.page.goto(BASE + '/cloud');
    await A.v(A.page.getByText('Nu back-up maken')).click();
    await A.page.waitForFunction(() => JSON.parse(localStorage.getItem('fitlog-cloud')).state.dirty === false);
    assert.strictEqual(uploads.length, 2);
    console.log('changes are tracked and uploaded');

    // ── Device B: restore with the recovery code ──
    const B = await device();
    await B.page.goto(BASE + '/cloud');
    await B.v(B.page.getByLabel(/Heb je al een herstelcode/)).fill('ABCDE-FGHJK-MNPQR-STVWX');
    await B.v(B.page.getByText('Back-up terugzetten')).click();
    await B.page.waitForFunction(() => true);
    await wait(1500);
    assert.ok(B.dialogs.some((m) => m.includes('geen back-up gevonden')), `wrong code is reported: ${B.dialogs}`);
    await B.v(B.page.getByLabel(/Heb je al een herstelcode/)).fill(code.toLowerCase().replace(/-/g, ' '));
    await B.v(B.page.getByText('Back-up terugzetten')).click();
    await B.v(B.page.getByText('Staat aan')).waitFor({ timeout: 20000 });
    assert.ok(B.dialogs.some((m) => m.includes('1 wegingen')), 'restore asks for confirmation with a summary');
    const restored = await B.state('fitlog-store');
    assert.strictEqual(restored.bodyWeights[0].kg, 75.5, 'weigh-in restored on the second device');
    assert.strictEqual(Object.values(restored.water)[0], 1, 'water restored');
    assert.strictEqual((await B.state('fitlog-cloud')).code, code);
    console.log('restore on a second device ok');

    // ── Conflict: B saves, then A (which missed that) tries to save ──
    await B.page.goto(BASE + '/food');
    await B.v(B.page.getByLabel('Glas water toevoegen')).click();
    await B.page.goto(BASE + '/cloud');
    await B.v(B.page.getByText('Nu back-up maken')).click();
    await B.page.waitForFunction(() => JSON.parse(localStorage.getItem('fitlog-cloud')).state.dirty === false);
    await A.page.goto(BASE + '/food');
    await A.v(A.page.getByLabel('Glas water eraf')).click();
    await A.page.goto(BASE + '/cloud');
    await A.v(A.page.getByText('Nu back-up maken')).click();
    await A.v(A.page.getByText('Kies welke versie telt')).waitFor({ timeout: 20000 });
    await A.page.screenshot({ path: path.join(OUT, 'cloud-02-conflict.png') });
    await A.v(A.page.getByText('Haal de nieuwere back-up op')).click();
    await A.v(A.page.getByText('Staat aan')).waitFor({ timeout: 20000 });
    assert.strictEqual(Object.values((await A.state('fitlog-store')).water)[0], 2, "A now has B's version");
    console.log('conflict between devices is detected and resolved');

    // Switching off wipes the server copy.
    await A.v(A.page.getByText('Automatische back-up uitzetten')).click();
    await A.v(A.page.getByText('Zet automatische back-up aan')).waitFor({ timeout: 20000 });
    assert.strictEqual((await fetch(`${BASE}/api/sync/${vault}`)).status, 404, 'server copy deleted');
    assert.strictEqual((await A.state('fitlog-store')).bodyWeights.length, 1, 'local data untouched');
    console.log('switching off deletes the server copy');
    await A.ctx.close();
    await B.ctx.close();

    // ── Reminders: the browser's push parts are faked, the server and the encryption are real ──
    const received = [];
    const pushService = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        received.push(Buffer.concat(chunks));
        res.writeHead(201).end();
      });
    });
    await new Promise((r) => pushService.listen(0, '127.0.0.1', r));
    const keys = crypto.createECDH('prime256v1');
    keys.generateKeys();
    const auth = crypto.randomBytes(16);
    const decrypt = (body) => JSON.parse(ece.decrypt(body, { version: 'aes128gcm', privateKey: keys, authSecret: b64url(auth) }).toString());
    const fake = {
      endpoint: `http://127.0.0.1:${pushService.address().port}/push/${crypto.randomBytes(6).toString('hex')}`,
      keys: { p256dh: b64url(keys.getPublicKey()), auth: b64url(auth) },
    };
    const C = await device({
      arg: fake,
      fn: (sub) => {
        const subscription = { endpoint: sub.endpoint, toJSON: () => sub, unsubscribe: async () => true };
        Notification.requestPermission = async () => 'granted';
        PushManager.prototype.subscribe = async () => {
          localStorage.setItem('fake-push', '1');
          return subscription;
        };
        PushManager.prototype.getSubscription = async () => (localStorage.getItem('fake-push') ? subscription : null);
      },
    });
    await C.page.goto(BASE + '/cloud');
    await C.page.evaluate(() => navigator.serviceWorker.ready);
    await C.v(C.page.getByText('Zet herinneringen aan')).click();
    await C.v(C.page.getByText(/Herinneringen staan aan/)).waitFor({ timeout: 20000 });
    await C.v(C.page.getByText('Stuur een testmelding')).click();
    for (let i = 0; i < 20 && !received.length; i++) await wait(300);
    assert.strictEqual(decrypt(received[0]).body, 'Testmelding: je herinneringen werken.', 'test notification arrives encrypted for this browser');
    await C.page.screenshot({ path: path.join(OUT, 'cloud-03-herinneringen.png') });

    // Move "Wegen" to this minute: the next cron run sends it.
    const tz = await C.page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date());
    const nowTime = `${parts.find((p) => p.type === 'hour').value}:${parts.find((p) => p.type === 'minute').value}`;
    const field = C.v(C.page.getByLabel('Tijd Wegen'));
    await field.fill(nowTime);
    await field.blur();
    await wait(3500); // the change is sent after a short pause
    await fetch(`${BASE}/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*`);
    for (let i = 0; i < 20 && received.length < 2; i++) await wait(300);
    const reminder = decrypt(received[1]);
    assert.deepStrictEqual({ title: reminder.title, url: reminder.url, tag: reminder.tag }, { title: 'Wegen', url: '/weight', tag: 'weigh' });
    console.log('reminders: subscribe, test notification and a scheduled reminder ok');

    // The service worker turns a push into a notification, and a tap opens the right screen.
    // (Headless Chromium has no notification centre, so the handlers run here with a stand-in `self`.)
    await testServiceWorkerPush();
    console.log('service worker shows the notification and opens the app on tap');

    await C.v(C.page.getByText('Herinneringen uitzetten')).click();
    await C.v(C.page.getByText('Zet herinneringen aan')).waitFor({ timeout: 20000 });
    const gone = await fetch(`${BASE}/api/push/test`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: fake.endpoint }) });
    assert.strictEqual(gone.status, 404, 'unsubscribed on the server');
    pushService.close();

    console.log('errors:', errors.length ? [...new Set(errors)].slice(0, 10) : 'none');
    if (errors.length) process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.stop();
  }
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
