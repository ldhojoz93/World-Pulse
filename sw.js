// World Pulse service worker: opens offline and shows the last data it saw.
const SHELL = 'wp-shell-v1';
const DATA = 'wp-data-v1';
const SHELL_FILES = [
  './', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== SHELL && k !== DATA).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Map tiles and images: cache-first, they rarely change.
  if (url.hostname.endsWith('tile.openstreetmap.org') || req.destination === 'image') {
    e.respondWith(caches.open(DATA).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      try { const r = await fetch(req); if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }
      catch (err) { return hit || Response.error(); }
    }));
    return;
  }

  // App files: cache-first, refreshed in the background.
  if (SHELL_FILES.some(f => req.url === new URL(f, self.location).href) || req.mode === 'navigate') {
    e.respondWith(caches.open(SHELL).then(async c => {
      const hit = await c.match(req, { ignoreSearch: true }) || await c.match('./index.html');
      const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  // Live data (news, quakes, weather, scores): network-first, fall back to last saved copy.
  e.respondWith(caches.open(DATA).then(async c => {
    try {
      const r = await fetch(req);
      if (r.ok) c.put(req, r.clone());
      return r;
    } catch (err) {
      const hit = await c.match(req);
      return hit || Response.error();
    }
  }));
});
