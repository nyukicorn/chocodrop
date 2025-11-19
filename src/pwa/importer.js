import { bootstrapApp } from './app-shell.js';
import {
  loadThree,
  loadGLTFLoader,
  loadDRACOLoader,
  loadKTX2Loader
} from './utils/three-deps.js';
import { saveModelToOPFS, listStoredModels, isOPFSSupported } from '../../opfs_store.js';
import { HtmlSandboxRunner, HtmlSandboxError } from './html-sandbox/HtmlSandboxRunner.js';
import {
  loadHtmlSandboxPolicy,
  saveHtmlSandboxPolicy,
  normalizeHtmlSandboxPolicy,
  DEFAULT_HTML_SANDBOX_POLICY
} from './html-sandbox/policy.js';

const MODEL_EXTENSIONS = ['.gltf', '.glb', '.json'];
const HTML_EXTENSIONS = ['.html', '.htm'];
const ACCEPT_EXTENSIONS = [...MODEL_EXTENSIONS, ...HTML_EXTENSIONS];
const MEDIA_MODEL_EXTENSIONS = ['.glb', '.gltf'];
const MEDIA_CHUNK_SIZE = 256 * 1024; // 256KB
const URL_HISTORY_STORAGE_KEY = 'chocodrop:urlHistory';
const URL_HISTORY_LIMIT = 6;
const URL_STATUS_ICONS = {
  idle: 'ℹ️',
  typing: '⌨️',
  pending: '⏳',
  ok: '✅',
  warn: '⚠️',
  error: '❌'
};

