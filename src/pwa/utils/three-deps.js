const THREE_VERSION = '0.158.0';
const CDN_BASE = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}`;

/**
 * Three.js と付属モジュールを遅延読み込みするユーティリティ。
 * PWA 環境のため CDN 経由で取得しつつ Service Worker キャッシュが機能することを前提とする。
 */
export async function loadThree() {
  return import(`${CDN_BASE}/build/three.module.js`);
}

export async function loadOrbitControls() {
  const module = await import(`${CDN_BASE}/examples/jsm/controls/OrbitControls.js`);
  return module.OrbitControls;
}

export async function loadGLTFLoader() {
  const module = await import(`${CDN_BASE}/examples/jsm/loaders/GLTFLoader.js`);
  return module.GLTFLoader;
}

export async function loadDRACOLoader() {
  const module = await import(`${CDN_BASE}/examples/jsm/loaders/DRACOLoader.js`);
  return module.DRACOLoader;
}

export async function loadKTX2Loader() {
  const module = await import(`${CDN_BASE}/examples/jsm/loaders/KTX2Loader.js`);
  return module.KTX2Loader;
}

export async function loadRGBELoader() {
  const module = await import(`${CDN_BASE}/examples/jsm/loaders/RGBELoader.js`);
  return module.RGBELoader;
}

export const THREE_CDN_RESOURCES = [
  `${CDN_BASE}/build/three.module.js`,
  `${CDN_BASE}/examples/jsm/controls/OrbitControls.js`,
  `${CDN_BASE}/examples/jsm/loaders/GLTFLoader.js`,
  `${CDN_BASE}/examples/jsm/loaders/DRACOLoader.js`,
  `${CDN_BASE}/examples/jsm/loaders/KTX2Loader.js`,
  `${CDN_BASE}/examples/jsm/loaders/RGBELoader.js`
];
