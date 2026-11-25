// MTBA - Mahiyanganaya Bus Admin Scoped Service Worker
const CACHE_NAME = 'mtba-admin-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          }),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Strictly bypass service worker cache for API mutations, dynamic data, and Access login
  if (
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/cdn-cgi/')
  ) {
    return; // Pass through directly to network
  }

  // 2. Network-first strategy for Admin UI: always fetch freshest data, fall back to cache only when offline
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (url.pathname.startsWith('/admin/') || url.pathname.includes('/assets/'))
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        if (event.request.mode === 'navigate') {
          const fallback = await caches.match('/admin/');
          if (fallback) return fallback;
        }
        return new Response('Network offline', { status: 503, statusText: 'Offline' });
      }),
  );
});
