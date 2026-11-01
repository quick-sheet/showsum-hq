/* Showsum HQ service worker: keeps the app shell for offline opening. Never caches anything from your scripts. */
const CACHE = 'showsum-hq-v2';
const SHELL = [
  './',
  'index.html',
  'config.js?v=2',
  'hq.css?v=2',
  'hq.js?v=2',
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
    // config.js skips the browser's own 10-minute copy (GitHub Pages sends max-age=600) and asks GitHub each time.
    const nav = req.mode === 'navigate';
    const key = nav ? 'index.html' : 'config.js?v=2';
    e.respondWith(
      fetch(req, nav ? undefined : { cache: 'no-cache' }).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); }
        return res;
      }).catch(() => caches.match(key))
    );
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
