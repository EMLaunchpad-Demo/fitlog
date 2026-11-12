/**
 * Fitlog's small backend on Cloudflare Workers. It does two things:
 *
 * 1. Stores the app's backup, which the app encrypts on the phone before it
 *    is sent. The Worker only ever sees ciphertext under a random-looking id.
 * 2. Sends reminder notifications (Web Push) at the times the user picked.
 *
 * Everything else is static files, served straight from the assets.
 */

const MAX_BACKUP_BYTES = 3 * 1024 * 1024;
/** A personal app needs one vault and a phone or two; the caps keep strangers from filling the storage. */
const MAX_VAULTS = 3;
const MAX_SUBSCRIPTIONS = 5;
const MAX_REMINDERS = 12;
/** Push services browsers actually use. Anything else would let the Worker send requests to arbitrary hosts. */
const PUSH_HOSTS = [
  /\.push\.apple\.com$/,
  /^fcm\.googleapis\.com$/,
  /\.notify\.windows\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
];

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    // Preview deployments have no storage bound: say so instead of failing.
    if (!env.KV) return json({ error: 'unavailable' }, 503);
    try {
      return await route(request, url, env);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code }, e.status);
      console.error(e);
      return json({ error: 'server-error' }, 500);
    }
  },

  async scheduled(_controller, env, ctx) {
    if (env.KV) ctx.waitUntil(sendDueReminders(env, Date.now()));
  },
};

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

async function readJson(request, maxBytes) {
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'too-large');
  try {
    const body = JSON.parse(text);
    if (body && typeof body === 'object') return body;
  } catch {
    // fall through
  }
  throw new HttpError(400, 'bad-request');
}

async function route(request, url, env) {
  const { pathname } = url;
  const method = request.method;

  if (pathname === '/api/health') return json({ ok: true });

  const sync = pathname.match(/^\/api\/sync\/([a-f0-9]{32,64})$/);
  if (sync) {
    if (method === 'GET') return getBackup(env, sync[1]);
    if (method === 'PUT') return putBackup(env, sync[1], await readJson(request, MAX_BACKUP_BYTES + 4096));
    if (method === 'DELETE') return deleteBackup(env, sync[1]);
  }

  if (pathname === '/api/push/key' && method === 'GET')
    return json({ key: (await getVapid(env)).publicKey });
  if (pathname === '/api/push/subscribe' && method === 'POST')
    return subscribe(env, url, await readJson(request, 16384));
  if (pathname === '/api/push/unsubscribe' && method === 'POST')
    return unsubscribe(env, await readJson(request, 4096));
  if (pathname === '/api/push/test' && method === 'POST')
    return sendTest(env, await readJson(request, 4096));

  throw new HttpError(404, 'not-found');
}

// ───────────────────────── Backup ─────────────────────────

async function getBackup(env, vault) {
  const stored = await env.KV.get(`vault:${vault}`, 'json');
  return stored ? json(stored) : json({ error: 'not-found' }, 404);
}

async function putBackup(env, vault, body) {
  if (typeof body.data !== 'string' || !body.data) throw new HttpError(400, 'bad-request');
  if (body.data.length > MAX_BACKUP_BYTES) throw new HttpError(413, 'too-large');

  const existing = await env.KV.get(`vault:${vault}`, 'json');
  if (!existing) {
    const vaults = (await env.KV.get('vaults', 'json')) ?? [];
    if (!vaults.includes(vault)) {
      if (vaults.length >= MAX_VAULTS) throw new HttpError(403, 'vault-limit');
      await env.KV.put('vaults', JSON.stringify([...vaults, vault]));
    }
  } else if (!body.force && existing.updatedAt !== (body.baseUpdatedAt ?? null)) {
    // Another device saved a newer backup since this one last synced.
    return json({ error: 'conflict', updatedAt: existing.updatedAt }, 409);
  }

  const updatedAt = Date.now();
  await env.KV.put(`vault:${vault}`, JSON.stringify({ updatedAt, data: body.data }));
  return json({ updatedAt });
}

