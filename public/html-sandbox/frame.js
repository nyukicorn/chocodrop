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
    firstRenderReported: false,
    thumbnailSent: false
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
  wrapRendererHooks(THREE, trackedScenes, state, requestFirstRenderExport, log, post, fail);
  wrapTextureLoader(THREE, log);

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

  setTimeout(() => {
    if (!state.exported && !trackedScenes.size) {
      log('warn', 'Scene が検出されていません。render() が呼ばれているか、scene.add が行われているかを確認してください。');
    }
  }, Math.min(2000, Math.max(500, autoExportDelay)));

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

function wrapRendererHooks(THREE, trackedScenes, state, requestFirstRenderExport, log, post, fail) {
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
      // fallback 用に renderer から scene を逆参照できるようメモ
      if (scene && typeof scene === 'object') {
        scene.__rendererHint = this;
      }
      this.__chocodropState = state;
      maybeAttachContextLossListener(this, fail, log);
      state.lastMutation = sandboxNow();
      try {
        requestFirstRenderExport(scene, camera);
      } catch (_) {
        /* noop */
      }
      const output = originalRender.call(this, scene, camera, ...rest);
      try {
        captureThumbnail(this, state, post, log);
      } catch (_) {
        /* noop */
      }
      return output;
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
      fail('scene-missing', { message: 'エクスポート対象の Scene が検出できませんでした。scene.add が呼ばれているか確認してください。' });
      return;
    }
    try {
      const prepared = prepareScene(scene, THREE, log);
      const sceneJson = prepared.toJSON();
      const objectCount = countObjects(prepared);
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
      exportGlb(prepared, exporter, log, post);
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
    // 追加フォールバック: サムネイル未取得ならここで再試行
    tryFallbackThumbnailCapture(scene, log, post);
    const animations = Array.isArray(scene.animations) ? scene.animations : [];
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
      {
        binary: true,
        onlyVisible: true,
        forceIndices: true,
        truncateDrawRange: true,
        maxTextureSize: 2048,
        animations,
        includeCustomExtensions: true
      }
    );
  } catch (error) {
    log('warn', `GLB エクスポートに失敗: ${error?.message || error}`);
  }
}

