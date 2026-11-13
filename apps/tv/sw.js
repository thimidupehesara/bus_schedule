/* global self, caches, PRECACHE, CACHE_NAME, clients, Request, URL, AbortController, setTimeout, clearTimeout, fetch, Response */
const index = '/tv/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('bus-tv-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    !url.pathname.startsWith('/tv/')
  )
    return;
  if (request.mode === 'navigate' && (url.pathname === '/tv/' || url.pathname === index)) {
    event.respondWith(
      (async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        try {
          const response = await fetch(request, { signal: controller.signal });
          if (response.ok) return response;
        } catch {
          // Use the precached shell.
        } finally {
          clearTimeout(timer);
        }
        return (await caches.open(CACHE_NAME))
          .match(index)
          .then((response) => response ?? Response.error());
      })(),
    );
  } else if (PRECACHE.includes(url.pathname) && url.pathname !== index) {
    event.respondWith(
      caches
        .open(CACHE_NAME)
        .then((cache) => cache.match(url.pathname))
        .then((response) => response ?? fetch(request)),
    );
  }
});
