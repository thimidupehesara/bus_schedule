/* global self, caches, PRECACHE, CACHE_NAME, clients, URL, setTimeout, clearTimeout, fetch, Response */
const index = '/tv/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
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
            .map((key) => caches.delete(key))
        )
      )
      .then(() => clients.claim())
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
    event.respondWith(navigationResponse(request));
  } else if (PRECACHE.indexOf(url.pathname) !== -1 && url.pathname !== index) {
    event.respondWith(
      caches
        .open(CACHE_NAME)
        .then((cache) => cache.match(url.pathname))
        .then((response) => (response != null ? response : fetch(request)))
    );
  }
});

// Chrome 52 supports Promise.race but lacks AbortController in workers.
function navigationResponse(request) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), 3000);
  });
  const network = fetch(request).then(
    (response) => (response.ok ? response : null),
    () => null
  );
  return Promise.race([network, timeout]).then((response) => {
    clearTimeout(timer);
    if (response != null) return response;
    return caches
      .open(CACHE_NAME)
      .then((cache) => cache.match(index))
      .then((cached) => (cached != null ? cached : Response.error()));
  });
}
