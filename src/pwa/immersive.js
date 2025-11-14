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
  const environment = createDefaultEnvironment(THREE, sceneManager);
  setupXRControls(sceneManager);
  setupAssetStatus(sceneManager);
  setupRemoteSceneLoader(sceneManager);
  setupEnvironmentToggle(environment);
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
  return { floor, ambient, pulseLight, ring, sceneManager };
}

function setupEnvironmentToggle(environment) {
  const toggle = document.querySelector('[data-action="toggle-environment"]');
  if (!toggle || !environment) return;
  const setVisible = visible => {
    ['floor', 'ambient', 'pulseLight', 'ring'].forEach(key => {
      if (environment[key]) {
        environment[key].visible = visible;
      }
    });
  };
  toggle.addEventListener('change', event => setVisible(event.target.checked));
  setVisible(toggle.checked);
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
      const attempt = async useOverlay => {
        if (mode !== 'ar') {
          await sceneManager.enterXR(mode, {});
          return;
        }
        const options = useOverlay ? { domOverlayRoot: overlayRoot } : {};
        await sceneManager.enterXR('ar', options);
      };

      try {
        await attempt(true);
      } catch (error) {
        const message = error?.message || '';
        if (mode === 'ar' && message.includes('dom-overlay')) {
          await attempt(false);
        } else {
          throw error;
        }
      }

      // XRInteractionManagerが有効になっていることを確認
      if (sceneManager.xr && sceneManager.xr.interaction) {
        uiLogger.info('XRInteractionManager enabled');
      } else {
        uiLogger.warn('XRInteractionManager not available');
      }

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

function setupAssetStatus(sceneManager) {
  const statusEl = document.querySelector('[data-asset-status]');
  const listEl = document.querySelector('[data-asset-list]');
  const clearBtn = document.querySelector('[data-action="clear-assets"]');
  if (!statusEl) return;

  const assets = new Map();

  const setStatus = (text, state = 'idle') => {
    statusEl.textContent = text;
    statusEl.dataset.state = state;
  };

  const renderList = () => {
    if (!listEl) return;
    listEl.innerHTML = '';
    if (!assets.size) {
      const empty = document.createElement('li');
      empty.dataset.empty = 'true';
      empty.textContent = 'メディアなし';
      listEl.appendChild(empty);
    } else {
      assets.forEach(asset => {
        const li = document.createElement('li');
        li.dataset.assetId = asset.id;
        const label = document.createElement('span');
        label.textContent = `${getAssetIcon(asset.kind)} ${asset.fileName || asset.kind}`;
        const buttonGroup = document.createElement('span');
        buttonGroup.className = 'media-action-group';

        if (asset.kind === 'video') {
          const audioBtn = document.createElement('button');
          audioBtn.type = 'button';
          audioBtn.dataset.action = 'toggle-audio';
          audioBtn.dataset.assetId = asset.id;
          audioBtn.textContent = asset.muted ? '🔇' : '🔊';
          buttonGroup.appendChild(audioBtn);
        }

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.dataset.action = 'remove-asset';
        removeBtn.dataset.assetId = asset.id;
        removeBtn.textContent = '削除';
        buttonGroup.appendChild(removeBtn);

        li.appendChild(label);
        li.appendChild(buttonGroup);
        listEl.appendChild(li);
      });
    }
    if (clearBtn) {
      clearBtn.disabled = assets.size === 0;
    }
  };

  const registerAsset = asset => {
    if (!asset?.id) return;
    assets.set(asset.id, asset);
    renderList();
  };

  const removeAsset = id => {
    if (!id) return;
    assets.delete(id);
    renderList();
  };

  setStatus('メディア待機中', 'idle');
  sceneManager.listAssets().forEach(asset => registerAsset(asset));
  renderList();

  sceneManager.on('asset:added', ({ detail }) => {
    const meta = detail?.object?.userData?.asset || detail?.payload;
    if (meta) {
      registerAsset(meta);
      const label = meta.fileName || meta.kind || 'メディア';
      setStatus(`${label} を受信`, 'ok');
    }
  });
  sceneManager.on('asset:removed', ({ detail }) => {
    removeAsset(detail?.id || detail?.object?.userData?.asset?.id);
  });
  sceneManager.on('assets:cleared', () => {
    assets.clear();
    renderList();
    setStatus('メディアなし', 'warn');
  });
  sceneManager.on('asset:auto-removed', ({ detail }) => {
    removeAsset(detail?.object?.userData?.asset?.id);
    setStatus('上限超過: 古いメディアを削除しました', 'warn');
  });
  sceneManager.on('scene:cleared', ({ detail }) => {
    if (detail?.preserveAssets) return;
    assets.clear();
    renderList();
    setStatus('メディアをリセットしました', 'warn');
  });
  sceneManager.on('asset:count', ({ detail }) => {
    const { count = 0, limit = 0, warnThreshold = 0 } = detail || {};
    if (count === 0) {
      setStatus('メディアなし', 'idle');
    } else if (count >= limit && limit > 0) {
      setStatus(`上限 ${limit} 件に到達`, 'error');
    } else if (count >= warnThreshold) {
      setStatus(`残り ${limit - count} 件で上限`, 'warn');
    } else {
      setStatus(`${count} 件のメディア`, 'ok');
    }
  });
  sceneManager.on('asset:audio', ({ detail }) => {
    if (!detail?.id || !assets.has(detail.id)) return;
    const existing = assets.get(detail.id);
    assets.set(detail.id, { ...existing, muted: detail.muted });
    renderList();
  });
  sceneManager.on('asset:audio-volume', ({ detail }) => {
    if (!detail?.id || !assets.has(detail.id)) return;
    const existing = assets.get(detail.id);
    assets.set(detail.id, { ...existing, audioVolume: detail.volume });
  });

  listEl?.addEventListener('click', event => {
    const target = event.target;
    if (target?.dataset?.action === 'remove-asset') {
      const assetId = target.dataset.assetId;
      sceneManager.removeAssetById(assetId);
    } else if (target?.dataset?.action === 'toggle-audio') {
      const assetId = target.dataset.assetId;
      sceneManager.toggleAssetAudio?.(assetId);
    }
  });

  clearBtn?.addEventListener('click', () => {
    sceneManager.clearAssets();
  });
}

function getAssetIcon(kind) {
  switch (kind) {
    case 'image':
      return '🖼️';
    case 'video':
      return '🎬';
    case 'model':
      return '📦';
    default:
      return '📁';
  }
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
