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
    watchdog: null,
    renderers: new Set(),
    firstRenderReported: false
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
    disposeTrackedRenderers(state, log);
    post('error', {
      code,
      message: detail.message || 'HTML サンドボックスでエラーが発生しました',
      detail
    });
  };

  const virtualProject = setupVirtualProject();

  post('boot', { fileName: config.fileName || 'inline.html' });
  setupConsoleMirroring(log);
  setupErrorBridge(fail, log);

  if (virtualProject) {
    installVirtualFileSystem(virtualProject, log);
  }

  const networkGuard = createNetworkGuard(config, fail, log);
  networkGuard.install();

  const THREE = window.THREE;
  if (!THREE || !THREE.GLTFExporter) {
    fail('three-missing', { message: 'Three.js または GLTFExporter を初期化できません。' });
    return;
  }

  const exporter = new THREE.GLTFExporter();
  const trackedScenes = new Set();
  const requestFirstRenderExport = createFirstRenderExporter(state);
  wrapThreeSceneTracking(THREE, trackedScenes, state, log);
  wrapRendererHooks(THREE, trackedScenes, state, requestFirstRenderExport, log);

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

function setupVirtualProject() {
  const frame = window.frameElement;
  if (!frame) return null;
  const payload = frame.__chocodropVirtualProject;
  if (!payload || !Array.isArray(payload.files) || payload.files.length === 0) {
    return null;
  }
  frame.__chocodropVirtualProject = null;
  const files = new Map();
  payload.files.forEach(entry => {
    if (Array.isArray(entry) && typeof entry[0] === 'string' && entry[1]?.url) {
      files.set(entry[0], entry[1]);
    }
  });
  if (!files.size) {
    return null;
  }
  return {
    baseDir: (payload.baseDir || '').replace(/\\/g, '/'),
    files
  };
}

function installVirtualFileSystem(project, log) {
  const resolver = createVirtualResolver(project);
  if (!resolver) return;

  const rewriteValue = value => resolver(value);

  patchElementAttributeHook(rewriteValue);
  [
    [window.HTMLScriptElement, 'src'],
    [window.HTMLLinkElement, 'href'],
    [window.HTMLImageElement, 'src'],
    [window.HTMLVideoElement, 'src'],
    [window.HTMLAudioElement, 'src'],
    [window.HTMLSourceElement, 'src'],
    [window.HTMLTrackElement, 'src'],
    [window.HTMLIFrameElement, 'src'],
    [window.HTMLEmbedElement, 'src'],
    [window.HTMLObjectElement, 'data']
  ].forEach(entry => patchUrlProperty(entry[0], entry[1], rewriteValue));

  patchFetchHooks(rewriteValue);
  patchWorkerHooks(rewriteValue);
  log('info', `ローカルZIP資産 ${project.files.size} 件をマウントしました`);
}

function createVirtualResolver(project) {
  const map = project.files;
  if (!map || !map.size) return null;
  const baseDir = normaliseBaseDir(project.baseDir || '');
  return value => {
    const normalized = normalizeVirtualPath(value, baseDir);
    if (!normalized) return null;
    const entry = map.get(normalized);
    return entry?.url || null;
  };
}

function normaliseBaseDir(dir) {
  if (!dir) return '';
  const normalized = dir.replace(/\\/g, '/');
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

function normalizeVirtualPath(value, baseDir) {
  if (value == null) return null;
  const raw = typeof value === 'string' ? value : String(value);
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^[a-zA-Z]+:/.test(trimmed) || trimmed.startsWith('//') || trimmed.startsWith('#')) {
    return null;
  }
  const withoutQuery = trimmed.split(/[?#]/)[0];
  const relative = withoutQuery.startsWith('/')
    ? withoutQuery.slice(1)
    : `${baseDir || ''}${withoutQuery}`;
  const collapsed = collapsePath(relative);
  return collapsed;
}

function collapsePath(path) {
  return path
    .split('/')
    .reduce((stack, segment) => {
      if (!segment || segment === '.') return stack;
      if (segment === '..') {
        stack.pop();
      } else {
        stack.push(segment);
      }
      return stack;
    }, [])
    .join('/');
}

function patchElementAttributeHook(rewriteValue) {
  const originalSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (typeof name === 'string' && typeof value === 'string') {
      if (isResourceAttribute(name)) {
        const mapped = rewriteValue(value);
        if (mapped) {
          return originalSetAttribute.call(this, name, mapped);
        }
      }
    }
    return originalSetAttribute.call(this, name, value);
  };
}

function isResourceAttribute(name) {
  return ['src', 'href', 'data'].includes(name.toLowerCase());
}

function patchUrlProperty(ctor, property, rewriteValue) {
  if (!ctor || !ctor.prototype) return;
  const descriptor = Object.getOwnPropertyDescriptor(ctor.prototype, property);
  if (!descriptor || typeof descriptor.set !== 'function') return;
  Object.defineProperty(ctor.prototype, property, {
    configurable: true,
    enumerable: descriptor.enumerable,
    get: descriptor.get
      ? function () {
          return descriptor.get.call(this);
        }
      : function () {
          return this.getAttribute(property);
        },
    set(value) {
      const mapped = typeof value === 'string' ? rewriteValue(value) : null;
      return descriptor.set.call(this, mapped || value);
    }
  });
}

function patchFetchHooks(rewriteValue) {
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    const mapped = resolveFetchResource(input, rewriteValue, init);
    if (mapped) {
      return originalFetch(mapped.resource, mapped.init);
    }
    return originalFetch(input, init);
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    const mapped = typeof url === 'string' ? rewriteValue(url) : null;
    return originalOpen.call(this, method, mapped || url, ...rest);
  };
}

