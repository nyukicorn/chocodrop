const THREE_LIKE_EXT = ['.html', '.htm', '.gltf', '.glb', '.json', '.js'];
const HTTPS_ONLY_ERROR = 'RemoteSceneLoader は HTTPS のみ対応しています';

const defaultFetcher = async url => fetch(url, { method: 'HEAD', mode: 'cors' });

/**
 * RemoteSceneLoader は公開済み Three.js シーンを安全に iframe へ読み込むヘルパー。
 * - URL の検証と CORS 判定
 * - プロキシ経由での再取得導線
 * - セキュアな iframe sandbox 設定
 */
export class RemoteSceneLoader extends EventTarget {
  constructor(options = {}) {
    super();
    this.proxyOrigin = options.proxyOrigin || null;
    this.fetcher = options.fetcher || defaultFetcher;
    this.allowedProtocols = options.allowedProtocols || ['https:'];
    this.corsRetryLimit = options.corsRetryLimit ?? 1;
    this.log = options.log || (() => {});
  }

  async analyze(rawUrl) {
    const target = this._normalizeUrl(rawUrl);
    if (!this.allowedProtocols.includes(target.protocol)) {
      throw new Error(HTTPS_ONLY_ERROR);
    }

    const result = {
      url: target.href,
      origin: target.origin,
      extension: this._getExtension(target.pathname),
      sameOrigin: target.origin === (typeof location !== 'undefined' ? location.origin : ''),
      contentType: null,
      needsProxy: false,
      corsAllowed: false,
      error: null
    };

    try {
      const response = await this.fetcher(target.href);
      if (response?.ok) {
        result.contentType = response.headers.get('content-type');
        const allowOrigin = response.headers.get('access-control-allow-origin');
        const allowPrivate = response.headers.get('access-control-allow-private-network');
        result.corsAllowed = this._isCorsAllowed(allowOrigin, allowPrivate);
        result.needsProxy = !result.corsAllowed && !result.sameOrigin;

        const framePolicy = this._evaluateFramePolicy({
          url: target,
          xFrameOptions: response.headers.get('x-frame-options'),
          contentSecurityPolicy: response.headers.get('content-security-policy')
        });
        result.framePolicy = framePolicy;
        result.frameBlocked = framePolicy.blocked;
      } else {
        result.needsProxy = !result.sameOrigin;
        result.error = new Error(`HEAD request failed: ${response?.status || 'unknown status'}`);
      }
    } catch (error) {
      result.needsProxy = !result.sameOrigin;
      result.error = error;
      this.log('cors:head-error', { url: target.href, message: error?.message });
    }

    this.dispatchEvent(new CustomEvent('analyze', { detail: result }));
    return result;
  }

  createSandboxedFrame(targetUrl, options = {}) {
    if (typeof document === 'undefined') {
      throw new Error('RemoteSceneLoader はブラウザ環境でのみ使用できます');
    }
    const iframe = document.createElement('iframe');
    iframe.src = options.useProxy ? this._buildProxyUrl(targetUrl) : targetUrl;
    iframe.setAttribute('allow', 'xr-spatial-tracking; vr; fullscreen');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    iframe.setAttribute('loading', 'eager');
    iframe.style.border = '0';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    return iframe;
  }

  async load(container, rawUrl, options = {}) {
    if (!container) {
      throw new Error('コンテナ要素が必要です');
    }
    const analysis = await this.analyze(rawUrl);
    const useProxy = options.forceProxy || analysis.needsProxy;
    const frame = this.createSandboxedFrame(analysis.url, { useProxy });

    container.innerHTML = '';
    container.appendChild(frame);
    container.classList.add('visible');

    const recovery = () => this._buildRecoveryPlan(analysis);
    const onLoad = () => {
      this.dispatchEvent(new CustomEvent('loaded', { detail: { url: analysis.url, useProxy } }));
    };
    const onError = () => {
      this.dispatchEvent(new CustomEvent('error', {
        detail: {
          url: analysis.url,
          useProxy,
          recovery: recovery()
        }
      }));
      if (!useProxy && this.proxyOrigin && options.allowAutoProxy !== false) {
        this.dispatchEvent(new CustomEvent('fallback', { detail: { url: analysis.url, mode: 'proxy' } }));
        this.load(container, rawUrl, { forceProxy: true, allowAutoProxy: false }).catch(error => {
          console.warn('RemoteSceneLoader fallback failed', error);
        });
      }
    };

    frame.addEventListener('load', onLoad, { once: true });
    frame.addEventListener('error', onError, { once: true });

    return { frame, analysis, recovery: recovery() };
  }

