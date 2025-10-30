const CACHE_VERSION = 'chocodrop-pwa-v1';
const BUNDLE_VERSION = '20251011025008';

const APP_SHELL = [
  '/',
  '/index.html',
  '/immersive.html',
  '/manifest.webmanifest',
  '/pwa-bootstrap.js',
  '/immersive-launcher.js',
  '/load-chocodrop.js',
  '/load-three.js',
  '/bootstrap.js',
  '/CommandUI.js',
  '/SceneManager.js',
  '/LiveCommandClient.js',
  '/translation-dictionary.js',
  '/index.js',
  `/chocodrop-demo.umd.min.js?v=${BUNDLE_VERSION}`,
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

function isNavigationRequest(request) {
  return request.mode === 'navigate' ||
    (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'));
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    if (isNavigationRequest(request)) {
      return cache.match('/immersive.html') || cache.match('/index.html');
    }
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (isNavigationRequest(request)) {
      event.respondWith(networkFirst(request));
      return;
    }

    if (APP_SHELL.includes(url.pathname) || APP_SHELL.includes(url.pathname + url.search)) {
      event.respondWith(cacheFirst(request));
      return;
    }

    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    )
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