async function deleteBackup(env, vault) {
  await env.KV.delete(`vault:${vault}`);
  const vaults = (await env.KV.get('vaults', 'json')) ?? [];
  await env.KV.put('vaults', JSON.stringify(vaults.filter((v) => v !== vault)));
  return json({ deleted: true });
}

// ───────────────────────── Reminders: storing subscriptions ─────────────────────────

const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const fromB64url = (text) =>
  Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const utf8 = (text) => new TextEncoder().encode(text);

async function subscriptionId(endpoint) {
  const hash = await crypto.subtle.digest('SHA-256', utf8(endpoint));
  return [...new Uint8Array(hash).slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function checkEndpoint(env, endpoint) {
  let target;
  try {
    target = new URL(endpoint);
  } catch {
    throw new HttpError(400, 'bad-endpoint');
  }
  const local = env.ALLOW_LOCAL_PUSH === '1' && ['127.0.0.1', 'localhost'].includes(target.hostname);
  if (local) return;
  if (target.protocol !== 'https:' || !PUSH_HOSTS.some((re) => re.test(target.hostname)))
    throw new HttpError(400, 'bad-endpoint');
}

function cleanReminders(raw) {
  if (!Array.isArray(raw) || raw.length > MAX_REMINDERS) throw new HttpError(400, 'bad-reminders');
  return raw.map((r) => {
    if (
      !r ||
      typeof r.id !== 'string' ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time) ||
      typeof r.title !== 'string' ||
      typeof r.body !== 'string'
    )
      throw new HttpError(400, 'bad-reminders');
    return {
      id: r.id.slice(0, 40),
      time: r.time,
      title: r.title.slice(0, 80),
      body: r.body.slice(0, 200),
      url: typeof r.url === 'string' && r.url.startsWith('/') ? r.url.slice(0, 80) : '/',
    };
  });
}

async function subscribe(env, url, body) {
  const sub = body.subscription;
  if (!sub || typeof sub.endpoint !== 'string') throw new HttpError(400, 'bad-request');
  checkEndpoint(env, sub.endpoint);
  let timeZone = typeof body.timeZone === 'string' ? body.timeZone : 'UTC';
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone });
  } catch {
    timeZone = 'UTC';
  }
  const id = await subscriptionId(sub.endpoint);
  const existing = await env.KV.get(`push:${id}`, 'json');
  if (!existing) {
    const { keys } = await env.KV.list({ prefix: 'push:' });
    if (keys.length >= MAX_SUBSCRIPTIONS) throw new HttpError(403, 'subscription-limit');
  }
  await env.KV.put(
    `push:${id}`,
    JSON.stringify({
      endpoint: sub.endpoint,
      p256dh: typeof sub.keys?.p256dh === 'string' ? sub.keys.p256dh : null,
      auth: typeof sub.keys?.auth === 'string' ? sub.keys.auth : null,
      timeZone,
      origin: url.origin,
      reminders: cleanReminders(body.reminders),
      // What was already sent today survives a change of the reminder list.
      sent: existing?.sent ?? {},
    }),
  );
  return json({ id });
}

async function unsubscribe(env, body) {
  if (typeof body.endpoint !== 'string') throw new HttpError(400, 'bad-request');
  await env.KV.delete(`push:${await subscriptionId(body.endpoint)}`);
  return json({ deleted: true });
}

async function sendTest(env, body) {
  if (typeof body.endpoint !== 'string') throw new HttpError(400, 'bad-request');
  const sub = await env.KV.get(`push:${await subscriptionId(body.endpoint)}`, 'json');
  if (!sub) throw new HttpError(404, 'not-subscribed');
  const status = await sendPush(env, sub, {
    title: 'Fitlog',
    body: 'Testmelding: je herinneringen werken.',
    url: '/',
    tag: 'test',
  });
  return json({ status }, status >= 200 && status < 300 ? 200 : 502);
}

// ───────────────────────── Reminders: the clock ─────────────────────────

/** Local date and minutes since midnight in a time zone. */
function localClock(now, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(now));
  const get = (type) => parts.find((p) => p.type === type).value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/** Reminders whose time fell in the last ten minutes and that were not sent yet today. */
