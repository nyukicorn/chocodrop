import { bootstrapApp } from './app-shell.js';
import {
  loadThree,
  loadGLTFLoader,
  loadDRACOLoader,
  loadKTX2Loader
} from './utils/three-deps.js';
import { saveModelToOPFS, listStoredModels, isOPFSSupported } from '../../opfs_store.js';

const ACCEPT_EXTENSIONS = ['.gltf', '.glb', '.json'];
const MEDIA_MODEL_EXTENSIONS = ['.glb', '.gltf'];
const MEDIA_CHUNK_SIZE = 256 * 1024; // 256KB

async function main() {
  const canvas = document.querySelector('#importer-canvas');
  const overlay = document.querySelector('[data-overlay]');
  const fileInput = document.querySelector('#file-input');
  const dropZone = document.querySelector('[data-dropzone]');
  const mediaInput = document.querySelector('#media-input');
  const mediaDropZone = document.querySelector('[data-media-dropzone]');
  const fileList = document.querySelector('[data-file-list]');
  const mediaStatus = document.querySelector('[data-media-status]');
  const setMediaStatus = createMediaStatusController(mediaStatus);
  const overlayUI = createOverlayStatus(overlay);
  setOverlayStatus(overlayUI, '初期化中…', 'Quest からのアクセスも待機しています。');

  const opfsAvailable = isOPFSSupported();
  if (!opfsAvailable) {
    setOverlayStatus(
      overlayUI,
      '初期化中（OPFS未対応）',
      'このブラウザでは保存機能が利用できませんが、読み込みは可能です。',
      'warn'
    );
  }

  const { sceneManager, client } = await bootstrapApp({
    canvas,
    overlay,
    options: {
      sceneManager: {
        background: '#020617'
      },
      liveCommand: {
        autoConnect: true
      }
    }
  });
  const pendingSync = { latest: null };
  const pendingAssets = [];
  attachClientStatus(client, overlayUI, pendingSync, pendingAssets, setMediaStatus);
  const loaders = await setupLoaders(sceneManager);
  const { THREE, gltfLoader } = loaders;
  setOverlayStatus(
    overlayUI,
    '準備完了',
    'ファイルを選択またはドロップしてください。VR/AR中は左スティック:平面移動, 右スティック:上下・回転・スケール。'
  );

  const handleFiles = async files => {
    for (const file of files) {
      if (!validateFile(file)) {
        alert('対応形式は GLTF/GLB/Three.js JSON のみです');
        continue;
      }
      try {
        const result = await loadFileIntoScene(file, { gltfLoader, sceneManager, THREE });
        await persistFile(file, opfsAvailable);
        const sceneJSON = sceneManager.exportSceneJSON();
        if (!(await broadcastScene(sceneJSON, sceneManager, client))) {
          pendingSync.latest = sceneJSON;
        } else {
          pendingSync.latest = null;
        }
        setOverlayStatus(
          overlayUI,
          'インポート完了',
          client?.isConnected()
            ? 'Quest など他デバイスにも同期しました。'
            : 'ローカルのみ更新されました。'
        );
      } catch (error) {
        console.error('Failed to import', error);
        setOverlayStatus(overlayUI, 'インポート失敗', error?.message || '不明なエラー', 'error');
      }
    }
    await refreshStoredList(fileList, opfsAvailable);
  };

  fileInput.addEventListener('change', event => {
    handleFiles(event.target.files);
  });

  const handleMediaFiles = async files => {
    const targets = files ? Array.from(files) : [];
    if (targets.length === 0) return;
    for (const file of targets) {
      const kind = detectMediaKind(file);
      if (!kind) {
        setMediaStatus(`${file.name} は未対応形式です`, 'error');
        continue;
      }
      setMediaStatus(`${file.name} を準備中…`, 'pending');
      try {
        const { sent } = await processMediaFile(file, kind, {
          sceneManager,
          client,
          pendingAssets
        });
        if (sent) {
          setMediaStatus(`${file.name} を Quest に送信しました`, 'ok');
        } else {
          setMediaStatus(`${file.name} をローカルに配置（再送待ち）`, 'warn');
        }
      } catch (error) {
        console.error('Media cast failed', error);
        setMediaStatus(`${file.name} の送信に失敗: ${error?.message ?? '不明なエラー'}`, 'error');
      }
    }
  };

  mediaInput?.addEventListener('change', event => {
    handleMediaFiles(event.target.files);
    event.target.value = '';
  });

  dropZone.addEventListener('dragover', event => {
    event.preventDefault();
    dropZone.dataset.state = 'over';
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.dataset.state = 'idle';
  });

  dropZone.addEventListener('drop', event => {
    event.preventDefault();
    dropZone.dataset.state = 'idle';
    handleFiles(event.dataTransfer.files);
  });

  if (mediaDropZone) {
    mediaDropZone.addEventListener('dragover', event => {
      event.preventDefault();
      mediaDropZone.dataset.state = 'over';
    });
    mediaDropZone.addEventListener('dragleave', () => {
      mediaDropZone.dataset.state = 'idle';
    });
    mediaDropZone.addEventListener('drop', event => {
      event.preventDefault();
      mediaDropZone.dataset.state = 'idle';
      handleMediaFiles(event.dataTransfer.files);
    });
  }

  await refreshStoredList(fileList, opfsAvailable);
}

