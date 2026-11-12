// Tests the Worker's API (encrypted backup storage and reminder pushes) against a running
// `npx wrangler dev --port 8787 --var ALLOW_LOCAL_PUSH:1 --test-scheduled`.
// The push part plays the browser and the push service itself: it checks the VAPID
// signature and decrypts the message with an independent library.
const assert = require('assert');
const crypto = require('crypto');
const http = require('http');
const ece = require('http_ece');

let BASE = process.env.WORKER_URL || 'http://localhost:8787';
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const api = async (path, init = {}) => {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    // not JSON
  }
  return { status: res.status, body };
};
const runCron = () => fetch(`${BASE}/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** "HH:MM" in a time zone, `offsetMin` minutes from now. */
function localTime(timeZone, offsetMin = 0) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(Date.now() + offsetMin * 60000));
  return `${parts.find((p) => p.type === 'hour').value}:${parts.find((p) => p.type === 'minute').value}`;
}

async function testWorkerApi(base = BASE) {
  BASE = base;
  assert.deepStrictEqual((await api('/api/health')).body, { ok: true }, 'worker is running');

  // ── Backup storage ──
  const vault = crypto.randomBytes(20).toString('hex');
  assert.strictEqual((await api(`/api/sync/${vault}`)).status, 404, 'unknown vault');
  const first = await api(`/api/sync/${vault}`, { method: 'PUT', body: { data: 'Y2lwaGVydGV4dA', baseUpdatedAt: null } });
  assert.strictEqual(first.status, 200);
  const got = await api(`/api/sync/${vault}`);
  assert.deepStrictEqual(got.body, { updatedAt: first.body.updatedAt, data: 'Y2lwaGVydGV4dA' });
  // A device that missed an update may not overwrite it…
  const stale = await api(`/api/sync/${vault}`, { method: 'PUT', body: { data: 'b3RoZXI', baseUpdatedAt: 1 } });
  assert.strictEqual(stale.status, 409);
  assert.strictEqual(stale.body.updatedAt, first.body.updatedAt);
  // …unless it knows the current version, or the user chose to overwrite.
  const second = await api(`/api/sync/${vault}`, { method: 'PUT', body: { data: 'bmV3', baseUpdatedAt: first.body.updatedAt } });
  assert.strictEqual(second.status, 200);
  assert.strictEqual((await api(`/api/sync/${vault}`, { method: 'PUT', body: { data: 'Zm9yY2Vk', baseUpdatedAt: 1, force: true } })).status, 200);
  assert.strictEqual((await api(`/api/sync/${vault}`, { method: 'PUT', body: { data: 'x'.repeat(3 * 1024 * 1024 + 1) } })).status, 413, 'size cap');
  assert.strictEqual((await api('/api/sync/not-a-vault', { method: 'PUT', body: { data: 'x' } })).status, 404, 'vault id format');
  assert.strictEqual((await api(`/api/sync/${vault}`, { method: 'PUT', body: {} })).status, 400);
  // Only a few vaults fit: strangers cannot fill the storage.
  const extra = [];
  let limited = false;
  for (let i = 0; i < 4 && !limited; i++) {
    const id = crypto.randomBytes(20).toString('hex');
    const res = await api(`/api/sync/${id}`, { method: 'PUT', body: { data: 'eA' } });
    if (res.status === 403) limited = true;
    else extra.push(id);
  }
  assert.ok(limited && extra.length <= 2, `vault limit reached after ${extra.length} more`);
  for (const id of [vault, ...extra]) assert.strictEqual((await api(`/api/sync/${id}`, { method: 'DELETE' })).status, 200);
  assert.strictEqual((await api(`/api/sync/${vault}`)).status, 404, 'deleted');
  console.log('backup storage ok');

  // ── Reminders ──
  const received = [];
  let pushStatus = 201;
  const pushService = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      received.push({ url: req.url, headers: req.headers, body: Buffer.concat(chunks) });
      res.writeHead(pushStatus).end();
    });
  });
  await new Promise((r) => pushService.listen(0, '127.0.0.1', r));
  const pushOrigin = `http://127.0.0.1:${pushService.address().port}`;

  // The "browser": its key pair and shared secret.
  const browser = crypto.createECDH('prime256v1');
  browser.generateKeys();
  const auth = crypto.randomBytes(16);
  const subscription = (path) => ({ endpoint: `${pushOrigin}/push/${path}`, keys: { p256dh: b64url(browser.getPublicKey()), auth: b64url(auth) } });
  const decrypt = (body) => JSON.parse(ece.decrypt(body, { version: 'aes128gcm', privateKey: browser, authSecret: b64url(auth) }).toString());

  const { body: keyBody } = await api('/api/push/key');
  const serverKey = Buffer.from(keyBody.key, 'base64url');
  assert.strictEqual(serverKey.length, 65, 'uncompressed P-256 public key');
  assert.strictEqual((await api('/api/push/key')).body.key, keyBody.key, 'key is stable');

  const tz = 'Europe/Brussels';
  const subA = subscription(crypto.randomBytes(6).toString('hex'));
  const reminders = [
    { id: 'wegen', time: localTime(tz), title: 'Wegen', body: 'Tijd om te wegen.', url: '/weight' },
    { id: 'later', time: localTime(tz, 180), title: 'Later', body: 'Nog niet.', url: '/' },
  ];
  assert.strictEqual((await api('/api/push/subscribe', { method: 'POST', body: { subscription: subA, timeZone: tz, reminders } })).status, 200);
  assert.strictEqual((await api('/api/push/subscribe', { method: 'POST', body: { subscription: { endpoint: 'https://evil.example.com/x' }, timeZone: tz, reminders } })).status, 400, 'only real push services');
  assert.strictEqual((await api('/api/push/subscribe', { method: 'POST', body: { subscription: subA, timeZone: tz, reminders: [{ id: 'x', time: '25:00', title: 'a', body: 'b' }] } })).status, 400, 'time format');
  // Re-subscribe with the valid list (the bad one above must not have replaced it).
  await api('/api/push/subscribe', { method: 'POST', body: { subscription: subA, timeZone: tz, reminders } });

  await runCron();
  await wait(1500);
  assert.strictEqual(received.length, 1, 'one push for the reminder that is due');
  const push = received[0];
  assert.strictEqual(push.url, new URL(subA.endpoint).pathname);
  assert.strictEqual(push.headers['content-encoding'], 'aes128gcm');
  assert.ok(Number(push.headers.ttl) > 0, 'TTL header');

  // VAPID: a JWT signed with the server key that the browser subscribed with.
  const m = push.headers.authorization.match(/^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/);
  assert.ok(m, `authorization header: ${push.headers.authorization}`);
  assert.strictEqual(m[4], keyBody.key);
  assert.deepStrictEqual(JSON.parse(Buffer.from(m[1], 'base64url')), { typ: 'JWT', alg: 'ES256' });
  const claims = JSON.parse(Buffer.from(m[2], 'base64url'));
  assert.strictEqual(claims.aud, pushOrigin);
  assert.strictEqual(claims.sub, new URL(BASE).origin);
  const now = Math.floor(Date.now() / 1000);
  assert.ok(claims.exp > now && claims.exp <= now + 24 * 3600, 'expiry within 24 hours');
  const publicKey = crypto.createPublicKey({
    format: 'jwk',
    key: { kty: 'EC', crv: 'P-256', x: b64url(serverKey.subarray(1, 33)), y: b64url(serverKey.subarray(33)) },
  });
  assert.ok(
    crypto.verify('sha256', Buffer.from(`${m[1]}.${m[2]}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(m[3], 'base64url')),
    'VAPID signature verifies',
  );

  // The message itself: only the browser's private key can read it.
  assert.deepStrictEqual(decrypt(push.body), { title: 'Wegen', body: 'Tijd om te wegen.', url: '/weight', tag: 'wegen' });
  assert.ok(!push.body.includes('wegen'), 'payload is not readable in transit');

  await runCron();
  await wait(1200);
  assert.strictEqual(received.length, 1, 'not sent twice on the same day');

  const test = await api('/api/push/test', { method: 'POST', body: { endpoint: subA.endpoint } });
  assert.strictEqual(test.status, 200);
  assert.strictEqual(decrypt(received[1].body).body, 'Testmelding: je herinneringen werken.');

  // A subscription the browser dropped (410) is forgotten.
  const subB = subscription(crypto.randomBytes(6).toString('hex'));
  await api('/api/push/subscribe', { method: 'POST', body: { subscription: subB, timeZone: tz, reminders: [reminders[0]] } });
  pushStatus = 410;
  await runCron();
  await wait(1500);
  assert.ok(received.some((r) => r.url === new URL(subB.endpoint).pathname), 'push attempted');
  pushStatus = 201;
  assert.strictEqual((await api('/api/push/test', { method: 'POST', body: { endpoint: subB.endpoint } })).status, 404, 'expired subscription removed');

  assert.strictEqual((await api('/api/push/unsubscribe', { method: 'POST', body: { endpoint: subA.endpoint } })).status, 200);
  assert.strictEqual((await api('/api/push/test', { method: 'POST', body: { endpoint: subA.endpoint } })).status, 404, 'unsubscribed');
  console.log('reminder pushes ok (VAPID signature verified, payload decrypted)');

  pushService.close();
}

module.exports = { testWorkerApi };

if (require.main === module)
  testWorkerApi().catch((e) => {
    console.error('FAILED:', e.message);
    process.exit(1);
  });