function tryFallbackThumbnailCapture(scene, log, post) {
  if (!scene || !scene.__rendererHint || scene.__rendererHint.__chocodropThumbnailSent) return;
  const renderer = scene.__rendererHint;
  // 一度失敗していても安全に再試行するが、成功時のみフラグを立てる
  try {
    captureThumbnail(renderer, renderer.__chocodropState || {}, post, log);
  } catch (error) {
    log('warn', `サムネイル再取得に失敗: ${error?.message || error}`);
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

function prepareScene(scene, THREE, log) {
  // クローンしてオリジナルを汚染しない
  const cloned = scene.clone(true);
  const removable = [];
  cloned.traverse(obj => {
    const scaleMagnitude = obj.scale ? Math.abs(obj.scale.x * obj.scale.y * obj.scale.z) : 1;
    if (obj.visible === false || scaleMagnitude < 1e-6) {
      removable.push(obj);
    }
  });
  removable.forEach(node => node.parent?.remove(node));

  dedupeResources(cloned, THREE, log);
  return cloned;
}

function dedupeResources(root, THREE, log) {
  if (!THREE || !root) return;
  const geometryMap = new Map();
  const materialMap = new Map();
  root.traverse(obj => {
    if (obj.isMesh || obj.isPoints || obj.isLine) {
      if (obj.geometry && obj.geometry.isBufferGeometry) {
        const signature = geometrySignature(obj.geometry);
        const existing = geometryMap.get(signature);
        if (existing) {
          obj.geometry = existing;
        } else {
          geometryMap.set(signature, optimizeGeometry(obj.geometry, THREE, log));
        }
      }
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material].filter(Boolean);
      if (materials.length) {
        obj.material = materials.map(mat => {
          const key = materialSignature(mat);
          const found = materialMap.get(key);
          if (found) return found;
          materialMap.set(key, mat);
          return mat;
        });
        if (obj.material.length === 1) {
          obj.material = obj.material[0];
        }
      }
    }
  });
}

function geometrySignature(geometry) {
  const attrs = geometry.attributes || {};
  const keys = Object.keys(attrs)
    .sort()
    .map(name => {
      const attr = attrs[name];
      return `${name}:${attr?.itemSize || 0}:${attr?.count || 0}:${attr?.normalized ? 1 : 0}`;
    })
    .join('|');
  const index = geometry.index ? `i:${geometry.index.count}` : 'i:0';
  return `${geometry.type || geometry.constructor?.name || 'BufferGeometry'};${index};${keys}`;
}

function optimizeGeometry(geometry, THREE, log) {
  if (THREE.BufferGeometryUtils && typeof THREE.BufferGeometryUtils.mergeVertices === 'function') {
    try {
      const merged = THREE.BufferGeometryUtils.mergeVertices(geometry, 1e-4);
      merged.computeBoundingSphere?.();
      merged.computeBoundingBox?.();
      return merged;
    } catch (error) {
      log('warn', `ジオメトリの最適化に失敗: ${error?.message || error}`);
    }
  }
  return geometry;
}

function materialSignature(material = {}) {
  const props = ['type', 'color', 'roughness', 'metalness', 'opacity', 'transparent', 'map', 'normalMap'];
  return props
    .map(key => {
      const value = material[key];
      if (value && value.uuid) return `${key}:${value.uuid}`;
      if (value && value.isColor) return `${key}:${value.getHexString?.() || ''}`;
      return `${key}:${value ?? 'null'}`;
    })
    .join(';');
}

function maybeAttachContextLossListener(renderer, fail, log) {
  if (!renderer || renderer.__chocodropContextGuard) return;
  const canvas = renderer.domElement;
  if (!canvas || typeof canvas.addEventListener !== 'function') return;
  renderer.__chocodropContextGuard = true;
  const handleLost = event => {
    try {
      event?.preventDefault?.();
    } catch (_) {
      /* noop */
    }
    log('error', 'WebGL コンテキストが失われました。テクスチャサイズやGPU負荷を見直してください。');
    fail?.('webgl-context-lost', {
      message: 'WebGL コンテキストが失われました。ブラウザをリロードするか、描画負荷を下げて再実行してください。'
    });
  };
  const handleRestore = () => log('info', 'WebGL コンテキストが復旧しました');
  canvas.addEventListener('webglcontextlost', handleLost, { passive: false });
  canvas.addEventListener('webglcontextrestored', handleRestore, { passive: true });
}

function wrapTextureLoader(THREE, log) {
  if (!THREE?.TextureLoader || !THREE.TextureLoader.prototype) return;
  const originalLoad = THREE.TextureLoader.prototype.load;
  THREE.TextureLoader.prototype.load = function patchedTextureLoad(url, onLoad, onError, ...rest) {
    const handleError = error => {
      const reason = error?.message || error || 'テクスチャの読み込みに失敗しました';
      log('warn', `Texture 読み込み失敗: ${url || 'unknown'} (${reason}). CORS 設定やパスをご確認ください。`);
      if (typeof onError === 'function') {
        try {
          onError(error);
        } catch (_) {
          /* noop */
        }
      }
    };
    return originalLoad.call(this, url, onLoad, handleError, ...rest);
  };
}

function captureThumbnail(renderer, state, post, log) {
  if (state.thumbnailSent) return;
  const canvas = renderer?.domElement;
  if (!canvas || !canvas.width || !canvas.height) return;

  const maxSize = 512;
  const scale = Math.min(1, maxSize / Math.max(canvas.width, canvas.height));
  const targetWidth = Math.max(1, Math.round(canvas.width * scale));
  const targetHeight = Math.max(1, Math.round(canvas.height * scale));

  try {
    const offscreen = document.createElement('canvas');
    offscreen.width = targetWidth;
    offscreen.height = targetHeight;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(canvas, 0, 0, targetWidth, targetHeight);
    const dataUrl = offscreen.toDataURL('image/png');
    state.thumbnailSent = true;
    if (renderer) renderer.__chocodropThumbnailSent = true;
    post('thumbnail', { dataUrl, width: targetWidth, height: targetHeight });
  } catch (error) {
    log('warn', `サムネイル生成に失敗: ${error?.message || error}`);
  }
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
