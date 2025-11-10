import { createLogger } from '../../common/logger.js';

const logger = createLogger('RemoteScene');

const SUPPORTED_CONTENT_TYPES = [
  'text/html',
  'application/json',
  'application/octet-stream',
  'model/gltf+json',
  'model/gltf-binary'
];

const SCENE_EXTENSIONS = ['.html', '.htm', '.gltf', '.glb', '.json'];

function createEventTarget() {
  if (typeof EventTarget !== 'undefined') {
    return new EventTarget();
  }
  return {
    listeners: new Map(),
    addEventListener(type, handler) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      this.listeners.get(type)?.delete(handler);
    },
    dispatchEvent(event) {
      this.listeners.get(event.type)?.forEach(handler => handler.call(this, event));
    }
  };
}

export class RemoteSceneLoader {
  constructor(options = {}) {
    this.container = options.container || null;
    this.serviceWorker = options.serviceWorker || (typeof navigator !== 'undefined' ? navigator.serviceWorker : null);
    this.eventTarget = createEventTarget();
    this.activeIframe = null;
    this.currentState = {
      status: 'idle',
      url: null,
      viaProxy: false,
      reason: null
    };
    this.proxyEndpoint = options.proxyEndpoint || '/proxy';
    this.telemetry = options.telemetry || (() => {});
    this.controllerAbort = null;
    this.defaultReferrerPolicy = options.referrerPolicy || 'no-referrer';
    this.defaultSandbox = options.sandbox || 'allow-scripts allow-same-origin';
    this.defaultAllow = options.allow || 'xr-spatial-tracking; vr';
  }

  on(type, handler) {
    this.eventTarget.addEventListener(type, handler);
    return () => this.eventTarget.removeEventListener(type, handler);
  }

  emit(type, detail) {
    const event = new CustomEvent(type, { detail });
    this.eventTarget.dispatchEvent(event);
  }

  track(event, detail = {}) {
    try {
      this.telemetry?.({
        component: 'RemoteSceneLoader',
        event,
        detail
      });
    } catch (error) {
      logger.warn('Telemetry dispatch failed', error);
    }
  }

  updateState(partial) {
    this.currentState = { ...this.currentState, ...partial };
    this.emit('state', { state: this.currentState });
  }

  setContainer(container) {
    this.container = container;
  }

  dispose() {
    this.detachIframe();
    if (this.controllerAbort) {
      this.controllerAbort.abort();
      this.controllerAbort = null;
    }
    this.eventTarget = createEventTarget();
  }

  detachIframe() {
    if (this.activeIframe && this.activeIframe.parentNode) {
      this.activeIframe.parentNode.removeChild(this.activeIframe);
    }
    this.activeIframe = null;
  }