function validateFile(file) {
  const lower = file.name.toLowerCase();
  return ACCEPT_EXTENSIONS.some(ext => lower.endsWith(ext));
}

async function loadFileIntoScene(file, { gltfLoader, sceneManager, THREE }) {
  const lower = file.name.toLowerCase();
  sceneManager.clear({ preserveAssets: true });

  if (lower.endsWith('.json')) {
    const text = await file.text();
    const json = JSON.parse(text);
    const imported = await sceneManager.importJSON(json);
    return { object: imported, json: sceneManager.exportSceneJSON() };
  }

  const arrayBuffer = await file.arrayBuffer();
  const blobUrl = URL.createObjectURL(new Blob([arrayBuffer]));
  try {
    const { scene } = await gltfLoader.loadAsync(blobUrl);
    const root = scene ?? new sceneManager.THREE.Group();

    centerScene(root, THREE);
    sceneManager.add(root);
    return { object: root, json: sceneManager.exportSceneJSON() };
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function centerScene(object, THREE) {
  const box = new THREE.Box3().setFromObject(object);
  const center = new THREE.Vector3();
  box.getCenter(center);
  object.position.sub(center);

  const size = box.getSize(new THREE.Vector3()).length();
  const scale = 4 / size;
  if (scale && scale !== Infinity && scale > 0) {
    object.scale.multiplyScalar(scale);
  }
}

async function persistFile(file, opfsAvailable) {
  if (!opfsAvailable) return;
  try {
    await saveModelToOPFS(file);
  } catch (error) {
    console.warn('Failed to persist model to OPFS', error);
  }
}

async function refreshStoredList(container, opfsAvailable) {
  if (!container) return;
  if (!opfsAvailable) {
    container.innerHTML = '<li>このブラウザでは保存は無効化されています。</li>';
    return;
  }
  try {
    const models = await listStoredModels();
    container.innerHTML = '';
    if (models.length === 0) {
      container.innerHTML = '<li>まだ保存されたモデルはありません。</li>';
      return;
    }
    models.forEach(model => {
      const item = document.createElement('li');
      item.textContent = `${model.name} (${Math.round(model.size / 1024)} KB)`;
      container.appendChild(item);
    });
  } catch (error) {
    container.textContent = 'OPFS へのアクセスに失敗しました';
  }
}

function createOverlayStatus(overlay) {
  if (!overlay) return null;
  overlay.innerHTML = '';
  const panel = document.createElement('div');
  panel.style.position = 'absolute';
  panel.style.top = '1.5rem';
  panel.style.left = '1.5rem';
  panel.style.padding = '1rem 1.5rem';
  panel.style.borderRadius = '1rem';
  panel.style.background = 'rgba(15, 23, 42, 0.78)';
  panel.style.backdropFilter = 'blur(14px)';
  panel.style.border = '1px solid rgba(148, 163, 184, 0.4)';
  panel.style.color = '#e2e8f0';
  panel.style.maxWidth = '320px';
  const title = document.createElement('div');
  title.style.fontWeight = '600';
  title.dataset.role = 'title';
  const detail = document.createElement('div');
  detail.style.fontSize = '0.85rem';
  detail.style.marginTop = '0.35rem';
  detail.style.lineHeight = '1.4';
  detail.dataset.role = 'detail';
  panel.appendChild(title);
  panel.appendChild(detail);
  overlay.appendChild(panel);
  return { panel, title, detail };
}

function setOverlayStatus(overlayUI, title, detail = '', tone = 'info') {
  if (!overlayUI) return;
  overlayUI.title.textContent = title;
  overlayUI.detail.textContent = detail;
  const colors = {
    info: '#38bdf8',
    ok: '#4ade80',
    warn: '#facc15',
    error: '#f87171'
  };
  overlayUI.title.style.color = colors[tone] || colors.info;
}

async function setupLoaders(sceneManager) {
  const THREE = await loadThree();
  const GLTFLoader = await loadGLTFLoader();
  const gltfLoader = new GLTFLoader();
  try {
    const DRACOLoader = await loadDRACOLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/libs/draco/');
    gltfLoader.setDRACOLoader(dracoLoader);
  } catch (error) {
    console.warn('DRACO ローダーの初期化に失敗しました', error);
  }

  try {
    const KTX2Loader = await loadKTX2Loader();
    const ktx2Loader = new KTX2Loader();
    ktx2Loader.setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/libs/basis/');
    ktx2Loader.detectSupport?.(sceneManager.renderer);
    gltfLoader.setKTX2Loader(ktx2Loader);
  } catch (error) {
    console.warn('KTX2 ローダーの初期化に失敗しました', error);
  }

  return { THREE, gltfLoader };
}

async function broadcastScene(json, sceneManager, client) {
  if (!json || !client) return false;
  if (!client.isConnected()) return false;
  try {
    client.send({ type: 'scene:clear', payload: { preserveAssets: true } });
    client.send({ type: 'scene:json', payload: { json } });
    const { position, target } = exportCameraState(sceneManager);
    client.send({ type: 'camera:set', payload: { position, target } });
    return true;
  } catch (error) {
    console.warn('Scene broadcast failed', error);
    return false;
  }
}

function exportCameraState(sceneManager) {
  const position = sceneManager.camera.position;
  const target = sceneManager.controls?.target;
  return {
    position: { x: position.x, y: position.y, z: position.z },
    target: target
      ? { x: target.x, y: target.y, z: target.z }
      : { x: 0, y: 0, z: 0 }
  };
}

function attachClientStatus(client, overlayUI, pendingSync, pendingAssets, setMediaStatus) {
  if (!client || !overlayUI) return;
  client.on('connecting', () => setOverlayStatus(overlayUI, '同期サーバー接続中…', 'Quest への配信待機中。', 'info'));
  client.on('connected', () => setOverlayStatus(overlayUI, '同期オンライン', 'PC→Quest 間で自動反映します。', 'ok'));
  client.on('disconnected', () => setOverlayStatus(overlayUI, '同期切断', 'ローカルのみ更新されます。', 'warn'));
  client.on('error', () => setOverlayStatus(overlayUI, '同期エラー', 'WebSocket 接続を確認してください。', 'error'));
  client.on('connected', async () => {
    if (pendingSync?.latest) {
      const sceneManager = client.sceneManager;
      if (sceneManager) {
        const success = await broadcastScene(pendingSync.latest, sceneManager, client);
        if (success) {
          pendingSync.latest = null;
        }
      }
    }
    if (pendingAssets?.length) {
      const flushed = await flushPendingAssets(pendingAssets, client, setMediaStatus);
      if (flushed > 0 && setMediaStatus) {
        setMediaStatus(`未送信メディア ${flushed} 件を Quest に送信しました`, 'ok');
      }
    }
  });
}

function detectMediaKind(file) {
  if (!file) return null;
  if (file.type?.startsWith('image/')) return 'image';
  if (file.type?.startsWith('video/')) return 'video';
  const lower = file.name?.toLowerCase() || '';
  if (MEDIA_MODEL_EXTENSIONS.some(ext => lower.endsWith(ext))) {
    return 'model';
  }
  return null;
}

async function processMediaFile(file, kind, context) {
  const objectUrl = URL.createObjectURL(file);
  const localPayload = buildAssetPayload(file, kind, {
    objectUrl,
    preserveObjectUrl: kind === 'video'
  });
  await context.sceneManager.spawnAssetFromPayload(localPayload);
  const remotePayload = {
    ...localPayload,
    objectUrl: null,
    source: 'importer-stream'
  };
  const sent = await streamAssetToClient({ client: context.client, file, payload: remotePayload });
  if (!sent && context.pendingAssets) {
    context.pendingAssets.push({ file, payload: remotePayload, kind });
  }
  return { payload: remotePayload, sent };
}

function buildAssetPayload(file, kind, overrides = {}) {
  return {
    id: overrides.id || createAssetId(),
    kind,
    fileName: file.name,
    mimeType: file.type || guessMimeFromName(file.name, kind),
    size: file.size,
    createdAt: Date.now(),
    source: 'importer',
    ...overrides
  };
}

function guessMimeFromName(name = '', kind) {
  const lower = name.toLowerCase();
  if (kind === 'model') {
    if (lower.endsWith('.gltf')) return 'model/gltf+json';
    return 'model/gltf-binary';
  }
  if (kind === 'image') return 'image/png';
  if (kind === 'video') return 'video/mp4';
  return 'application/octet-stream';
}

function createAssetId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `asset_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
}

function createMediaStatusController(element) {
  if (!element) {
    return () => {};
  }
  return (text, state = 'idle') => {
    element.textContent = text;
    element.dataset.state = state;
  };
}

async function flushPendingAssets(queue, client, setMediaStatus) {
  if (!queue || queue.length === 0) return 0;
  if (!client?.isConnected()) return 0;
  let sent = 0;
  while (queue.length) {
    const task = queue[0];
    const success = await streamAssetToClient({ client, file: task.file, payload: task.payload });
    if (!success) {
      break;
    }
    queue.shift();
    sent += 1;
    if (setMediaStatus) {
      setMediaStatus(`${task.payload.fileName} を Quest に再送しました`, 'ok');
    }
  }
  return sent;
}

async function streamAssetToClient({ client, file, payload }) {
  if (!client?.isConnected()) {
    return false;
  }
  try {
    client.send({ type: 'asset:begin', payload: { ...payload, chunkSize: MEDIA_CHUNK_SIZE } });
    let index = 0;
    for await (const chunk of iterateFileChunks(file, MEDIA_CHUNK_SIZE)) {
      const base64 = bytesToBase64(chunk);
      client.send({ type: 'asset:chunk', payload: { id: payload.id, index, data: base64 } });
      index += 1;
    }
    client.send({ type: 'asset:end', payload: { id: payload.id } });
    return true;
  } catch (error) {
    console.warn('streamAssetToClient failed', error);
    try {
      client.send({ type: 'asset:abort', payload: { id: payload.id } });
    } catch (_) {
      /* noop */
    }
    return false;
  }
}

async function* iterateFileChunks(file, chunkSize) {
  if (file.stream) {
    const reader = file.stream().getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        yield new Uint8Array(value);
      }
    }
    return;
  }
  let offset = 0;
  while (offset < file.size) {
    const slice = file.slice(offset, offset + chunkSize);
    const buffer = await slice.arrayBuffer();
    yield new Uint8Array(buffer);
    offset += chunkSize;
  }
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...sub);
  }
  return btoa(binary);
}

main().catch(error => {
  console.error('importer bootstrap failed', error);
  alert('インポーターの初期化に失敗しました');
});
