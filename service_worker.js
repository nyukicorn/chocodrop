const CACHE_VERSION = '2025-11-06';
const CORE_CACHE = `chocodrop-core-${CACHE_VERSION}`;
const XR_CACHE = `chocodrop-xr-${CACHE_VERSION}`;
const SCENE_CACHE = `chocodrop-scenes-${CACHE_VERSION}`;

const CACHE_WHITELIST = new Set([CORE_CACHE, XR_CACHE, SCENE_CACHE]);

const CORE_ASSETS = [
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
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png'
];

const XR_ASSETS = [
  '/src/client/xr/XRBridgeLoader.js',
  '/src/pwa/remote/RemoteSceneLoader.js',
  '/src/client/SceneManager.js',
  '/src/pwa/utils/three-deps.js'
];

const XR_CDN_RESOURCES = [
  'https://cdn.jsdelivr.net/npm/es-module-shims@1.10.0/dist/es-module-shims.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js',
  'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/controls/OrbitControls.js',
  'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/loaders/GLTFLoader.js',
  'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/loaders/DRACOLoader.js',
  'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/loaders/KTX2Loader.js',
  'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/loaders/RGBELoader.js'
];

const XR_PATTERNS = [
  /\/src\/client\/xr\//,
  /\/src\/pwa\/remote\//
];

const CORE_ASSET_SET = new Set(CORE_ASSETS);
const XR_ASSET_SET = new Set(XR_ASSETS);
const XR_CDN_URLS = new Set(XR_CDN_RESOURCES);

const cachesReady = {
  core: false,
  xr: false
};

self.addEventListener('install', event => {
  event.waitUntil(precacheAll());
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(cleanupOldCaches());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  const cacheName = selectCache(request);
  if (!cacheName) {
    return;
  }

  if (cacheName === XR_CACHE) {
    event.respondWith(cacheFirst(request, cacheName));
    return;
  }

  if (cacheName === SCENE_CACHE) {
    event.respondWith(networkFirst(request, cacheName));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, cacheName));
});

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
  if (event.data === 'clearCaches') {
    event.waitUntil(clearAllCaches());
  }
});

async function precacheAll() {
  await Promise.all([
    populateCache(CORE_CACHE, CORE_ASSETS).then(() => {
      cachesReady.core = true;
    }),
    populateCache(XR_CACHE, [...XR_ASSETS, ...XR_CDN_RESOURCES]).then(() => {
      cachesReady.xr = true;
    })
  ]);
}

async function populateCache(cacheName, assets) {
  const cache = await caches.open(cacheName);
  await Promise.all(
    assets.map(async url => {
      try {
        await cache.add(url);
      } catch (error) {
        console.warn('Precaching skipped', url, error?.message || error);
      }
    })
  );
}

async function cleanupOldCaches() {
  if (!Object.values(cachesReady).every(Boolean)) {
    console.warn('Skipping cache cleanup because new caches are not fully populated');
  }
  const keys = await caches.keys();
  await Promise.all(
    keys.map(key => {
      if (CACHE_WHITELIST.has(key)) {
        return null;
      }
      if (!Object.values(cachesReady).every(Boolean) && key.startsWith('chocodrop-')) {
        return null;
      }
      return caches.delete(key);
    })
  );
  await self.clients.claim();
}

async function clearAllCaches() {
  const keys = await caches.keys();
  await Promise.all(keys.map(key => caches.delete(key)));
}

function selectCache(request) {
  const url = new URL(request.url);

  if (XR_ASSET_SET.has(url.pathname) || XR_PATTERNS.some(pattern => pattern.test(url.pathname)) || XR_CDN_URLS.has(url.href)) {
    return XR_CACHE;
  }

  if (url.origin === location.origin) {
    if (url.pathname.startsWith('/remote/')) {
      return SCENE_CACHE;
    }
    if (CORE_ASSET_SET.has(url.pathname) || request.destination === 'document') {
      return CORE_CACHE;
    }
  }

  return null;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  try {
    const response = await fetch(request);
    cache.put(request, response.clone());
    return response;
  } catch (error) {
    return cached || Response.error();
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then(response => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || networkPromise;
}