function resolveFetchResource(resource, rewriteValue, init) {
  if (resource instanceof Request) {
    const mappedUrl = rewriteValue(resource.url);
    if (!mappedUrl) return null;
    const cloned = resource.clone();
    const nextInit = buildRequestInit(cloned, init);
    return { resource: mappedUrl, init: nextInit };
  }
  if (typeof resource === 'string' || resource instanceof URL) {
    const mappedUrl = rewriteValue(String(resource));
    if (!mappedUrl) return null;
    return { resource: mappedUrl, init };
  }
  return null;
}

function buildRequestInit(request, override = {}) {
  const init = { ...override };
  if (!('method' in init)) init.method = request.method;
  if (!('headers' in init)) init.headers = request.headers;
  if (!('body' in init) && request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
  }
  if (!('mode' in init)) init.mode = request.mode;
  if (!('credentials' in init)) init.credentials = request.credentials;
  if (!('cache' in init)) init.cache = request.cache;
  if (!('redirect' in init)) init.redirect = request.redirect;
  if (!('referrer' in init)) init.referrer = request.referrer;
  if (!('referrerPolicy' in init)) init.referrerPolicy = request.referrerPolicy;
  if (!('integrity' in init)) init.integrity = request.integrity;
  if (!('keepalive' in init)) init.keepalive = request.keepalive;
  if (!('signal' in init)) init.signal = request.signal;
  return init;
}

function patchWorkerHooks(rewriteValue) {
  if (typeof window.Worker === 'function') {
    const OriginalWorker = window.Worker;
    window.Worker = function (url, options) {
      const mapped = typeof url === 'string' ? rewriteValue(url) : null;
      return new OriginalWorker(mapped || url, options);
    };
    window.Worker.prototype = OriginalWorker.prototype;
  }
  if (typeof window.SharedWorker === 'function') {
    const OriginalSharedWorker = window.SharedWorker;
    window.SharedWorker = function (url, options) {
      const mapped = typeof url === 'string' ? rewriteValue(url) : null;
      return new OriginalSharedWorker(mapped || url, options);
    };
    window.SharedWorker.prototype = OriginalSharedWorker.prototype;
  }
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

function wrapRendererHooks(THREE, trackedScenes, state, requestFirstRenderExport, log) {
  const Renderer = THREE.WebGLRenderer;
  if (!Renderer || !Renderer.prototype) {
    log('warn', 'WebGLRenderer フックを適用できません (未定義)');
    return;
  }

  const originalRender = Renderer.prototype.render;
  if (typeof originalRender === 'function') {
    Renderer.prototype.render = function patchedRender(scene, camera, ...rest) {
      if (scene && typeof scene.traverse === 'function') {
        trackedScenes.add(scene);
      }
      if (state.renderers && this && typeof this.dispose === 'function') {
        state.renderers.add(this);
      }
      state.lastMutation = sandboxNow();
      try {
        requestFirstRenderExport(scene, camera);
      } catch (_) {
        /* noop */
      }
      return originalRender.call(this, scene, camera, ...rest);
    };
  }

  const originalDispose = Renderer.prototype.dispose;
  Renderer.prototype.dispose = function patchedDispose(...args) {
    if (state.renderers) {
      state.renderers.delete(this);
    }
    if (typeof originalDispose === 'function') {
      return originalDispose.apply(this, args);
    }
    return undefined;
  };

  log('info', 'WebGLRenderer フックを適用しました');
}

function createFirstRenderExporter(state) {
  const enqueue = typeof queueMicrotask === 'function' ? queueMicrotask : cb => Promise.resolve().then(cb);
  return (scene, camera) => {
    if (state.exported || state.firstRenderReported) return;
    if (!scene || typeof scene.traverse !== 'function') return;
    state.firstRenderReported = true;
    enqueue(() => {
      try {
        if (!state.exported) {
          window.ChocoDropSandbox?.exportScene(scene, {
            reason: 'first-render',
            cameraUuid: camera?.uuid || null
          });
        }
      } catch (error) {
        state.firstRenderReported = false;
        console.warn('Initial render export failed, retry allowed.', error);
      }
    });
  };
}

function disposeTrackedRenderers(state, log) {
  if (!state.renderers || !state.renderers.size) {
    return;
  }
  state.renderers.forEach(renderer => {
    try {
      renderer.dispose?.();
    } catch (error) {
      log('warn', `renderer.dispose() に失敗: ${error?.message || error}`);
    }
  });
  state.renderers.clear();
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
      disposeTrackedRenderers(state, log);
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
