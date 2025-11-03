import { bootstrapApp } from './app-shell.js';
import {
  loadThree,
  loadGLTFLoader,
  loadDRACOLoader,
  loadKTX2Loader
} from './utils/three-deps.js';
import { saveModelToOPFS, listStoredModels, isOPFSSupported } from '../../opfs_store.js';

const ACCEPT_EXTENSIONS = ['.gltf', '.glb', '.json'];

async function main() {
  const canvas = document.querySelector('#importer-canvas');
  const overlay = document.querySelector('[data-overlay]');
  const fileInput = document.querySelector('#file-input');
  const dropZone = document.querySelector('[data-dropzone]');
  const fileList = document.querySelector('[data-file-list]');
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
  attachClientStatus(client, overlayUI);
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
        await broadcastScene(sceneJSON, sceneManager, client);
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

  await refreshStoredList(fileList, opfsAvailable);
}

function validateFile(file) {
  const lower = file.name.toLowerCase();
  return ACCEPT_EXTENSIONS.some(ext => lower.endsWith(ext));
}

async function loadFileIntoScene(file, { gltfLoader, sceneManager, THREE }) {
  const lower = file.name.toLowerCase();
  sceneManager.clear();

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
  if (!json || !client?.isConnected()) return;
  try {
    client.send({ type: 'scene:clear' });
    client.send({ type: 'scene:json', payload: { json } });
    const { position, target } = exportCameraState(sceneManager);
    client.send({ type: 'camera:set', payload: { position, target } });
  } catch (error) {
    console.warn('Scene broadcast failed', error);
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

function attachClientStatus(client, overlayUI) {
  if (!client || !overlayUI) return;
  client.on('connecting', () => setOverlayStatus(overlayUI, '同期サーバー接続中…', 'Quest への配信待機中。', 'info'));
  client.on('connected', () => setOverlayStatus(overlayUI, '同期オンライン', 'PC→Quest 間で自動反映します。', 'ok'));
  client.on('disconnected', () => setOverlayStatus(overlayUI, '同期切断', 'ローカルのみ更新されます。', 'warn'));
  client.on('error', () => setOverlayStatus(overlayUI, '同期エラー', 'WebSocket 接続を確認してください。', 'error'));
}

main().catch(error => {
  console.error('importer bootstrap failed', error);
  alert('インポーターの初期化に失敗しました');
});
