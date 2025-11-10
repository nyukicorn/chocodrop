import { bootstrapApp } from './app-shell.js';
import { loadThree } from './utils/three-deps.js';
import RemoteSceneLoader from '../client/remote/RemoteSceneLoader.js';
import { logger } from '../common/logger.js';

const uiLogger = logger.child('immersive-ui');

async function main() {
  const canvas = document.querySelector('#immersive-canvas');
  const overlay = document.querySelector('[data-overlay]');

  const { sceneManager } = await bootstrapApp({
    canvas,
    overlay,
    options: {
      sceneManager: {
        background: '#020817',
        onBeforeRender: delta => {
          // 軽量なフレームタイミング可視化
          performance.mark('frame-end');
        }
      },
      liveCommand: {
        autoConnect: true
      }
    }
  });

  const THREE = await loadThree();
  createDefaultEnvironment(THREE, sceneManager);
  setupXRControls(sceneManager);
  setupRemoteSceneLoader(sceneManager);
}

function createDefaultEnvironment(THREE, sceneManager) {
  const floorGeometry = new THREE.CylinderGeometry(7, 7, 0.2, 48);
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.8,
    metalness: 0.05
  });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.receiveShadow = true;
  floor.position.y = -0.1;

  const ambient = new THREE.AmbientLight(0xffffff, 0.3);
  const pulseLight = new THREE.PointLight(0x60a5fa, 2, 10);
  pulseLight.position.set(0, 2.5, 0);

  const ringGeometry = new THREE.TorusGeometry(2.5, 0.12, 16, 100);
  const ringMaterial = new THREE.MeshStandardMaterial({
    color: 0x7dd3fc,
    emissive: 0x1d4ed8,
    emissiveIntensity: 0.6
  });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.4;

  sceneManager.scene.add(floor);
  sceneManager.scene.add(ambient);
  sceneManager.scene.add(pulseLight);
  sceneManager.scene.add(ring);

  let t = 0;
  sceneManager.options.onBeforeRender = delta => {
    t += delta / 800;
    pulseLight.intensity = 1.5 + Math.sin(t) * 0.6;
    ring.material.emissiveIntensity = 0.4 + Math.abs(Math.sin(t)) * 0.4;
  };
}

function setupXRControls(sceneManager) {
  const statusEl = document.querySelector('[data-xr-status]');
  const vrButton = document.querySelector('[data-action=\"enter-vr\"]');
  const arButton = document.querySelector('[data-action=\"enter-ar\"]');

  const setStatus = (text, state = 'idle') => {
    statusEl.textContent = text;
    statusEl.dataset.state = state;
  };

  if (!navigator.xr) {
    setStatus('このブラウザはWebXRに対応していません', 'error');
    vrButton.disabled = true;
    arButton.disabled = true;
    return;
  }

  let arSupported = false;
  sceneManager.isSessionSupported('ar').then(supported => {
    arSupported = supported;
    if (!supported) {
      arButton.disabled = true;
      arButton.title = 'このデバイスは AR セッションをサポートしていません';
      setStatus('このデバイスは AR セッションをサポートしていません', 'error');
    }
  });

  const enableButtons = () => {
    vrButton.disabled = false;
    arButton.disabled = !arSupported;
  };

  const handleEnter = async mode => {
    vrButton.disabled = true;
    arButton.disabled = true;
    setStatus(`${mode === 'ar' ? 'AR' : 'VR'}セッションを初期化中…`, 'pending');
    try {
      const overlayRoot = document.body;
      await sceneManager.enterXR(mode, mode === 'ar' ? { domOverlayRoot: overlayRoot } : {});
      setStatus(`${mode === 'ar' ? 'AR' : 'VR'}セッション中`, 'ok');
    } catch (error) {
      uiLogger.error('XR start failed', error);
      setStatus(`${mode === 'ar' ? 'AR' : 'VR'}開始に失敗しました`, 'error');
      enableButtons();
    }
  };

  vrButton.addEventListener('click', () => handleEnter('vr'), { passive: true });
  arButton.addEventListener('click', () => handleEnter('ar'), { passive: true });

  sceneManager.on('xr:entered', ({ detail }) => {
    setStatus(`${detail.mode === 'immersive-ar' ? 'AR' : 'VR'}セッション中`, 'ok');
  });

  sceneManager.on('xr:exit', () => {
    setStatus('XR待機中', 'idle');
    enableButtons();
  });

  sceneManager.on('xr:error', () => {
    setStatus('XR開始に失敗しました', 'error');
    enableButtons();
  });
}

