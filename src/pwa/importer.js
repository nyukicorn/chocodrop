import { bootstrapApp } from './app-shell.js';
import {
  loadThree,
  loadGLTFLoader,
  loadDRACOLoader,
  loadKTX2Loader
} from './utils/three-deps.js';
import { saveModelToOPFS, listStoredModels } from '../../opfs_store.js';

const ACCEPT_EXTENSIONS = ['.gltf', '.glb', '.json'];

async function main() {
  const canvas = document.querySelector('#importer-canvas');
  const overlay = document.querySelector('[data-overlay]');
  const fileInput = document.querySelector('#file-input');
  const dropZone = document.querySelector('[data-dropzone]');
  const fileList = document.querySelector('[data-file-list]');

  const { sceneManager } = await bootstrapApp({
    canvas,
    overlay,
    options: {
      sceneManager: {
        background: '#020617'
      },
      liveCommand: {
        autoConnect: false
      }
    }
  });

  const THREE = await loadThree();
  const GLTFLoader = await loadGLTFLoader();
  const DRACOLoader = await loadDRACOLoader();
  const KTX2Loader = await loadKTX2Loader();

  const gltfLoader = new GLTFLoader();
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/libs/draco/');
  gltfLoader.setDRACOLoader(dracoLoader);

  const ktx2Loader = new KTX2Loader();
  ktx2Loader.setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/libs/basis/');
  ktx2Loader.detectSupport(sceneManager.renderer);
  gltfLoader.setKTX2Loader(ktx2Loader);

  const handleFiles = async files => {
    for (const file of files) {
      if (!validateFile(file)) {
        alert('対応形式は GLTF/GLB/Three.js JSON のみです');
        continue;
      }
      await loadFileIntoScene(file, { gltfLoader, sceneManager, THREE });
      await persistFile(file);
    }
    await refreshStoredList(fileList);
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

  await refreshStoredList(fileList);
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
    await sceneManager.importJSON(json);
    return;
  }

  const arrayBuffer = await file.arrayBuffer();
  const blobUrl = URL.createObjectURL(new Blob([arrayBuffer]));
  try {
    const { scene } = await gltfLoader.loadAsync(blobUrl);
    const root = scene ?? new sceneManager.THREE.Group();

    centerScene(root, THREE);
    sceneManager.add(root);
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

async function persistFile(file) {
  try {
    await saveModelToOPFS(file);
  } catch (error) {
    console.warn('Failed to persist model to OPFS', error);
  }
}

async function refreshStoredList(container) {
  if (!container) return;
  try {
    const models = await listStoredModels();
    container.innerHTML = '';
    models.forEach(model => {
      const item = document.createElement('li');
      item.textContent = `${model.name} (${Math.round(model.size / 1024)} KB)`;
      container.appendChild(item);
    });
  } catch (error) {
    container.textContent = 'OPFS へのアクセスに失敗しました';
  }
}

main().catch(error => {
  console.error('importer bootstrap failed', error);
  alert('インポーターの初期化に失敗しました');
});
