const CACHE_NAME = 'chocodrop-pwa-v1';
const PRECACHE_URLS = [
  '/',
  '/immersive.html',
  '/importer.html',
  '/bookmarklet.js',
  '/service_worker.js',
  '/opfs_store.js',
  '/SceneManager/index.js',
  '/LiveCommandClient/index.js',
  '/src/pwa/app-shell.js',
  '/src/pwa/immersive.js',
  '/src/pwa/importer.js',
  '/src/pwa/utils/three-deps.js'
];

const THREE_RESOURCES = [
  'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js',
  'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/controls/OrbitControls.js',
  'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/loaders/GLTFLoader.js',
  'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/loaders/DRACOLoader.js',
  'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/loaders/KTX2Loader.js',
  'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/loaders/RGBELoader.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll([...PRECACHE_URLS, ...THREE_RESOURCES]))
      .catch(error => console.warn('Precaching failed', error))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone)).catch(() => {});
        return response;
      });
    })
  );
});

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