async function main() {
  const canvas = document.querySelector('#importer-canvas');
  const overlay = document.querySelector('[data-overlay]');
  const fileInput = document.querySelector('#file-input');
  const dropZone = document.querySelector('[data-dropzone]');
  const urlInput = document.querySelector('#remote-url-input');
  const urlButton = document.querySelector('[data-action="import-url"]');
  const urlStatus = document.querySelector('[data-url-status]');
  const urlHistory = document.querySelector('[data-url-history]');
  const mediaInput = document.querySelector('#media-input');
  const mediaDropZone = document.querySelector('[data-media-dropzone]');
  const fileList = document.querySelector('[data-file-list]');
  const mediaStatus = document.querySelector('[data-media-status]');
  const htmlLogContainer = document.querySelector('[data-html-log]');
  const htmlArtifactContainer = document.querySelector('[data-html-artifacts]');
  const htmlPolicyContainer = document.querySelector('[data-html-policy]');
  const setMediaStatus = createMediaStatusController(mediaStatus);
  const overlayUI = createOverlayStatus(overlay);
  const htmlSandbox = new HtmlSandboxRunner();
  let htmlSandboxPolicy = loadHtmlSandboxPolicy();
  const htmlLogController = createHtmlSandboxLogController(htmlLogContainer);
  const htmlArtifactController = createHtmlSandboxArtifactController(htmlArtifactContainer);
  setupHtmlSandboxPolicyUI(htmlPolicyContainer, {
    policy: htmlSandboxPolicy,
    onChange: updatedPolicy => {
      htmlSandboxPolicy = saveHtmlSandboxPolicy(updatedPolicy);
    }
  });
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
  const transformUI = setupTransformControls(sceneManager);
  sceneManager.on('selection:changed', ({ detail }) => {
    transformUI.update(detail?.object);
  });
  attachClientStatus(client, overlayUI, pendingSync, pendingAssets, setMediaStatus);
  const loaders = await setupLoaders(sceneManager);
  const { THREE, gltfLoader } = loaders;
  setOverlayStatus(
    overlayUI,
    '準備完了',
    'ファイルを選択またはドロップしてください。VR/AR中は左スティック:平面移動, 右スティック:上下・回転・スケール。'
  );

  const importModel = async targetFile => {
    const result = await loadFileIntoScene(targetFile, { gltfLoader, sceneManager, THREE });
    const persisted = await persistFile(targetFile, {
      opfsAvailable,
      onError: message => setOverlayStatus(overlayUI, '保存エラー', message, 'warn')
    });
    const sceneJSON = sceneManager.exportSceneJSON();
    const syncResult = await broadcastScene(sceneJSON, sceneManager, client);
    pendingSync.latest = syncResult.sent ? null : sceneJSON;
    const detailMessage = buildImportDetailMessage({
      client,
      persisted,
      syncResult
    });
    setOverlayStatus(overlayUI, detailMessage.title, detailMessage.detail, detailMessage.tone);
    return result;
  };

  const handleHtmlDocument = async file => {
    setOverlayStatus(overlayUI, 'HTML解析中', `${file.name} を分離サンドボックスで評価しています…`, 'info');
    try {
      const conversion = await htmlSandbox.convertFile(file, { policy: htmlSandboxPolicy });
      htmlLogController.render(conversion.logs);
      htmlArtifactController.render(conversion.artifacts);
      setOverlayStatus(overlayUI, 'HTML解析完了', 'Scene JSON を生成し、インポートを実行します。', 'ok');
      for (const generated of conversion.files) {
        await importModel(generated);
      }
    } catch (error) {
      const sandboxLogs = error instanceof HtmlSandboxError ? error.detail?.logs : null;
      htmlLogController.render(sandboxLogs || [{ level: 'error', message: error.message }]);
      htmlArtifactController.clear?.();
      setOverlayStatus(overlayUI, 'HTML解析失敗', error?.message || 'サンドボックスエラー', 'error');
      console.error('HTML sandbox import failed', error);
    }
  };

  const handleFiles = async files => {
    for (const file of files) {
      if (isHtmlFileName(file.name)) {
        await handleHtmlDocument(file);
        continue;
      }
      if (!validateFile(file)) {
        alert('対応形式は HTML / GLTF / GLB / Three.js JSON のみです');
        continue;
      }
      try {
        await importModel(file);
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

  setupUrlImport({
    input: urlInput,
    button: urlButton,
    statusElement: urlStatus,
    historyElement: urlHistory,
    onImport: handleFiles,
    overlayUI
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
          pendingAssets,
          transformUI
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
  return isSupportedModelFileName(file.name);
}

function isSupportedModelFileName(name = '') {
  const lower = String(name).toLowerCase();
  return ACCEPT_EXTENSIONS.some(ext => lower.endsWith(ext));
}

function isHtmlFileName(name = '') {
  const lower = String(name).toLowerCase();
  return HTML_EXTENSIONS.some(ext => lower.endsWith(ext));
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

async function persistFile(file, { opfsAvailable, onError } = {}) {
  if (!opfsAvailable) return false;
  try {
    await saveModelToOPFS(file);
    return true;
  } catch (error) {
    console.warn('Failed to persist model to OPFS', error);
    if (typeof onError === 'function') {
      onError('ローカル保存に失敗しました（OPFS）');
    }
    return false;
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

function buildImportDetailMessage({ client, persisted, syncResult }) {
  if (syncResult?.sent) {
    const detail = client?.isConnected()
      ? 'Quest など他デバイスにも同期しました。'
      : 'ローカルのみ更新されました。';
    if (persisted) {
      return { title: 'インポート完了', detail, tone: 'ok' };
    }
    return {
      title: 'インポート完了（保存注意）',
      detail: `${detail} ローカル保存には失敗しました。`,
      tone: 'warn'
    };
  }

  if (syncResult?.reason === 'disconnected') {
    return {
      title: 'Quest未接続',
      detail: '接続復帰しだい自動同期します。ChocoDrop Questアプリを起動してください。',
      tone: 'warn'
    };
  }

  if (syncResult?.reason === 'no-client') {
    return {
      title: '同期クライアント未接続',
      detail: 'Quest への送信が無効です。ページを再読み込みして再接続してください。',
      tone: 'warn'
    };
  }

  if (syncResult?.reason === 'error') {
    return {
      title: 'Quest送信失敗',
      detail: '送信エラーが発生しました。接続を確認して再試行してください。',
      tone: 'error'
    };
  }

  return {
    title: 'インポート完了',
    detail: persisted ? 'ファイルを読み込みました。' : 'ファイルを読み込みました（保存失敗）。',
    tone: persisted ? 'ok' : 'warn'
  };
}

function createInlineStatusController(element, { iconMap } = {}) {
  if (!element) {
    return () => {};
  }
  const textElement = element.querySelector('[data-url-status-text]') || element;
  const iconElement = element.querySelector('[data-url-status-icon]');
  return (message, state = 'info') => {
    element.dataset.state = state;
    textElement.textContent = message;
    if (iconElement) {
      const icons = iconMap || {};
      iconElement.textContent = icons[state] || icons.info || 'ℹ️';
    }
  };
}

function setupUrlImport({ input, button, statusElement, historyElement, onImport, overlayUI }) {
  if (!input || !button || typeof onImport !== 'function') return;
  const setStatus = createInlineStatusController(statusElement, { iconMap: URL_STATUS_ICONS });
  let history = loadUrlHistory();
  const historyController = createUrlHistoryController(historyElement, {
    onSelect: url => {
      input.value = url;
      importFromUrl(url);
    }
  });
  historyController.render(history);

  const rememberUrl = url => {
    history = upsertUrlHistory(url, history);
    historyController.render(history);
    saveUrlHistory(history);
  };

  const toggleDisabled = disabled => {
    input.disabled = disabled;
    button.disabled = disabled;
  };

  async function importFromUrl(sourceUrl) {
    const rawValue = typeof sourceUrl === 'string' ? sourceUrl.trim() : input.value.trim();
    if (!rawValue) {
      setStatus('URL を入力してください。', 'warn');
      input.focus();
      return;
    }

    let normalizedUrl;
    try {
      normalizedUrl = new URL(rawValue);
    } catch (error) {
      setStatus('URL の形式が正しくありません。', 'error');
      return;
    }

    toggleDisabled(true);
    setStatus('取得中…', 'pending');
    try {
      const remoteFile = await fetchRemoteModelFile(normalizedUrl.toString());
      await onImport([remoteFile]);
      setStatus(`${remoteFile.name} を読み込みました。`, 'ok');
      rememberUrl(normalizedUrl.toString());
      input.value = '';
    } catch (error) {
      const tone = error?.type === 'cors' ? 'warn' : 'error';
      const hint = error?.suggestion ? ` ${error.suggestion}` : '';
      const message = error?.friendlyMessage || error?.message || 'URL からの読み込みに失敗しました。';
      setStatus(`${message}${hint}`, tone);
      if (overlayUI) {
        setOverlayStatus(overlayUI, 'URL読み込み失敗', `${message}${hint}`, 'error');
      }
    } finally {
      toggleDisabled(false);
    }
  }

  button.addEventListener('click', event => {
    event.preventDefault();
    importFromUrl();
  });

  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      importFromUrl();
    }
  });

  input.addEventListener('input', () => {
    if (!input.value.trim()) {
      setStatus('GLB / GLTF / JSON ファイルの直接リンクを貼り付けてください。', 'idle');
    } else {
      setStatus('Enterキーまたはボタンで読み込みます。', 'typing');
    }
  });

}

function createUrlHistoryController(container, { onSelect } = {}) {
  if (!container) {
    return { render: () => {} };
  }
  const listEl = container.querySelector('[data-url-history-list]') || container;
  container.hidden = true;

  const render = items => {
    listEl.innerHTML = '';
    if (!items?.length) {
      container.hidden = true;
      return;
    }
    container.hidden = false;
    items.forEach(url => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = url;
      button.dataset.urlShortcut = url;
      listEl.appendChild(button);
    });
  };

  container.addEventListener('click', event => {
    const shortcut = event.target.closest('[data-url-shortcut]');
    if (shortcut?.dataset?.urlShortcut && typeof onSelect === 'function') {
      event.preventDefault();
      onSelect(shortcut.dataset.urlShortcut);
    }
  });

  return { render };
}

function loadUrlHistory() {
  try {
    const raw = localStorage.getItem(URL_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(entry => typeof entry === 'string');
    }
  } catch (error) {
    // ローカルストレージが利用できない場合は無視
  }
  return [];
}

function saveUrlHistory(history) {
  try {
    localStorage.setItem(URL_HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch (error) {
    // 保存できなくても致命的ではない
  }
}

function upsertUrlHistory(url, current = []) {
  if (!url) return current;
  const normalized = url.trim();
  if (!normalized) return current;
  const next = [normalized, ...current.filter(entry => entry !== normalized)];
  return next.slice(0, URL_HISTORY_LIMIT);
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

async function fetchRemoteModelFile(url) {
  let response;
  try {
    response = await fetch(url, { mode: 'cors' });
  } catch (cause) {
    throw createFetchError({
      type: 'network',
      message: 'ネットワークエラー: ファイルにアクセスできませんでした。',
      suggestion: '接続状況とURLを確認し、再試行してください。',
      cause
    });
  }

  if (response.type === 'opaque') {
    throw createFetchError({
      type: 'cors',
      message: 'CORS が許可されていない URL です。',
      suggestion: 'raw.githubusercontent.com など CORS 許可済みのホストを利用してください。'
    });
  }

  if (!response.ok) {
    throw createFetchError({
      type: 'http',
      message: `HTTP ${response.status} で取得に失敗しました。`,
      suggestion: 'URL の公開状態や署名の期限を確認してください。'
    });
  }

  let arrayBuffer;
  try {
    arrayBuffer = await response.arrayBuffer();
  } catch (cause) {
    throw createFetchError({
      type: 'data',
      message: 'レスポンスデータの読み取りに失敗しました。',
      suggestion: '時間を置いて再試行してください。',
      cause
    });
  }

  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    throw createFetchError({
      type: 'data',
      message: '取得したファイルが空のようです。',
      suggestion: 'URL とアクセス権限を確認してください。'
    });
  }

  const headers = response.headers;
  const contentType = (headers && headers.get && headers.get('content-type')) || 'application/octet-stream';
  const fileName = ensureSupportedFileName(extractRemoteFileName(headers, url), contentType);

  if (!isSupportedModelFileName(fileName)) {
    throw createFetchError({
      type: 'data',
      message: 'GLB / GLTF / JSON 以外のファイルは読み込めません。',
      suggestion: 'ファイル拡張子または Content-Type を確認してください。'
    });
  }

  return createFileLike(arrayBuffer, fileName, contentType);
}

function extractRemoteFileName(headers, url) {
  const disposition = headers && typeof headers.get === 'function' ? headers.get('content-disposition') : null;
  const byHeader = disposition ? extractFileNameFromContentDisposition(disposition) : null;
  if (byHeader) return byHeader;
  return deriveFileNameFromUrl(url);
}

function extractFileNameFromContentDisposition(header) {
  if (!header) return null;
  const extended = header.match(/filename\*=([^']*)''([^;]+)/i);
  if (extended && extended[2]) {
    return decodeURIComponent(extended[2]);
  }
  const basic = header.match(/filename="?([^";]+)"?/i);
  return basic ? basic[1] : null;
}

function deriveFileNameFromUrl(url) {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length) {
      return decodeURIComponent(segments[segments.length - 1]);
    }
  } catch (error) {
    // noop
  }
  return 'remote-model';
}

function ensureSupportedFileName(name, contentType) {
  if (isSupportedModelFileName(name)) {
    return name;
  }
  const guessed = guessExtensionFromContentType(contentType);
  if (guessed) {
    const suffix = guessed.startsWith('.') ? guessed : `.${guessed}`;
    return `${name}${suffix}`;
  }
  return name;
}

function guessExtensionFromContentType(contentType = '') {
  const lower = contentType.toLowerCase();
  if (lower.includes('model/gltf+json')) return '.gltf';
  if (lower.includes('model/gltf-binary') || lower.includes('application/octet-stream')) return '.glb';
  if (lower.includes('application/json') || lower.includes('text/plain')) return '.json';
  return null;
}

function createFileLike(arrayBuffer, name, mimeType) {
  if (typeof File === 'function') {
    return new File([arrayBuffer], name, { type: mimeType });
  }
  const blob = new Blob([arrayBuffer], { type: mimeType });
  const bufferCopy = arrayBuffer.slice(0);
  return Object.assign(blob, {
    name,
    lastModified: Date.now(),
    async arrayBuffer() {
      return bufferCopy;
    }
  });
}

function createFetchError({ type, message, suggestion, cause }) {
  const error = new Error(message);
  error.type = type;
  error.friendlyMessage = message;
  if (suggestion) error.suggestion = suggestion;
  if (cause) error.cause = cause;
  return error;
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
  if (!json || !client) return { sent: false, reason: 'no-client' };
  if (!client.isConnected()) return { sent: false, reason: 'disconnected' };
  try {
    client.send({ type: 'scene:clear', payload: { preserveAssets: true } });
    client.send({ type: 'scene:json', payload: { json } });
    const { position, target } = exportCameraState(sceneManager);
    client.send({ type: 'camera:set', payload: { position, target } });
    return { sent: true };
  } catch (error) {
    console.warn('Scene broadcast failed', error);
    return { sent: false, reason: 'error', error };
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
        const syncResult = await broadcastScene(pendingSync.latest, sceneManager, client);
        if (syncResult.sent) {
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

function setupTransformControls(sceneManager) {
  const labelEl = document.querySelector('[data-transform-label]');
  const scaleInput = document.querySelector('[data-transform-scale]');
  const audioInput = document.querySelector('[data-audio-volume]');
  const buttons = Array.from(document.querySelectorAll('[data-transform-buttons] button'));
  const resetBtn = document.querySelector('[data-action="reset-transform"]');
  const audioBtn = document.querySelector('[data-action="toggle-audio"]');
  const mediaSelect = document.querySelector('[data-media-select]');
  const THREE = sceneManager.THREE;
  const forward = new THREE.Vector3();
  const planarForward = new THREE.Vector3();
  const planarRight = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let current = null;

  const setEnabled = enabled => {
    if (scaleInput) scaleInput.disabled = !enabled;
    if (audioInput) audioInput.disabled = !(enabled && hasAudio(current));
    if (resetBtn) resetBtn.disabled = !enabled;
    if (audioBtn) audioBtn.disabled = !(enabled && hasAudio(current));
    buttons.forEach(button => {
      button.disabled = !enabled;
    });
    if (!enabled && scaleInput) {
      scaleInput.value = 1;
    }
  };

  const update = object => {
    current = object || null;
    if (labelEl) {
      labelEl.textContent = current?.name || current?.userData?.id || '--';
    }
    setEnabled(!!current);
    if (current && scaleInput) {
      const avgScale = (current.scale.x + current.scale.y + current.scale.z) / 3;
      scaleInput.value = avgScale.toFixed(2);
    }
    if (audioInput && current?.userData?.asset?.audioVolume != null) {
      audioInput.value = current.userData.asset.audioVolume;
    }
    if (audioBtn && current?.userData?.asset?.videoElement) {
      audioBtn.textContent = current.userData.asset.videoElement.muted ? '音声ON' : '音声OFF';
    }
  };

  const applyScale = value => {
    if (!current || !Number.isFinite(value)) return;
    current.scale.set(value, value, value);
  };

  scaleInput?.addEventListener('input', event => {
    const value = parseFloat(event.target.value);
    applyScale(Math.min(Math.max(value, 0.2), 4));
  });

  const handleNudge = direction => {
    if (!current) return;
    const step = 0.35;
    const verticalStep = 0.25;
    up.copy(sceneManager.camera.up).normalize();
    sceneManager.camera.getWorldDirection(forward).normalize();
    planarForward.copy(forward);
    planarForward.y = 0;
    if (planarForward.lengthSq() === 0) {
      planarForward.set(0, 0, -1);
    }
    planarForward.normalize();
    planarRight.copy(planarForward).applyAxisAngle(up, Math.PI / 2).normalize();

    switch (direction) {
      case 'forward':
        current.position.addScaledVector(planarForward, -step);
        break;
      case 'back':
        current.position.addScaledVector(planarForward, step);
        break;
      case 'left':
        current.position.addScaledVector(planarRight, -step);
        break;
      case 'right':
        current.position.addScaledVector(planarRight, step);
        break;
      case 'up':
        current.position.addScaledVector(up, verticalStep);
        break;
      case 'down':
        current.position.addScaledVector(up, -verticalStep);
        break;
      case 'near':
        current.position.addScaledVector(forward, -step);
        break;
      case 'far':
        current.position.addScaledVector(forward, step);
        break;
      default:
        break;
    }
  };

  buttons.forEach(button => {
    button.addEventListener('click', () => handleNudge(button.dataset.nudge));
  });

  resetBtn?.addEventListener('click', () => {
    if (!current) return;
    current.scale.set(1, 1, 1);
    if (scaleInput) {
      scaleInput.value = '1';
    }
    sceneManager.focusOnObject?.(current, { distance: 5 });
  });

  audioBtn?.addEventListener('click', () => {
    if (!current || !hasAudio(current)) return;
    toggleObjectAudio(current);
    audioBtn.textContent = current.userData.asset.videoElement.muted ? '音声ON' : '音声OFF';
  });

  audioInput?.addEventListener('input', event => {
    if (!current || !hasAudio(current)) return;
    const volume = parseFloat(event.target.value);
    setObjectVolume(current, volume);
  });

  const refreshSelect = () => {
    if (!mediaSelect) return;
    const assets = sceneManager.listAssets?.() || [];
    const previous = mediaSelect.value;
    mediaSelect.innerHTML = '<option value="">最新のメディアを選択</option>';
    assets.forEach(asset => {
      const id = asset.userData?.asset?.id;
      if (!id) return;
      const option = document.createElement('option');
      option.value = id;
      option.textContent = asset.userData?.asset?.fileName || asset.name || id;
      if (id === previous) {
        option.selected = true;
      }
      mediaSelect.appendChild(option);
    });
    if (!mediaSelect.value && assets.length) {
      const latest = assets[assets.length - 1].userData?.asset?.id;
      if (latest) {
        mediaSelect.value = latest;
        const asset = sceneManager.getAssetById?.(latest);
        if (asset) {
          sceneManager.setSelectedObject(asset);
          update(asset);
        }
      }
    }
  };

  mediaSelect?.addEventListener('change', event => {
    const id = event.target.value;
    if (!id) return;
    const asset = sceneManager.getAssetById?.(id);
    if (asset) {
      sceneManager.setSelectedObject(asset);
      update(asset);
    }
  });

  sceneManager.on('asset:added', () => refreshSelect());
  sceneManager.on('asset:removed', () => refreshSelect());
  refreshSelect();

  setEnabled(false);
  return { update };
}

function enableVideoAudio(object) {
  if (!object?.userData?.asset?.videoElement) return;
  const video = object.userData.asset.videoElement;
  video.loop = true;
  if (object.userData.asset.audioVolume == null) {
    object.userData.asset.audioVolume = 1;
  }
  video.volume = object.userData.asset.audioVolume;
  video.play().catch(() => {
    // XRデバイスでのユーザー操作待ち
  });
}

function toggleObjectAudio(object) {
  const id = object?.userData?.asset?.id;
  sceneManager.toggleAssetAudio?.(id);
}

function hasAudio(object) {
  return !!object?.userData?.asset?.videoElement;
}

function setObjectVolume(object, volume) {
  const id = object?.userData?.asset?.id;
  if (!id) return;
  sceneManager.setAssetVolume?.(id, volume);
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
  const spawned = await context.sceneManager.spawnAssetFromPayload(localPayload);
  if (kind === 'video') {
    enableVideoAudio(spawned);
  }
  context.sceneManager.focusOnObject?.(spawned, { distance: 6 });
  context.transformUI?.update(spawned);
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

function createHtmlSandboxLogController(element) {
  if (!element) {
    return { render: () => {} };
  }
  element.innerHTML = '<p>HTML サンドボックスの実行ログはまだありません。</p>';
  return {
    render(entries = []) {
      element.innerHTML = '';
      if (!entries.length) {
        element.innerHTML = '<p>HTML サンドボックスの実行ログはまだありません。</p>';
        return;
      }
      entries.slice(-20).forEach(entry => {
        const row = document.createElement('div');
        row.className = `html-log html-log--${entry.level || 'info'}`;
        const elapsed = entry.elapsedMs != null ? `[${entry.elapsedMs}ms] ` : '';
        row.textContent = `${elapsed}${entry.message || ''}`;
        element.appendChild(row);
      });
    }
  };
}

function createHtmlSandboxArtifactController(element) {
  if (!element) {
    return { render: () => {}, clear: () => {} };
  }
  let objectUrl = null;
  const reset = message => {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    element.innerHTML = `<p>${message || 'HTML 変換済みの GLB ダウンロードはまだありません。'}</p>`;
  };
  reset();
  return {
    render(artifacts = {}) {
      const file = artifacts?.glbFile;
      if (!file) {
        reset('GLB はまだ生成されていません。');
        return;
      }
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      objectUrl = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = file.name;
      link.textContent = `${file.name} をダウンロード (${formatBytes(file.size)})`;
      element.innerHTML = '';
      element.appendChild(link);
    },
    clear() {
      reset();
    }
  };
}

function setupHtmlSandboxPolicyUI(container, { policy, onChange } = {}) {
  if (!container) return;
  const form = container.querySelector('[data-html-policy-form]');
  const input = container.querySelector('[data-html-policy-input]');
  const hostList = container.querySelector('[data-html-policy-hosts]');
  const summary = container.querySelector('[data-html-policy-summary]');
  let current = normalizeHtmlSandboxPolicy(policy || DEFAULT_HTML_SANDBOX_POLICY);

  const renderHosts = () => {
    if (!hostList) return;
    hostList.innerHTML = '';
    if (!current.hosts.length) {
      hostList.innerHTML = '<p>許可ホストは未登録です。</p>';
      return;
    }
    current.hosts.forEach(host => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.dataset.role = 'policy-chip';
      chip.dataset.host = host;
      chip.textContent = host;
      hostList.appendChild(chip);
    });
  };

  const renderSummary = () => {
    if (!summary) return;
    summary.textContent = `許可ホスト ${current.hosts.length} 件 / 通信上限 ${current.maxNetworkRequests} 回 / タイムアウト ${current.maxExecutionMs}ms`;
  };

  const applyChange = next => {
    current = normalizeHtmlSandboxPolicy(next);
    renderHosts();
    renderSummary();
    if (typeof onChange === 'function') {
      onChange(current);
    }
  };

  hostList?.addEventListener('click', event => {
    const chip = event.target.closest('[data-role="policy-chip"]');
    if (!chip?.dataset?.host) return;
    const filtered = current.hosts.filter(entry => entry !== chip.dataset.host);
    applyChange({ ...current, hosts: filtered });
  });

  form?.addEventListener('submit', event => {
    event.preventDefault();
    if (!input) return;
    const normalized = normalizeHostInput(input.value);
    if (!normalized) {
      input?.setCustomValidity?.('https://example.com のように入力してください');
      input?.reportValidity?.();
      input?.setCustomValidity?.('');
      return;
    }
    if (current.hosts.includes(normalized)) {
      input.value = '';
      return;
    }
    applyChange({ ...current, hosts: [...current.hosts, normalized] });
    input.value = '';
  });

  applyChange(current);
}

function normalizeHostInput(value) {
  const trimmed = (value || '').trim();
  if (!trimmed) return null;
  if (['self', 'blob:', 'data:'].includes(trimmed)) {
    return trimmed;
  }
  try {
    const formatted = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
    return new URL(formatted).origin;
  } catch (_) {
    return null;
  }
}

function formatBytes(size = 0) {
  if (!Number.isFinite(size) || size <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

main().catch(error => {
  console.error('importer bootstrap failed', error);
  alert('インポーターの初期化に失敗しました');
});