  _buildProxyUrl(targetUrl) {
    if (!this.proxyOrigin) return targetUrl;
    const encoded = encodeURIComponent(targetUrl);
    return `${this.proxyOrigin.replace(/\/$/, '')}/proxy?url=${encoded}`;
  }

  _normalizeUrl(url) {
    if (url instanceof URL) return url;
    if (typeof url !== 'string') {
      throw new TypeError('URL は文字列で指定してください');
    }
    return new URL(url, typeof location !== 'undefined' ? location.href : 'https://example.com');
  }

  _getExtension(pathname = '') {
    const lower = pathname.toLowerCase();
    return THREE_LIKE_EXT.find(ext => lower.endsWith(ext)) || null;
  }

  _isCorsAllowed(allowOrigin, allowPrivate) {
    if (!allowOrigin) return false;
    if (allowOrigin === '*') return true;
    if (typeof location === 'undefined') return false;
    return allowOrigin.includes(location.origin) && (!allowPrivate || allowPrivate === 'true' || allowPrivate === '1');
  }

  _buildRecoveryPlan(analysis) {
    const actions = [
      {
        id: 'download',
        label: 'ローカルに保存して読み込む',
        type: 'download'
      },
      {
        id: 'proxy',
        label: 'プロキシ経由で再試行',
        type: 'proxy',
        available: Boolean(this.proxyOrigin)
      },
      {
        id: 'guide',
        label: 'CORS 設定ガイドを確認',
        type: 'guide',
        url: 'https://developer.mozilla.org/ja/docs/Web/HTTP/CORS'
      }
    ];

    if (analysis.framePolicy?.blocked) {
      actions.push({
        id: 'frame-policy',
        label: 'frame-ancestors 設定ガイド',
        type: 'guide',
        url: 'https://developer.mozilla.org/ja/docs/Web/HTTP/Headers/Content-Security-Policy/frame-ancestors',
        note: analysis.framePolicy.reason
      });
    }

    return {
      url: analysis.url,
      origin: analysis.origin,
      extension: analysis.extension,
      sameOrigin: analysis.sameOrigin,
      framePolicy: analysis.framePolicy,
      actions
    };
  }

  _evaluateFramePolicy({ url, xFrameOptions, contentSecurityPolicy }) {
    const result = {
      blocked: false,
      reason: null,
      headers: { xFrameOptions, contentSecurityPolicy }
    };

    const origin = typeof location !== 'undefined' ? location.origin : null;

    if (xFrameOptions) {
      const normalized = xFrameOptions.trim().toUpperCase();
      if (normalized === 'DENY') {
        result.blocked = true;
        result.reason = 'X-Frame-Options: DENY が設定されています';
        return result;
      }
      if (normalized === 'SAMEORIGIN') {
        if (origin && origin !== url.origin) {
          result.blocked = true;
          result.reason = `X-Frame-Options: SAMEORIGIN により ${origin} からの埋め込みが拒否されます`;
          return result;
        }
      }
    }

    if (contentSecurityPolicy) {
      const frameDirective = this._extractFrameAncestors(contentSecurityPolicy);
      if (frameDirective) {
        if (frameDirective.includes("'none'")) {
          result.blocked = true;
          result.reason = "CSP frame-ancestors 'none' が設定されています";
          return result;
        }
        const allowed = frameDirective.some(token => {
          if (token === '*') return true;
          if (!origin) return false;
          if (token === origin) return true;
          if (token.endsWith('://*')) {
            const scheme = token.slice(0, token.indexOf('://') + 3);
            return origin.startsWith(scheme);
          }
          return false;
        });
        if (!allowed) {
          result.blocked = true;
          result.reason = 'CSP frame-ancestors 制約により現在のオリジンからは埋め込めません';
          return result;
        }
      }
    }

    return result;
  }

  _extractFrameAncestors(csp) {
    const directives = csp.split(';').map(part => part.trim());
    const frameDirective = directives.find(part => part.toLowerCase().startsWith('frame-ancestors'));
    if (!frameDirective) return null;
    const tokens = frameDirective.split(/\s+/).slice(1);
    return tokens.length > 0 ? tokens : null;
  }
}

export default RemoteSceneLoader;
