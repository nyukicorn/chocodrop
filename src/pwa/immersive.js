import { bootstrapApp } from './app-shell.js';
import { loadThree } from './utils/three-deps.js';
import RemoteSceneLoader from './remote/RemoteSceneLoader.js';

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
  setupRemoteLoader(sceneManager);
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
      await sceneManager.enterXR(mode);
      setStatus(`${mode === 'ar' ? 'AR' : 'VR'}セッション中`, 'ok');
    } catch (error) {
      console.error(error);
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

function setupRemoteLoader(sceneManager) {
  const panel = document.querySelector('[data-remote-panel]');
  const container = document.querySelector('[data-remote-container]');
  if (!panel || !container) return;

  const urlInput = panel.querySelector('[data-remote-url]');
  const statusEl = panel.querySelector('[data-remote-status]');
  const actionsEl = panel.querySelector('[data-remote-actions]');
  if (!urlInput || !statusEl || !actionsEl) return;

  const loader = new RemoteSceneLoader({
    proxyOrigin: location.origin,
    log: (event, payload) => console.debug('[RemoteSceneLoader]', event, payload)
  });

  const renderRecoveryActions = recovery => {
    actionsEl.innerHTML = '';
    if (!recovery?.actions) return;
    recovery.actions
      .filter(action => action.available !== false)
      .forEach(action => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = action.label;
        btn.style.background = 'linear-gradient(135deg, #22d3ee, #3b82f6)';
        btn.style.padding = '0.4rem 0.9rem';
        btn.style.borderRadius = '999px';
        btn.style.border = 'none';
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', () => {
          if (action.type === 'proxy') {
            triggerLoad(true);
          } else if (action.type === 'guide' && action.url) {
            window.open(action.url, '_blank', 'noopener');
          } else if (action.type === 'download') {
            sceneManager?.emit?.('remote:download', { url: recovery.url });
            alert('CORS制限のためダウンロードしてローカルから読み込んでください。');
          }
        });
        actionsEl.appendChild(btn);
      });
  };

  loader.addEventListener('analyze', ({ detail }) => {
    if (!detail) return;
    const flavor = detail.needsProxy ? 'プロキシ推奨' : '直接読み込み可能';
    statusEl.textContent = `${detail.url} を解析しました (${flavor})`;
    renderRecoveryActions(null);
  });

  loader.addEventListener('loaded', ({ detail }) => {
    if (!detail) return;
    statusEl.textContent = detail.useProxy ? 'プロキシ経由で読み込みました' : 'リモートシーンを読み込みました';
    container.classList.add('visible');
  });

  loader.addEventListener('error', ({ detail }) => {
    if (!detail) return;
    statusEl.textContent = 'リモートシーンの読み込みに失敗しました';
    renderRecoveryActions(detail.recovery);
  });

  const triggerAnalysis = async () => {
    const value = urlInput.value.trim();
    if (!value) {
      statusEl.textContent = 'URLを入力してください';
      return;
    }
    try {
      statusEl.textContent = 'URLを解析中…';
      await loader.analyze(value);
    } catch (error) {
      statusEl.textContent = error?.message || 'URL解析に失敗しました';
    }
  };

  const triggerLoad = async (useProxy = false) => {
    const value = urlInput.value.trim();
    if (!value) {
      statusEl.textContent = 'URLを入力してください';
      return;
    }
    try {
      statusEl.textContent = useProxy ? 'プロキシ経由で読み込み中…' : 'リモートシーンを読み込み中…';
      await loader.load(container, value, { forceProxy: useProxy });
      renderRecoveryActions(null);
    } catch (error) {
      statusEl.textContent = error?.message || 'リモートシーンの読み込みに失敗しました';
    }
  };

  const scanBtn = panel.querySelector('[data-action="remote-scan"]');
  const openBtn = panel.querySelector('[data-action="remote-open"]');
  const proxyBtn = panel.querySelector('[data-action="remote-proxy"]');
  const closeBtn = panel.querySelector('[data-action="remote-close"]');

  scanBtn?.addEventListener('click', triggerAnalysis);
  openBtn?.addEventListener('click', () => triggerLoad(false));
  proxyBtn?.addEventListener('click', () => triggerLoad(true));
  closeBtn?.addEventListener('click', () => {
    container.classList.remove('visible');
    container.innerHTML = '';
    statusEl.textContent = 'プレビューを閉じました';
    renderRecoveryActions(null);
  });
}

main().catch(error => {
  console.error('immersive bootstrap failed', error);
  const overlay = document.querySelector('[data-overlay]');
  if (overlay) {
    overlay.dataset.state = 'error';
    overlay.querySelector('[data-status]').textContent = '初期化に失敗しました';
  }
});
