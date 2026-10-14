// v4: round 2. Fonts are now bundled under /assets with the rest of the app, so nothing is
// fetched from Google any more. The new cache name clears the old v3 cache on activate.
const CACHE = 'diamond-v4';
const CORE = [
  './',
  './index.html',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(CORE.map(u => cache.add(u)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return; // never touch POSTs (sync, AI, etc.)
  const url = new URL(req.url);

  // Always go to network for live data — never cache these
  if (url.pathname.includes('/.netlify/functions/') ||
      url.hostname.includes('anthropic.com') ||
      url.hostname.includes('whoop.com')) {
    return;
  }

  // App shell: network-first, fall back to cached page when offline
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const net = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put('./index.html', net.clone());
        return net;
      } catch (err) {
        const cache = await caches.open(CACHE);
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Everything else (scripts, styles, fonts): cache-first, then network. Safe for Vite assets because
  // their file names change whenever their content changes, so a cached copy is never out of date.
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    try {
      const net = await fetch(req);
      if (net && (net.ok || net.type === 'opaque')) cache.put(req, net.clone());
      return net;
    } catch (err) {
      return hit || Response.error();
    }
  })());
});

// boot.js asks a newly installed worker to take over straight away.
self.addEventListener('message', e => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });
