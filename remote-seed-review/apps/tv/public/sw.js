const CACHE_NAME = 'mahiyanganaya-tv-v5';
const PRECACHE_URLS = [
  './',
  './index.html',
  './credits-slide.webp',
  './credits-slide.png',
  './logos-only.png',
  './qr-only.png',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))),
    );
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignore non-GET and API / staff requests
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) {
    return;
  }

  // /schedule.json and /version.json must be Network-Only.
  // Never cache or serve from Service Worker cache because HTTP Date/X-Server-Time headers
  // must only reflect live network responses. Offline schedule is hydrated from localStorage.
  if (
    url.pathname.endsWith('/schedule.json') ||
    url.pathname.endsWith('/version.json') ||
    url.pathname.includes('/version.json')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Navigation requests: Network-First with Cache Fallback (with 2.5s network timeout on cold boot)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      new Promise((resolve) => {
        let finished = false;
        const fallbackToCache = async () => {
          if (finished) return;
          finished = true;
          const cached = await caches.match(event.request);
          if (cached) return resolve(cached);
          const indexCached =
            (await caches.match('./index.html')) ||
            (await caches.match('./')) ||
            (await caches.match('/tv/index.html')) ||
            (await caches.match('/tv/'));
          if (indexCached) return resolve(indexCached);
          resolve(fetch(event.request));
        };

        const timer = setTimeout(fallbackToCache, 2500);

        fetch(event.request)
          .then((response) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            resolve(response);
          })
          .catch(() => {
            clearTimeout(timer);
            fallbackToCache();
          });
      }),
    );
    return;
  }

  // Static TV assets (.js, .css, .png, .woff2, .woff, .svg, etc.):
  // Cache-First with Background Revalidation
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // Revalidate in background if online
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          fetch(event.request)
            .then((response) => {
              if (response && response.status === 200) {
                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
              }
            })
            .catch(() => {});
        }
        return cached;
      }
      return fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    }),
  );
});

