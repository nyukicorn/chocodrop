const SW_PATH = '/service-worker.js';
const SW_SCOPE = '/';
const SESSION_FILE = 'session.json';
const MODELS_FILE = 'models.json';
const LOG_FILE = 'chocodrop-dev.log';

const supportsOPFS = Boolean(navigator.storage && navigator.storage.getDirectory);

const opfs = {
  supported: supportsOPFS,
  rootPromise: null,
  async getDirectory() {
    if (!this.supported) {
      return null;
    }
    if (!this.rootPromise) {
      this.rootPromise = (async () => {
        try {
          const root = await navigator.storage.getDirectory();
          return root.getDirectoryHandle('chocodrop-cache', { create: true });
        } catch (error) {
          console.warn('⚠️ OPFS初期化に失敗しました', error);
          this.supported = false;
          return null;
        }
      })();
    }
    return this.rootPromise;
  }
};

async function writeFile(handle, text) {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

async function saveJSON(filename, data) {
  const dir = await opfs.getDirectory();
  if (!dir) return false;
  const handle = await dir.getFileHandle(filename, { create: true });
  await writeFile(handle, JSON.stringify(data, null, 2));
  return true;
}

async function readJSON(filename, fallback = null) {
  const dir = await opfs.getDirectory();
  if (!dir) return fallback;
  try {
    const handle = await dir.getFileHandle(filename, { create: true });
    const file = await handle.getFile();
    const text = await file.text();
    return text ? JSON.parse(text) : fallback;
  } catch (error) {
    console.warn('⚠️ OPFS読み込みに失敗しました', error);
    return fallback;
  }
}

async function appendLogLine(text) {
  const dir = await opfs.getDirectory();
  if (!dir) return false;
  const handle = await dir.getFileHandle(LOG_FILE, { create: true });
  const timestamp = new Date().toISOString();
  const file = await handle.getFile();
  const existing = await file.text();
  const next = `${existing || ''}${timestamp} ${text}\n`;
  await writeFile(handle, next);
  return true;
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.register(SW_PATH, { scope: SW_SCOPE });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.info('🔄 Service Worker controller changed (更新適用)');
    });
    return registration;
  } catch (error) {
    console.error('❌ Service Worker登録に失敗しました', error);
    await appendLogLine(`[sw-error] ${error.message || error}`);
    return null;
  }
}

async function ensureOpfsBootstrap() {
  await opfs.getDirectory();
}

if (!window.chocoPWA) {
  window.chocoPWA = {
    supportsOPFS,
    ready: ensureOpfsBootstrap(),
    async saveSession(session) {
      if (!supportsOPFS) return false;
      const payload = {
        ...session,
        savedAt: new Date().toISOString()
      };
      return saveJSON(SESSION_FILE, payload);
    },
    async loadSession() {
      if (!supportsOPFS) return null;
      return readJSON(SESSION_FILE, null);
    },
    async saveModels(models) {
      if (!supportsOPFS) return false;
      return saveJSON(MODELS_FILE, {
        models,
        savedAt: new Date().toISOString()
      });
    },
    async loadModels() {
      if (!supportsOPFS) return null;
      return readJSON(MODELS_FILE, null);
    },
    async appendLog(entry) {
      if (!supportsOPFS) return false;
      const text = typeof entry === 'string' ? entry : JSON.stringify(entry);
      return appendLogLine(text);
    }
  };
}

registerServiceWorker();
