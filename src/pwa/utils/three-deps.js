export const THREE_VERSION = '0.158.0';

export function getThreeCdnBase(version = THREE_VERSION) {
  const normalized = String(version || THREE_VERSION).trim();
  const tag = normalized.startsWith('r') ? normalized.slice(1) : normalized;
  const resolved = tag === 'latest' ? 'latest' : normalized.startsWith('0.') ? normalized : `0.${tag}.0`;
  return `https://cdn.jsdelivr.net/npm/three@${resolved}`;
}

export const THREE_CDN_BASE = getThreeCdnBase();

/**
 * Three.js と付属モジュールを遅延読み込みするユーティリティ。
 * PWA 環境のため CDN 経由で取得しつつ Service Worker キャッシュが機能することを前提とする。
 */
export async function loadThree() {
  return import(`${THREE_CDN_BASE}/build/three.module.js`);
}

export async function loadOrbitControls() {
  const module = await import(`${THREE_CDN_BASE}/examples/jsm/controls/OrbitControls.js`);
  return module.OrbitControls;
}

export async function loadGLTFLoader() {
  const module = await import(`${THREE_CDN_BASE}/examples/jsm/loaders/GLTFLoader.js`);
  return module.GLTFLoader;
}

export async function loadDRACOLoader() {
  const module = await import(`${THREE_CDN_BASE}/examples/jsm/loaders/DRACOLoader.js`);
  return module.DRACOLoader;
}

export async function loadKTX2Loader() {
  const module = await import(`${THREE_CDN_BASE}/examples/jsm/loaders/KTX2Loader.js`);
  return module.KTX2Loader;
}

export async function loadRGBELoader() {
  const module = await import(`${THREE_CDN_BASE}/examples/jsm/loaders/RGBELoader.js`);
  return module.RGBELoader;
}

export const THREE_CDN_RESOURCES = [
  `${THREE_CDN_BASE}/build/three.module.js`,
  `${THREE_CDN_BASE}/examples/jsm/controls/OrbitControls.js`,
  `${THREE_CDN_BASE}/examples/jsm/loaders/GLTFLoader.js`,
  `${THREE_CDN_BASE}/examples/jsm/loaders/DRACOLoader.js`,
  `${THREE_CDN_BASE}/examples/jsm/loaders/KTX2Loader.js`,
  `${THREE_CDN_BASE}/examples/jsm/loaders/RGBELoader.js`
];

export function resolveThreeResource(path = '', version = THREE_VERSION) {
  const normalized = String(path).replace(/^\/+/, '');
  const base = getThreeCdnBase(version);
  return `${base}/${normalized}`;
}
