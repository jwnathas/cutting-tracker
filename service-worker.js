const CACHE_NAME = 'cutting-tracker-v11';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keyList) => Promise.all(
      keyList.map((key) => { if (key !== CACHE_NAME) return caches.delete(key); })
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      return cached || fetch(e.request).then((netRes) => {
        if (!netRes || netRes.status !== 200 || (netRes.type !== 'basic' && netRes.type !== 'cors')) return netRes;
        const resClone = netRes.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
        return netRes;
      }).catch(() => console.warn('Offline e sem cache para:', e.request.url));
    })
  );
});