import { normalizeHtmlSandboxPolicy, DEFAULT_HTML_SANDBOX_POLICY } from './policy.js';
import { resolveThreeResource, THREE_VERSION } from '../utils/three-deps.js';

export class HtmlSandboxError extends Error {
  constructor(message, detail = {}) {
    super(message);
    this.name = 'HtmlSandboxError';
    this.detail = detail;
  }
}

const CHANNEL = 'chocodrop-html-sandbox';
const MAX_RESULT_WAIT_MS = 2000;
const IFRAME_MESSAGE_TIMEOUT_MS = 10000;

export class HtmlSandboxRunner {
  constructor(options = {}) {
    this.options = {
      maxLogEntries: 64,
      ...options
    };
    this.defaultPolicy = normalizeHtmlSandboxPolicy(options.defaultPolicy || DEFAULT_HTML_SANDBOX_POLICY);
    this.threeVersion = options.threeVersion || THREE_VERSION;
  }

  setDefaultPolicy(policy) {
    this.defaultPolicy = normalizeHtmlSandboxPolicy(policy || this.defaultPolicy);
  }

  setThreeVersion(version) {
    if (typeof version === 'string' && version.trim()) {
      this.threeVersion = version.trim();
    }
  }

  async convertFile(file, { policy } = {}) {
    const text = await file.text();
    const artifactBaseName = file.name.replace(/\.(html?)$/i, '') || file.name;
    return this.convertHtml(text, {
      fileName: file.name,
      artifactBaseName,
      policy,
      threeVersion: this.threeVersion
    });
  }

  async convertVirtualProject({ htmlText, fileName = 'inline.html', policy, virtualProject }) {
    if (!htmlText) {
      throw new Error('HTML コンテンツが空です');
    }
    const artifactBaseName = fileName.split('/').pop() || 'scene';
    return this.convertHtml(htmlText, { fileName, artifactBaseName, policy, virtualProject, threeVersion: this.threeVersion });
  }

  async convertHtml(
    htmlText,
    { fileName = 'inline.html', artifactBaseName = 'scene', policy, virtualProject, threeVersion } = {}
  ) {
    const effectivePolicy = normalizeHtmlSandboxPolicy(policy || this.defaultPolicy);
    const effectiveVersion = threeVersion || this.threeVersion || THREE_VERSION;
    const sandboxHtml = this.buildSandboxDocument(htmlText, { policy: effectivePolicy, fileName, threeVersion: effectiveVersion });
    return new Promise((resolve, reject) => {
      const iframe = this.createIframe(virtualProject);
      let iframeUrl = null;
      const logs = [];
      const state = {
        sceneJson: null,
        summary: null,
        glbBuffer: null,
        thumbnail: null,
        settled: false
      };

      const cleanup = () => {
        window.clearTimeout(hostTimeout);
        window.removeEventListener('message', handleMessage);
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
        if (iframeUrl) {
          URL.revokeObjectURL(iframeUrl);
          iframeUrl = null;
        }
        if (virtualProject?.dispose) {
          try {
            virtualProject.dispose();
          } catch (_) {
            /* noop */
          }
        }
      };

      const finishSuccess = () => {
        if (state.settled) return;
        if (!state.sceneJson) {
          finishError({ code: 'empty-result', message: 'Scene JSON を取得できませんでした' });
          return;
        }
        state.settled = true;
        cleanup();
        const files = [createJsonFile(state.sceneJson, `${artifactBaseName}.scene.json`)];
        const artifacts = {};
        if (state.glbBuffer) {
          artifacts.glbFile = new File([state.glbBuffer], `${artifactBaseName}.glb`, {
            type: 'model/gltf-binary'
          });
        }
        if (state.thumbnail?.dataUrl) {
          artifacts.thumbnailDataUrl = state.thumbnail.dataUrl;
          artifacts.thumbnailSize = {
            width: state.thumbnail.width || null,
            height: state.thumbnail.height || null
          };
        }
        resolve({
          files,
          artifacts,
          logs: logs.slice(-this.options.maxLogEntries),
          summary: state.summary,
          policy: effectivePolicy
        });
      };

      const finishError = detail => {
        if (state.settled) return;
        state.settled = true;
        cleanup();
        reject(new HtmlSandboxError(detail?.message || 'HTML の解析に失敗しました', {
          ...detail,
          logs: logs.slice(-this.options.maxLogEntries),
          policy: effectivePolicy
        }));
      };

      const hostTimeoutMs = Math.min(IFRAME_MESSAGE_TIMEOUT_MS, effectivePolicy.maxExecutionMs + MAX_RESULT_WAIT_MS);
      const hostTimeout = window.setTimeout(() => {
        finishError({
          code: 'host-timeout',
          message: 'サンドボックス応答が時間内に完了しませんでした'
        });
      }, hostTimeoutMs);

      const handleMessage = event => {
        if (event.source !== iframe.contentWindow) return;
        const data = event.data || {};
        if (data.source !== CHANNEL) return;
        switch (data.type) {
          case 'log':
            logs.push(data.payload);
            break;
          case 'policyViolation':
            logs.push({ level: 'error', message: data.payload?.message || 'ポリシー違反を検出しました' });
            finishError({
              code: data.payload?.code || 'policy-violation',
              message: data.payload?.message || '許可されていない操作が検出されました',
              detail: data.payload
            });
            break;
          case 'error':
            finishError(data.payload);
            break;
          case 'result':
            state.sceneJson = data.payload?.sceneJson;
            state.summary = data.payload?.summary;
            finishSuccess();
            break;
          case 'glb':
            if (data.payload?.buffer) {
              state.glbBuffer = data.payload.buffer;
            }
            break;
          case 'thumbnail':
            state.thumbnail = data.payload || null;
            break;
          default:
            break;
        }
      };

      window.addEventListener('message', handleMessage);
      const blob = new Blob([sandboxHtml], { type: 'text/html' });
      iframeUrl = URL.createObjectURL(blob);
      iframe.src = iframeUrl;
    });
  }