  normalizeURL(rawUrl) {
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        return { ok: false, reason: 'protocol', message: 'HTTPS または HTTP のみ対応しています。' };
      }
      if (url.protocol === 'http:' && typeof window !== 'undefined' && window.location.protocol === 'https:') {
        return { ok: false, reason: 'mixed-content', message: 'HTTPS ページでは HTTP リソースを読み込めません。' };
      }
      return { ok: true, url };
    } catch (error) {
      return { ok: false, reason: 'invalid', message: 'URL の形式が正しくありません。' };
    }
  }

  inferSceneType(url) {
    const lower = url.pathname.toLowerCase();
    const match = SCENE_EXTENSIONS.find(ext => lower.endsWith(ext));
    if (!match) {
      return 'unknown';
    }
    switch (match) {
      case '.html':
      case '.htm':
        return 'html';
      case '.json':
        return 'three-json';
      case '.gltf':
      case '.glb':
        return 'gltf';
      default:
        return 'unknown';
    }
  }

  async analyze(url) {
    const normalized = this.normalizeURL(url);
    if (!normalized.ok) {
      this.updateState({ status: 'error', reason: normalized.reason, url });
      this.emit('error', normalized);
      throw new Error(normalized.message);
    }

    const { url: parsed } = normalized;
    const type = this.inferSceneType(parsed);
    const sameOrigin = typeof window !== 'undefined'
      ? parsed.origin === window.location.origin
      : false;

    const metadata = {
      url: parsed,
      type,
      sameOrigin,
      contentType: null,
      size: null,
      cors: false,
      security: {
        coop: 'unsafe-none',
        coep: 'unsafe-none',
        corp: 'cross-origin'
      }
    };

    this.updateState({ status: 'probing', url: parsed.href, viaProxy: false, reason: null });
    this.emit('progress', { stage: 'probing', metadata });
    this.track('analyze:start', { url: parsed.href });

    try {
      this.controllerAbort?.abort();
      this.controllerAbort = new AbortController();
      const response = await fetch(parsed.href, {
        method: 'HEAD',
        mode: sameOrigin ? 'same-origin' : 'cors',
        credentials: sameOrigin ? 'include' : 'omit',
        signal: this.controllerAbort.signal
      });
      metadata.status = response.status;
      metadata.contentType = response.headers.get('content-type');
      metadata.size = Number(response.headers.get('content-length')) || null;
      metadata.cors = response.type !== 'opaque';
      metadata.allowsStreaming = response.headers.has('accept-ranges');
      metadata.supported = this.isSupportedContentType(metadata.contentType, metadata.type);
      metadata.security = {
        coop: (response.headers.get('cross-origin-opener-policy') || 'unsafe-none').toLowerCase(),
        coep: (response.headers.get('cross-origin-embedder-policy') || 'unsafe-none').toLowerCase(),
        corp: (response.headers.get('cross-origin-resource-policy') || 'cross-origin').toLowerCase()
      };
      this.emit('analyzed', { metadata });
      this.track('analyze:complete', { metadata });
      return metadata;
    } catch (error) {
      const fallback = {
        error,
        metadata,
        reason: error.name === 'AbortError' ? 'aborted' : 'cors-blocked'
      };
      this.emit('probe-failed', fallback);
      const failed = { ...metadata, cors: false, supported: false, error };
      this.track('analyze:error', { metadata: failed, message: error?.message });
      return failed;
    }
  }

  isSupportedContentType(contentType, inferredType) {
    if (!contentType) {
      return inferredType !== 'unknown';
    }
    return SUPPORTED_CONTENT_TYPES.some(type => contentType.includes(type));
  }

  shouldForceProxy(metadata = {}) {
    if (!metadata || metadata.sameOrigin) {
      return false;
    }
    if (!metadata.cors) {
      return true;
    }
    const coop = metadata.security?.coop || 'unsafe-none';
    const coep = metadata.security?.coep || 'unsafe-none';
    return coop === 'same-origin' && coep === 'require-corp';
  }

  async load(url, options = {}) {
    const context = { startTime: this.now() };
    this.track('load:start', { url });
    const metadata = await this.analyze(url);
    if (metadata.error && metadata.reason === 'invalid') {
      throw metadata.error;
    }

    const forceProxy = this.shouldForceProxy(metadata);
    if (!forceProxy && (metadata.sameOrigin || metadata.cors)) {
      try {
        return await this.loadViaIframe(metadata, { ...options, viaProxy: false, context });
      } catch (error) {
        this.emit('error', { reason: 'iframe-failed', metadata, error });
        this.track('iframe:error', { metadata, viaProxy: false, message: error?.message });
        throw error;
      }
    }

    if (forceProxy) {
      this.track('proxy:auto', { metadata });
      return this.loadViaProxy(metadata, { ...options, autoRetry: true, context });
    }

    this.emit('fallback', {
      reason: 'cors-blocked',
      metadata,
      options: [
        { id: 'proxy', label: 'プロキシ経由で再試行', primary: true },
        { id: 'download', label: 'ファイルをダウンロードして手動で読み込む' },
        { id: 'docs', label: 'CORS 設定ガイドを開く' }
      ]
    });
    this.track('fallback:cors-blocked', { metadata });
    this.track('load:fallback', { metadata, reason: 'cors-blocked', durationMs: this.now() - context.startTime });

    if (options.autoProxy) {
      return this.loadViaProxy(metadata, { ...options, context });
    }
    throw new Error('CORS 制限により直接読み込めませんでした。');
  }

  async loadViaIframe(metadata, options = {}) {
    if (!this.container) {
      throw new Error('RemoteSceneLoader: container が設定されていません。');
    }
    this.detachIframe();

    const context = options.context || null;
    const baseStart = context?.startTime ?? this.now();
    const iframe = document.createElement('iframe');
    iframe.dataset.role = 'remote-scene';
    iframe.allow = this.defaultAllow;
    iframe.referrerPolicy = this.defaultReferrerPolicy;
    iframe.sandbox = this.defaultSandbox;
    iframe.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      background: transparent;
      border-radius: 18px;
      box-shadow: 0 28px 64px rgba(15, 23, 42, 0.4);
      transform-origin: center;
      transition: transform 0.6s cubic-bezier(0.25, 0.8, 0.25, 1);
    `;
    const viaProxy = options.viaProxy === true;
    const onLoad = () => {
      iframe.dataset.state = 'loaded';
      iframe.style.transform = 'scale(1)';
      this.updateState({ status: 'ready', url: metadata.url.href, viaProxy });
      this.emit('loaded', { metadata, viaProxy });
      const duration = this.now() - baseStart;
      this.track('iframe:loaded', { metadata, viaProxy, durationMs: duration });
    };
    const onError = (event) => {
      this.updateState({ status: 'error', reason: 'iframe-error' });
      this.emit('error', { reason: 'iframe-error', event, metadata });
      const duration = this.now() - baseStart;
      this.track('iframe:error', { metadata, viaProxy, message: 'iframe load failed', durationMs: duration });
      if (!viaProxy && !metadata.sameOrigin && !options.preventAutoProxy) {
        this.track('proxy:auto-retry', { metadata });
        this.loadViaProxy(metadata, { ...options, viaProxy: true, preventAutoProxy: true, context }).catch(proxyError => {
          logger.error('Proxy retry failed', proxyError);
        });
      }
    };
    iframe.addEventListener('load', onLoad, { once: true });
    iframe.addEventListener('error', onError, { once: true });
    iframe.style.transform = 'scale(0.97)';

    this.container.innerHTML = '';
    this.container.appendChild(iframe);
    this.activeIframe = iframe;
    this.updateState({ status: 'loading', url: metadata.url.href, viaProxy });
    this.emit('progress', { stage: viaProxy ? 'loading-proxy' : 'loading-iframe', metadata });
    this.track('iframe:loading', { metadata, viaProxy });
    iframe.src = metadata.url.href;
    if (options.focus) {
      iframe.focus();
    }
    return { metadata, viaProxy, element: iframe };
  }

  async loadViaProxy(metadata, options = {}) {
    const context = options.context || { startTime: this.now() };
    context.proxyStart = this.now();
    this.updateState({ status: 'proxy-request', url: metadata.url.href, viaProxy: true });
    this.track('proxy:request', { url: metadata.url.href });

    if (this.serviceWorker?.controller && !options.forceHttpProxy) {
      const proxyResponse = await this.requestProxy(metadata.url.href);
      if (!proxyResponse?.ok) {
        this.emit('error', { reason: 'proxy-failed', metadata, proxyResponse });
        this.track('proxy:failed', { metadata, message: proxyResponse?.message });
        throw new Error(proxyResponse?.message || 'プロキシ経由の取得に失敗しました。');
      }

      const proxiedUrl = proxyResponse.url || `${this.proxyEndpoint}?id=${encodeURIComponent(proxyResponse.ticket)}`;
      const proxiedMetadata = { ...metadata, url: new URL(proxiedUrl, this.getBaseOrigin()) };
      this.emit('progress', { stage: 'loading-proxy', metadata: proxiedMetadata });
      const proxyDuration = this.now() - context.proxyStart;
      this.track('proxy:success', { metadata: proxiedMetadata, durationMs: proxyDuration, transport: 'sw' });
      return this.loadViaIframe(proxiedMetadata, { ...options, viaProxy: true, context });
    }

    if (!this.proxyEndpoint) {
      this.emit('error', { reason: 'proxy-unavailable', metadata });
      throw new Error('Proxy endpoint が設定されていません。');
    }

    const proxiedUrl = this.buildHttpProxyUrl(metadata.url.href);
    const proxiedMetadata = { ...metadata, url: proxiedUrl };
    this.emit('progress', { stage: 'loading-proxy', metadata: proxiedMetadata });
    const proxyDuration = this.now() - context.proxyStart;
    this.track('proxy:success', { metadata: proxiedMetadata, durationMs: proxyDuration, transport: 'http' });
    return this.loadViaIframe(proxiedMetadata, { ...options, viaProxy: true, context });
  }

  requestProxy(url) {
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => {
        resolve({ ok: false, message: 'プロキシ応答がタイムアウトしました。' });
      }, 5000);

      channel.port1.onmessage = event => {
        clearTimeout(timer);
        resolve(event.data);
      };

      try {
        this.serviceWorker.controller.postMessage({
          type: 'REMOTE_SCENE_PROXY_REQUEST',
          url,
          timestamp: Date.now()
        }, [channel.port2]);
      } catch (error) {
        clearTimeout(timer);
        resolve({ ok: false, message: error.message });
      }
    });
  }

  now() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  getBaseOrigin() {
    if (typeof window !== 'undefined' && window.location) {
      return window.location.origin;
    }
    return 'https://localhost';
  }

  buildHttpProxyUrl(targetUrl) {
    const base = this.getBaseOrigin();
    const endpoint = new URL(this.proxyEndpoint, base);
    endpoint.searchParams.set('url', targetUrl);
    return endpoint;
  }
}

export default RemoteSceneLoader;
