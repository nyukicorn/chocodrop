function sandboxNow() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

(() => {
  'use strict';

  const CHANNEL = 'chocodrop-html-sandbox';
  const start = sandboxNow();
  const config = window.__CHOCODROP_HTML_SANDBOX_CONFIG || {};
  delete window.__CHOCODROP_HTML_SANDBOX_CONFIG;

  const state = {
    exported: false,
    lastMutation: sandboxNow(),
    idleTimer: null,
    watchdog: null
  };

  const post = (type, payload, transfer) => {
    const message = { source: CHANNEL, type, payload };
    try {
      parent.postMessage(message, '*', transfer || []);
    } catch (error) {
      parent.postMessage(message, '*');
    }
  };

  const log = (level, message) => {
    post('log', { level, message, elapsedMs: Math.round(sandboxNow() - start) });
  };

  const fail = (code, detail = {}) => {
    if (state.exported) return;
    state.exported = true;
    if (state.watchdog) {
      clearTimeout(state.watchdog);
      state.watchdog = null;
    }
    clearTimeout(state.idleTimer);
    post('error', {
      code,
      message: detail.message || 'HTML サンドボックスでエラーが発生しました',
      detail
    });
  };

  post('boot', { fileName: config.fileName || 'inline.html' });
  setupConsoleMirroring(log);
  setupErrorBridge(fail, log);

  const networkGuard = createNetworkGuard(config, fail, log);
  networkGuard.install();

  const THREE = window.THREE;
  if (!THREE || !THREE.GLTFExporter) {
    fail('three-missing', { message: 'Three.js または GLTFExporter を初期化できません。' });
    return;
  }

  const exporter = new THREE.GLTFExporter();
  const trackedScenes = new Set();
  wrapThreeSceneTracking(THREE, trackedScenes, state, log);

  window.ChocoDropSandbox = createSandboxApi({ THREE, exporter, trackedScenes, state, fail, log, networkGuard, post, start });
  window.dispatchEvent(new CustomEvent('chocodrop:sandbox-ready', { detail: { sandbox: window.ChocoDropSandbox } }));

  const autoExportDelay = Number(config.autoExportIdleMs) || 1500;
  const maxExecutionMs = Number(config.maxExecutionMs) || 12000;

  const scheduleIdleCheck = () => {
    clearTimeout(state.idleTimer);
    state.idleTimer = setTimeout(() => {
      if (state.exported) return;
      const idleFor = sandboxNow() - state.lastMutation;
      if (idleFor >= autoExportDelay) {
        window.ChocoDropSandbox.exportScene(null, { reason: 'idle', idleFor });
      } else {
        scheduleIdleCheck();
      }
    }, autoExportDelay);
  };

  scheduleIdleCheck();
  state.watchdog = setTimeout(() => {
    window.ChocoDropSandbox.exportScene(null, { reason: 'timeout', maxExecutionMs });
  }, maxExecutionMs);

  log('info', 'HTML サンドボックスを初期化しました');
})();

function setupConsoleMirroring(log) {
  ['log', 'info', 'warn', 'error'].forEach(level => {
    const original = console[level] || console.log;
    console[level] = (...args) => {
      try {
        original.apply(console, args);
      } catch (_) {
        /* noop */
      }
      try {
        const message = args.map(arg => serializeValue(arg)).join(' ');
        log(level === 'log' ? 'info' : level, message);
      } catch (_) {
        /* noop */
      }
    };
  });
}

function setupErrorBridge(fail, log) {
  window.addEventListener('error', event => {
    const target = event.target;
    if (target && target !== window) {
      const tag = target.tagName?.toLowerCase?.() || 'resource';
      const url = target.src || target.href || '';
      log('error', `${tag} の読み込みに失敗: ${url || 'unknown resource'}`);
      return;
    }
    fail('runtime-error', {
      message: event.message,
      source: event.filename,
      line: event.lineno,
      column: event.colno
    });
  });
  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason || {};
    fail('unhandled-rejection', {
      message: reason?.message || serializeValue(reason),
      stack: reason?.stack
    });
  });
}

