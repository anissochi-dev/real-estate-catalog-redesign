// Service Worker для показа фирменной офлайн-заглушки вместо стандартной
// ошибки браузера, когда у пользователя пропадает интернет.
// Кеширует ТОЛЬКО offline.html и его иконку — никакого офлайн-режима
// для остального сайта не создаёт (сайт всегда должен показывать свежие данные).

const CACHE_NAME = 'bmn-offline-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Реагируем только на переходы по страницам (навигация), не трогаем
  // запросы к API/картинкам/скриптам — они должны падать как обычно.
  if (event.request.mode !== 'navigate') return;

  event.respondWith(
    fetch(event.request).catch(() =>
      caches.open(CACHE_NAME).then((cache) => cache.match(OFFLINE_URL))
    )
  );
});
