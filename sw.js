/* Showsum HQ service worker: keeps the app shell for offline opening (Exhibitors is part of it since release 8). Never caches anything from your scripts. */
const CACHE = 'showsum-hq-v8';
const SHELL = [
  './',
  'index.html',
  'config.js?v=8',
  'hq.css?v=8',
  'exhibitors/core.js?v=8',
  'exhibitors.js?v=8',
  'hq.js?v=8',
  'manifest.webmanifest',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png',
  'exhibitors/index.html',
  'exhibitors/forward.js?v=8',
  'exhibitors/diary-baby.json',
  'exhibitors/diary-crafts.json',
  'exhibitors/diary-christmas.json'
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
    // each page keeps its own copy: HQ itself, or the old Exhibitors address, which forwards into HQ (a share arrives there, with ?url=)
    const key = nav ? (/\/exhibitors\/(index\.html)?$/.test(url.pathname) ? 'exhibitors/index.html' : 'index.html') : 'config.js?v=8';
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