function createNetworkGuard(config, fail, log) {
  const allowed = Array.isArray(config.allowedOrigins) ? config.allowedOrigins : [];
  const maxRequests = Number(config.maxNetworkRequests) || 12;
  let requestCount = 0;

  const isAllowed = url => {
    if (!url) return true;
    if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) return true;
    try {
      const parsed = new URL(url, window.location.href);
      const origin = parsed.origin;
      if (allowed.includes('self') && (origin === window.location.origin || origin === 'null')) {
        return true;
      }
      if (allowed.includes(origin)) return true;
      if (allowed.includes(parsed.hostname)) return true;
    } catch (_) {
      return false;
    }
    return false;
  };

  const enforce = (url, channel) => {
    requestCount += 1;
    if (requestCount > maxRequests) {
      fail('network-limit', { message: `通信回数が上限(${maxRequests})を超えました`, url, channel });
      throw new Error('network-limit');
    }
    if (!isAllowed(url)) {
      fail('network-blocked', { message: '許可リストにないホストへの通信を遮断しました', url, channel });
      throw new Error('network-blocked');
    }
  };

  const installFetch = () => {
    if (!window.fetch) return;
    const original = window.fetch.bind(window);
    window.fetch = (...args) => {
      try {
        const url = extractUrlFromArgs(args[0]);
        enforce(url, 'fetch');
      } catch (error) {
        return Promise.reject(error);
      }
      return original(...args);
    };
  };

  const installXHR = () => {
    if (!window.XMLHttpRequest) return;
    const originalOpen = window.XMLHttpRequest.prototype.open;
    const originalSend = window.XMLHttpRequest.prototype.send;
    window.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__chocodropUrl = url;
      return originalOpen.call(this, method, url, ...rest);
    };
    window.XMLHttpRequest.prototype.send = function (...args) {
      enforce(this.__chocodropUrl, 'xhr');
      return originalSend.apply(this, args);
    };
  };

  const installWebSocket = () => {
    if (!window.WebSocket) return;
    const OriginalWebSocket = window.WebSocket;
    function GuardedWebSocket(url, protocols) {
      enforce(url, 'websocket');
      return new OriginalWebSocket(url, protocols);
    }
    GuardedWebSocket.prototype = OriginalWebSocket.prototype;
    window.WebSocket = GuardedWebSocket;
  };

  return {
    install() {
      installFetch();
      installXHR();
      installWebSocket();
      log('info', `通信制限: ホスト ${allowed.join(', ') || 'なし'}, 最大${maxRequests}回`);
    },
    get count() {
      return requestCount;
    }
  };
}

function wrapThreeSceneTracking(THREE, trackedScenes, state, log) {
  const BaseScene = THREE.Scene;
  class SandboxScene extends BaseScene {
    constructor(...args) {
      super(...args);
      trackedScenes.add(this);
      state.lastMutation = sandboxNow();
    }
  }
  SandboxScene.prototype = BaseScene.prototype;
  Object.setPrototypeOf(SandboxScene, BaseScene);
  THREE.Scene = SandboxScene;

  const originalAdd = THREE.Object3D.prototype.add;
  THREE.Object3D.prototype.add = function (...objects) {
    state.lastMutation = sandboxNow();
    return originalAdd.apply(this, objects);
  };

  log('info', 'Scene/Object3D フックを適用しました');
}

function createSandboxApi({ THREE, exporter, trackedScenes, state, fail, log, networkGuard, post, start }) {
  const exportScene = (target, meta = {}) => {
    if (state.exported) return;
    let scene = target;
    if (!scene) {
      scene = pickScene(trackedScenes);
    }
    if (!scene) {
      fail('scene-missing', { message: 'エクスポート対象の Scene が検出できませんでした。' });
      return;
    }
    try {
      const sceneJson = scene.toJSON();
      const objectCount = countObjects(scene);
      state.exported = true;
      clearTimeout(state.watchdog);
      clearTimeout(state.idleTimer);
      post('result', {
        sceneJson,
        summary: {
          objectCount,
          durationMs: Math.round(sandboxNow() - start),
          reason: meta.reason || 'manual',
          networkRequests: networkGuard.count
        }
      });
      exportGlb(scene, exporter, log, post);
    } catch (error) {
      fail('export-failed', { message: error?.message || 'Scene JSON 変換に失敗しました' });
    }
  };

  return {
    exportScene,
    halt: reason => fail('halted', { message: reason || '手動停止' }),
    reportScene: scene => {
      if (scene) {
        trackedScenes.add(scene);
      }
    }
  };
}

function exportGlb(scene, exporter, log, post) {
  try {
    exporter.parse(
      scene,
      result => {
        if (result instanceof ArrayBuffer) {
          post('glb', { byteLength: result.byteLength, buffer: result }, [result]);
        } else {
          log('warn', 'GLB バッファを取得できませんでした');
        }
      },
      error => log('warn', `GLB エクスポートに失敗: ${error?.message || error}`),
      { binary: true, onlyVisible: true }
    );
  } catch (error) {
    log('warn', `GLB エクスポートに失敗: ${error?.message || error}`);
  }
}

function pickScene(trackedScenes) {
  if (trackedScenes.size === 1) {
    return trackedScenes.values().next().value;
  }
  if (trackedScenes.size === 0 && window.scene && typeof window.scene.toJSON === 'function') {
    return window.scene;
  }
  let best = null;
  let bestScore = -1;
  trackedScenes.forEach(scene => {
    const score = countObjects(scene);
    if (score > bestScore) {
      best = scene;
      bestScore = score;
    }
  });
  return best;
}

function countObjects(root) {
  let count = 0;
  root.traverse(() => {
    count += 1;
  });
  return count;
}

function extractUrlFromArgs(input) {
  if (!input) return '';
  if (typeof input === 'string') return input;
  if (typeof Request !== 'undefined' && input instanceof Request) {
    return input.url;
  }
  if (input.url) return input.url;
  return '';
}

function serializeValue(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Error) return value.message || value.stack || value.toString();
  try {
    return JSON.stringify(value);
  } catch (_) {
    return Object.prototype.toString.call(value);
  }
}