  createIframe(virtualProject) {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.style.position = 'absolute';
    iframe.style.left = '-9999px';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.opacity = '0';
    iframe.tabIndex = -1;
    if (virtualProject) {
      iframe.__chocodropVirtualProject = {
        baseDir: virtualProject.baseDir || '',
        files: Array.isArray(virtualProject.files) ? virtualProject.files : []
      };
    }
    document.body.appendChild(iframe);
    return iframe;
  }

  buildSandboxDocument(htmlText, { policy, fileName, threeVersion }) {
    const threeModule = resolveThreeResource('build/three.module.js', threeVersion);
    const examplesBase = resolveThreeResource('examples/jsm/', threeVersion);
    const importMap = `{"imports":{"three":"${threeModule}","three/examples/jsm/":"${examplesBase}"}}`;
    const headInjection = [
      '<meta charset="utf-8">',
      this.buildCspMeta(policy),
      this.buildConfigScript({ policy, fileName, threeVersion }),
      `<script type="importmap">${importMap}</script>`,
      `<script type="module">
        import * as THREE_NS from 'three';
        import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
        import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
        const THREE = { ...THREE_NS, GLTFExporter, BufferGeometryUtils };
        window.THREE = THREE;
        window.dispatchEvent(new Event('three-ready'));
      </script>`,
      `<script>window.__waitThree = new Promise(resolve => {
        const tick = () => {
          if (window.THREE && window.THREE.GLTFExporter) return resolve();
          setTimeout(tick, 10);
        };
        tick();
      });</script>`,
      '<script src="/html-sandbox/frame.js"></script>'
    ].join('\n');

    if (/<\/head>/i.test(htmlText)) {
      return htmlText.replace(/<\/head>/i, `${headInjection}\n</head>`);
    }

    if (/<head[^>]*>/i.test(htmlText)) {
      return htmlText.replace(/<head([^>]*)>/i, match => `${match}\n${headInjection}`);
    }

    if (/<html[^>]*>/i.test(htmlText)) {
      return htmlText.replace(/<html([^>]*)>/i, `<html$1><head>${headInjection}</head>`);
    }

    return `<!DOCTYPE html><html lang="ja"><head>${headInjection}</head><body>${htmlText}</body></html>`;
  }

  buildCspMeta(policy) {
    const hostTokens = policy.hosts.map(entry => (entry === 'self' ? "'self'" : entry));
    const scriptSrc = [`'unsafe-inline'`, ...hostTokens, 'blob:', 'data:'];
    const assetSrc = [...hostTokens, 'blob:', 'data:'];
    const policyString = [
      `default-src 'none'`,
      `script-src ${scriptSrc.join(' ')}`,
      `style-src 'unsafe-inline'`,
      `img-src ${assetSrc.join(' ')}`,
      `connect-src 'none'`,
      `media-src ${assetSrc.join(' ')}`,
      `font-src 'none'`,
      `frame-ancestors 'none'`,
      `worker-src 'self' blob:`,
      `base-uri 'none'`,
      `form-action 'none'`
    ].join('; ');
    return `<meta http-equiv="Content-Security-Policy" content="${policyString}">`;
  }

  buildConfigScript({ policy, fileName, threeVersion }) {
    const config = {
      fileName,
      allowedOrigins: policy.hosts,
      maxExecutionMs: policy.maxExecutionMs,
      autoExportIdleMs: policy.autoExportIdleMs,
      maxNetworkRequests: policy.maxNetworkRequests,
      threeVersion: threeVersion || this.threeVersion || THREE_VERSION
    };
    const serialized = JSON.stringify(config).replace(/<\//g, '<\\/');
    return `<script>window.__CHOCODROP_HTML_SANDBOX_CONFIG = ${serialized};</script>`;
  }
}

function createJsonFile(sceneJson, fileName) {
  const blob = new Blob([JSON.stringify(sceneJson)], { type: 'application/json' });
  return new File([blob], fileName, { type: 'application/json' });
}
