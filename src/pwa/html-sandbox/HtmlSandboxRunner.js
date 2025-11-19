import { normalizeHtmlSandboxPolicy, DEFAULT_HTML_SANDBOX_POLICY } from './policy.js';
import { resolveThreeResource } from '../utils/three-deps.js';

export class HtmlSandboxError extends Error {
  constructor(message, detail = {}) {
    super(message);
    this.name = 'HtmlSandboxError';
    this.detail = detail;
  }
}

const CHANNEL = 'chocodrop-html-sandbox';
const MAX_RESULT_WAIT_MS = 2000;
const THREE_SCRIPT = resolveThreeResource('build/three.min.js');
const GLTF_EXPORTER_SCRIPT = resolveThreeResource('examples/js/exporters/GLTFExporter.js');

export class HtmlSandboxRunner {
  constructor(options = {}) {
    this.options = {
      maxLogEntries: 64,
      ...options
    };
    this.defaultPolicy = normalizeHtmlSandboxPolicy(options.defaultPolicy || DEFAULT_HTML_SANDBOX_POLICY);
  }

  setDefaultPolicy(policy) {
    this.defaultPolicy = normalizeHtmlSandboxPolicy(policy || this.defaultPolicy);
  }

  async convertFile(file, { policy } = {}) {
    const text = await file.text();
    const artifactBaseName = file.name.replace(/\.(html?)$/i, '') || file.name;
    return this.convertHtml(text, {
      fileName: file.name,
      artifactBaseName,
      policy
    });
  }

  async convertVirtualProject({ htmlText, fileName = 'inline.html', policy, virtualProject }) {
    if (!htmlText) {
      throw new Error('HTML コンテンツが空です');
    }
    const artifactBaseName = fileName.split('/').pop() || 'scene';
    return this.convertHtml(htmlText, { fileName, artifactBaseName, policy, virtualProject });
  }

  async convertHtml(htmlText, { fileName = 'inline.html', artifactBaseName = 'scene', policy, virtualProject } = {}) {
    const effectivePolicy = normalizeHtmlSandboxPolicy(policy || this.defaultPolicy);
    const sandboxHtml = this.buildSandboxDocument(htmlText, { policy: effectivePolicy, fileName });
    return new Promise((resolve, reject) => {
      const iframe = this.createIframe(virtualProject);
      const logs = [];
      const state = {
        sceneJson: null,
        summary: null,
        glbBuffer: null,
        settled: false
      };

      const cleanup = () => {
        window.clearTimeout(hostTimeout);
        window.removeEventListener('message', handleMessage);
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
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

      const hostTimeout = window.setTimeout(() => {
        finishError({
          code: 'host-timeout',
          message: 'サンドボックス応答が時間内に完了しませんでした'
        });
      }, effectivePolicy.maxExecutionMs + MAX_RESULT_WAIT_MS);

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
          default:
            break;
        }
      };

      window.addEventListener('message', handleMessage);
      iframe.srcdoc = sandboxHtml;
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

  buildSandboxDocument(htmlText, { policy, fileName }) {
    const headInjection = [
      '<meta charset="utf-8">',
      this.buildCspMeta(policy),
      this.buildConfigScript({ policy, fileName }),
      `<script src="${THREE_SCRIPT}" crossorigin="anonymous"></script>`,
      `<script src="${GLTF_EXPORTER_SCRIPT}" crossorigin="anonymous"></script>`,
      '<script src="/html-sandbox/frame.js"></script>'
    ].join('\n');

    if (/<!doctype/i.test(htmlText) && /<head[^>]*>/i.test(htmlText)) {
      return htmlText.replace(/<head([^>]*)>/i, match => `${match}\n${headInjection}`);
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
    const connectSrc = [...hostTokens, 'blob:', 'data:'];
    const assetSrc = [...hostTokens, 'blob:', 'data:'];
    const policyString = [
      `default-src 'none'`,
      `script-src ${scriptSrc.join(' ')}`,
      `style-src 'unsafe-inline'`,
      `img-src ${assetSrc.join(' ')}`,
      `connect-src ${connectSrc.join(' ')}`,
      `media-src ${assetSrc.join(' ')}`,
      `font-src 'none'`,
      `frame-ancestors 'none'`,
      `worker-src 'self' blob:`,
      `base-uri 'none'`,
      `form-action 'none'`
    ].join('; ');
    return `<meta http-equiv="Content-Security-Policy" content="${policyString}">`;
  }

  buildConfigScript({ policy, fileName }) {
    const config = {
      fileName,
      allowedOrigins: policy.hosts,
      maxExecutionMs: policy.maxExecutionMs,
      autoExportIdleMs: policy.autoExportIdleMs,
      maxNetworkRequests: policy.maxNetworkRequests
    };
    const serialized = JSON.stringify(config).replace(/<\//g, '<\\/');
    return `<script>window.__CHOCODROP_HTML_SANDBOX_CONFIG = ${serialized};</script>`;
  }
}

function createJsonFile(sceneJson, fileName) {
  const blob = new Blob([JSON.stringify(sceneJson)], { type: 'application/json' });
  return new File([blob], fileName, { type: 'application/json' });
}
