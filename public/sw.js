/* Fitlog service worker: lets the installed web app start without internet.
 *
 * - Pages: network first, so a new version shows up as soon as you're online;
 *   offline it falls back to the cached app shell.
 * - Bundled scripts, fonts and images (/_expo/, /assets/): cache first. Their
 *   file names contain a content hash, so a cached copy never goes stale.
 * - Other files (manifest, icons): network first, cache as offline fallback,
 *   so a new icon or theme colour shows up.
 * - Requests to other sites (the Claude API) and to this app's own API are
 *   never touched.
 * - Reminder notifications: shows the message a push carries and opens the app
 *   on the right screen when it is tapped.
 *
 * Bump CACHE when the caching rules change; old caches are deleted on activate.
 */
const CACHE = 'fitlog-v2';
const SHELL = ['/', '/manifest.json', '/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // The API (backup, reminders) always goes to the network and is never cached.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  const store = (response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  };

  const hashed = url.pathname.startsWith('/_expo/') || url.pathname.startsWith('/assets/');
  if (hashed) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then(store)));
    return;
  }

  event.respondWith(fetch(request).then(store).catch(() => caches.match(request)));
});

self.addEventListener('push', (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    // A push without a readable message still has to show something (iOS requires it).
  }
  event.waitUntil(
    self.registration.showNotification(message.title || 'Fitlog', {
      body: message.body || 'Tijd voor je herinnering.',
      tag: message.tag || 'fitlog',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: message.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