function setupRemoteSceneLoader(sceneManager) {
  const form = document.querySelector('[data-remote-form]');
  const stage = document.querySelector('[data-remote-container]');
  if (!form || !stage) return;

  const urlInput = form.querySelector('input[type="url"]');
  const statusEl = form.querySelector('[data-remote-status]');
  const detailEl = form.querySelector('[data-remote-detail]');
  const actionsEl = form.querySelector('[data-remote-actions]');
  const auditBadge = form.querySelector('[data-remote-audit]');
  const pulseEl = document.querySelector('[data-remote-pulse]');
  const proxyButton = form.querySelector('[data-action="remote-proxy"]');
  const downloadButton = form.querySelector('[data-action="remote-download"]');

  const trustedOrigins = new Set([
    window.location.origin,
    'https://nyukicorn.github.io',
    'https://threejs.org'
  ]);

  const loader = new RemoteSceneLoader({
    container: stage,
    serviceWorker: navigator.serviceWorker,
    proxyEndpoint: '/proxy',
    telemetry: entry => uiLogger.debug('[RemoteSceneLoader]', entry)
  });

  const setStatus = (text, state = 'idle') => {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.dataset.state = state;
  };

  const setDetail = text => {
    if (!detailEl) return;
    detailEl.textContent = text ?? '';
  };

  const setActionsVisible = visible => {
    if (!actionsEl) return;
    actionsEl.dataset.active = visible ? 'true' : 'false';
  };

  const setAuditLabel = label => {
    if (auditBadge) {
      auditBadge.textContent = label;
    }
  };

  const setPulse = (mode, label) => {
    if (!pulseEl) return;
    pulseEl.dataset.state = mode;
    pulseEl.textContent = label;
  };

  loader.setContainer(stage);
  stage.dataset.state = 'idle';

  loader.on('progress', event => {
    const stageName = event?.detail?.stage;
    if (stageName === 'probing') {
      stage.dataset.state = 'pending';
      setStatus('セキュリティ診断中…', 'pending');
      setAuditLabel('Zero-Trust');
      setPulse('direct', 'Standby');
    }
    if (stageName === 'loading-iframe') {
      setStatus('リモートシーンを読み込み中…', 'pending');
    }
    if (stageName === 'loading-proxy') {
      setStatus('Proxy Relay 経由でロード中…', 'pending');
      setPulse('proxy', 'Proxy Relay');
    }
  });

  loader.on('analyzed', event => {
    const metadata = event?.detail?.metadata;
    if (!metadata?.url) return;
    setDetail(new URL(metadata.url).hostname);
  });

  loader.on('loaded', event => {
    const { metadata, viaProxy } = event.detail || {};
    if (metadata?.url) {
      const origin = new URL(metadata.url).origin;
      trustedOrigins.add(origin);
      setDetail(origin);
    }
    setStatus('リモートシーンを埋め込みました', 'ok');
    setActionsVisible(false);
    setAuditLabel(viaProxy ? 'Proxy Relay' : 'Direct Secure');
    setPulse(viaProxy ? 'proxy' : 'direct', viaProxy ? 'Proxy Relay' : 'Direct');
    stage.dataset.state = 'loaded';
  });

  loader.on('fallback', event => {
    const reason = event?.detail?.reason || 'CORS制限のため直接読み込めません';
    setStatus(reason, 'error');
    setActionsVisible(true);
    stage.dataset.state = 'idle';
  });

  loader.on('error', event => {
    const reason = event?.detail?.error?.message || '読み込みに失敗しました';
    setStatus(reason, 'error');
    setActionsVisible(true);
    stage.dataset.state = 'idle';
    setPulse('proxy', 'Retry Needed');
  });

  window.addEventListener('message', messageEvent => {
    if (!trustedOrigins.has(messageEvent.origin)) return;
    const data = messageEvent.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'chocodrop:telemetry' && data.latency) {
      setPulse('direct', `${messageEvent.origin.replace(/^https?:\/\//, '')} · ${Math.round(data.latency)}ms`);
    }
    if (data.type === 'chocodrop:status' && data.message) {
      setStatus(data.message, 'ok');
    }
  });

  const startLoad = ({ preferProxy = false } = {}) => {
    const normalized = normalizeRemoteUrl(urlInput.value.trim());
    if (!normalized) {
      setStatus('URLの形式が正しくありません', 'error');
      setActionsVisible(true);
      return;
    }
    stage.dataset.state = 'pending';
    setStatus('セキュリティ診断中…', 'pending');
    setDetail(new URL(normalized).hostname);
    setActionsVisible(false);
    loader.load(normalized, { autoProxy: preferProxy }).catch(error => {
      uiLogger.warn('Remote scene load failed', error);
      setStatus(error?.message || 'リモートシーンの読み込みに失敗しました', 'error');
      setActionsVisible(true);
      stage.dataset.state = 'idle';
    });
  };

  form.addEventListener('submit', event => {
    event.preventDefault();
    startLoad();
  });

  proxyButton?.addEventListener('click', () => {
    startLoad({ preferProxy: true });
  });

  downloadButton?.addEventListener('click', () => {
    const normalized = normalizeRemoteUrl(urlInput.value.trim());
    if (normalized) {
      window.open(normalized, '_blank', 'noopener');
    }
  });

  setStatus('GitHub Pages / threejs.org などのURLを入力してください。', 'idle');
  setDetail('コネクション未確立');
  setActionsVisible(false);
}

function normalizeRemoteUrl(value) {
  if (!value) return null;
  try {
    return new URL(value).toString();
  } catch {
    try {
      return new URL(`https://${value}`).toString();
    } catch {
      return null;
    }
  }
}

main().catch(error => {
  uiLogger.error('immersive bootstrap failed', error);
  const overlay = document.querySelector('[data-overlay]');
  if (overlay) {
    overlay.dataset.state = 'error';
    overlay.querySelector('[data-status]').textContent = '初期化に失敗しました';
  }
});
