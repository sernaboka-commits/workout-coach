/* sw.js — service worker: офлайн-доступ после первой загрузки.
 * Стратегия network-first (свежая версия при сети, кеш — когда офлайн).
 * Приложение целиком в index.html (CSS/JS инлайнятся сборкой),
 * поэтому кешируем только корень, манифест и иконки.
 * Версию бампать при изменениях, чтобы старый кеш вычищался. */
const CACHE = 'workout-coach-v11';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((m) => m || caches.match('./index.html')))
  );
});
