import SceneManager from '../../SceneManager/index.js';
import LiveCommandClient from '../../LiveCommandClient/index.js';
import { THREE_CDN_RESOURCES } from './utils/three-deps.js';

export async function bootstrapApp({ canvas, overlay, options = {} }) {
  const sceneManager = new SceneManager(canvas, options.sceneManager);
  await sceneManager.init();
  sceneManager.start();

  const client = new LiveCommandClient(options.liveCommand);
  client.bindSceneManager(sceneManager);
  if (options.liveCommand?.autoConnect !== false) {
    client.connect();
  }

  setupLatencyUI(client, overlay);
  registerServiceWorker();
  preloadThreeResources();

  return { sceneManager, client };
}

function setupLatencyUI(client, overlay) {
  if (!overlay) return;
  const statusEl = overlay.querySelector('[data-status]');
  const latencyEl = overlay.querySelector('[data-latency]');

  const setStatus = (text, cls) => {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.dataset.state = cls;
  };

  client.on('connecting', () => setStatus('接続中…', 'pending'));
  client.on('connected', () => setStatus('ライブ接続', 'ok'));
  client.on('disconnected', () => setStatus('切断', 'error'));
  client.on('error', () => setStatus('エラー', 'error'));

  if (latencyEl) {
    client.on('latency', ({ detail }) => {
      const { latency } = detail;
      latencyEl.textContent = `${Math.round(latency)} ms`;
      latencyEl.dataset.state = latency < 150 ? 'ok' : 'warn';
    });
  }
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/service_worker.js', { scope: '/' });
  } catch (error) {
    console.warn('Service worker registration failed', error);
  }
}

async function preloadThreeResources() {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open('chocodrop-three-preload');
    await Promise.all(THREE_CDN_RESOURCES.map(url => cache.add(url).catch(() => undefined)));
  } catch (error) {
    console.warn('Three.js preload skipped', error);
  }
}
