/* Showsum HQ service worker: keeps the app shell for offline opening. Never caches anything from your scripts. */
const CACHE = 'showsum-hq-v1';
const SHELL = [
  './',
  'index.html',
  'config.js?v=1',
  'hq.css?v=1',
  'hq.js?v=1',
  'manifest.webmanifest',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('showsum-hq-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Google sign-in, fonts and your scripts go straight to the network
  const fresh = req.mode === 'navigate' || url.pathname.endsWith('/config.js');
  if (fresh) {
    // The page and config.js: network first, so your edits arrive at once; the saved copy when offline.
    const key = req.mode === 'navigate' ? 'index.html' : 'config.js?v=1';
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); }
        return res;
      }).catch(() => caches.match(key))
    );
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