function dueReminders(sub, now) {
  const { date, minutes } = localClock(now, sub.timeZone);
  return sub.reminders.filter((r) => {
    const [h, m] = r.time.split(':').map(Number);
    const at = h * 60 + m;
    return minutes >= at && minutes < at + 10 && sub.sent?.[r.id] !== date;
  });
}

async function sendDueReminders(env, now) {
  const { keys } = await env.KV.list({ prefix: 'push:' });
  for (const { name } of keys) {
    const sub = await env.KV.get(name, 'json');
    if (!sub) continue;
    const due = dueReminders(sub, now);
    if (!due.length) continue;
    const first = due[0];
    const status = await sendPush(env, sub, {
      title: first.title,
      body: due.map((r) => r.body).join(' '),
      url: first.url,
      tag: first.id,
    });
    if (status === 404 || status === 410) {
      // The browser dropped this subscription (app removed, permission revoked).
      await env.KV.delete(name);
      continue;
    }
    if (status >= 200 && status < 300) {
      const { date } = localClock(now, sub.timeZone);
      // Only today's marks are kept, so the record does not grow.
      const sent = Object.fromEntries(Object.entries(sub.sent ?? {}).filter(([, d]) => d === date));
      for (const r of due) sent[r.id] = date;
      await env.KV.put(name, JSON.stringify({ ...sub, sent }));
    }
  }
}

// ───────────────────────── Web Push (RFC 8030, 8291, 8292) ─────────────────────────

/** The server's signing keys for push (VAPID), made once and kept in storage. */
async function getVapid(env) {
  const stored = await env.KV.get('vapid', 'json');
  if (stored) return stored;
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const vapid = {
    publicKey: b64url(await crypto.subtle.exportKey('raw', pair.publicKey)),
    privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
  };
  await env.KV.put('vapid', JSON.stringify(vapid));
  return vapid;
}

/** The signed token that tells the push service which server is sending. */
async function vapidHeader(env, sub) {
  const vapid = await getVapid(env);
  const key = await crypto.subtle.importKey('jwk', vapid.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const part = (obj) => b64url(utf8(JSON.stringify(obj)));
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({
    aud: new URL(sub.endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: sub.origin,
  })}`;
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(unsigned));
  return `vapid t=${unsigned}.${b64url(signature)}, k=${vapid.publicKey}`;
}

async function hkdf(ikm, salt, info, bytes) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

const concat = (...arrays) => {
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
};

/** Encrypts a message for one browser (aes128gcm, RFC 8291): only that browser can read it. */
async function encryptPayload(p256dh, auth, plaintext) {
  const clientPublic = fromB64url(p256dh);
  const authSecret = fromB64url(auth);
  const server = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const serverPublic = new Uint8Array(await crypto.subtle.exportKey('raw', server.publicKey));
  const clientKey = await crypto.subtle.importKey('raw', clientPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: clientKey }, server.privateKey, 256));

  const ikm = await hkdf(shared, authSecret, concat(utf8('WebPush: info\0'), clientPublic, serverPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const contentKey = await hkdf(ikm, salt, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(ikm, salt, utf8('Content-Encoding: nonce\0'), 12);

  const aes = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt']);
  // 0x02 marks the end of the last (and only) record.
  const record = concat(utf8(plaintext), new Uint8Array([2]));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, record));

  const recordSize = new Uint8Array([0, 0, 16, 0]); // 4096
  return concat(salt, recordSize, new Uint8Array([serverPublic.length]), serverPublic, ciphertext);
}

/** Sends one notification; returns the push service's HTTP status (0 when it could not be reached). */
async function sendPush(env, sub, message) {
  const headers = { TTL: '3600', Urgency: 'normal', Authorization: await vapidHeader(env, sub) };
  let body;
  if (sub.p256dh && sub.auth) {
    body = await encryptPayload(sub.p256dh, sub.auth, JSON.stringify(message));
    headers['Content-Encoding'] = 'aes128gcm';
    headers['Content-Type'] = 'application/octet-stream';
  }
  try {
    const res = await fetch(sub.endpoint, { method: 'POST', headers, body });
    return res.status;
  } catch {
    return 0;
  }
}
