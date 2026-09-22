const DEFAULT_BASE = 'http://127.0.0.1:43110';
const DEFAULT_RUNTIME = 'https://nyukicorn.github.io/chocodrop/runtime/ui.global.js';

export function normalizeDaemonBase(value = DEFAULT_BASE) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.port !== '43110') {
    throw new Error('ChocoDrop daemon must use http://127.0.0.1:43110');
  }
  return url.origin;
}

function normalizeRuntimeUrl(value = DEFAULT_RUNTIME) {
  const url = new URL(value);
  const isLocalPreview = url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (url.protocol !== 'https:' && !isLocalPreview) {
    throw new Error('ChocoDrop runtime must use HTTPS or a local preview URL');
  }
  return url.href;
}

export function createBookmarklet(value = DEFAULT_BASE, runtimeValue = DEFAULT_RUNTIME) {
  const base = normalizeDaemonBase(value);
  const runtimeUrl = normalizeRuntimeUrl(runtimeValue);

  async function run(daemonBase, uiRuntimeUrl) {
    const ids = {
      notice: '__chocodrop_bookmarklet_notice__',
      runtime: '__chocodrop_bookmarklet_runtime__'
    };

    function notice(title, message, command = '') {
      document.getElementById(ids.notice)?.remove();
      const root = document.createElement('div');
      root.id = ids.notice;
      root.setAttribute('role', 'status');
      Object.assign(root.style, {
        position: 'fixed',
        right: '18px',
        bottom: '18px',
        zIndex: '2147483647',
        width: 'min(390px, calc(100vw - 36px))',
        padding: '16px',
        border: '1px solid rgba(214, 170, 239, .35)',
        borderRadius: '16px',
        background: '#211d28',
        color: '#f7eff5',
        boxShadow: '0 18px 60px rgba(9, 7, 13, .45)',
        font: '13px/1.7 system-ui, -apple-system, sans-serif'
      });
      const heading = document.createElement('strong');
      heading.textContent = `🍫 ${title}`;
      heading.style.display = 'block';
      heading.style.paddingRight = '32px';
      const body = document.createElement('p');
      body.textContent = message;
      body.style.margin = '7px 0 0';
      body.style.color = '#d3c5d8';
      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = '×';
      close.setAttribute('aria-label', '閉じる');
      Object.assign(close.style, {
        position: 'absolute',
        top: '9px',
        right: '10px',
        border: '0',
        background: 'transparent',
        color: '#f7eff5',
        fontSize: '22px',
        cursor: 'pointer'
      });
      close.onclick = () => root.remove();
      root.append(heading, body, close);
      if (command) {
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.textContent = '起動コマンドをコピー';
        Object.assign(copy.style, {
          marginTop: '12px',
          padding: '9px 14px',
          border: '0',
          borderRadius: '999px',
          background: '#cda8ef',
          color: '#281935',
          fontWeight: '700',
          cursor: 'pointer'
        });
        copy.onclick = async () => {
          try {
            await navigator.clipboard.writeText(command);
            copy.textContent = 'コピーしました';
          } catch {
            copy.textContent = command;
          }
        };
        root.append(copy);
      }
      document.body.append(root);
      return root;
    }

    async function daemonIsReady() {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1800);
      try {
        const response = await fetch(`${daemonBase}/v1/health`, {
          cache: 'no-store',
          signal: controller.signal
        });
        return response.ok;
      } catch {
        return false;
      } finally {
        clearTimeout(timer);
      }
    }

    function findThreeObjects() {
      let scene = null;
      let camera = null;
      let renderer = null;
      const preferred = ['scene', 'camera', 'renderer'];
      const keys = [...new Set([...preferred, ...Object.keys(window)])];
      for (const key of keys) {
        let value;
        try {
          value = window[key];
        } catch {
          continue;
        }
        if (!scene && value?.isScene) scene = value;
        if (!camera && value?.isCamera) camera = value;
        if (!renderer && value?.isWebGLRenderer) renderer = value;
        if (scene && camera && renderer) break;
      }
      return { scene, camera, renderer };
    }

    async function ensureThree() {
      if (window.THREE) return;
      const threeUrl = new URL('../vendor/three-0.170.0.min.js', uiRuntimeUrl).href;
      window.THREE = await import(threeUrl);
    }

    async function attach(three) {
      if (!window.ChocoDropUI?.attach) throw new Error('ChocoDrop UI API was not found');
      await window.ChocoDropUI.attach(three.scene, {
        camera: three.camera,
        renderer: three.renderer
      });
      window.__chocodropBookmarkletAttached = true;
      notice('接続しました', 'Three.jsシーンを検出しました。右下のChocoDropを開いてください。');
    }

    if (window.__chocodropBookmarkletAttached) {
      notice('接続済みです', '右下のChocoDropを開いてください。');
      return;
    }

    if (!(await daemonIsReady())) {
      notice(
        'ローカルdaemonを起動してください',
        'ターミナルで起動した後、このブックマークをもう一度押してください。',
        'pnpm dlx @chocodrop/daemon@1.0.4-alpha.1'
      );
      return;
    }

    const three = findThreeObjects();
    if (!three.scene) {
      notice('Three.jsシーンが見つかりません', 'このページでは素材を配置できません。シーンをグローバルに公開したページでお試しください。');
      return;
    }

    try {
      await ensureThree();
    } catch {
      notice('Three.jsを準備できませんでした', 'このページのセキュリティ設定が、必要なモジュールの読込を禁止している可能性があります。');
      return;
    }

    const existing = document.getElementById(ids.runtime);
    if (existing && window.ChocoDropUI) {
      try {
        await attach(three);
      } catch (error) {
        notice('接続できませんでした', error?.message || 'ページを再読み込みして、もう一度お試しください。');
      }
      return;
    }

    const script = document.createElement('script');
    script.id = ids.runtime;
    script.src = uiRuntimeUrl;
    script.crossOrigin = 'anonymous';
    script.onload = () => attach(three).catch(error => {
      notice('接続できませんでした', error?.message || 'ページを再読み込みして、もう一度お試しください。');
    });
    script.onerror = () => {
      notice('ChocoDropを読み込めませんでした', 'このページのセキュリティ設定が、ローカルスクリプトを禁止している可能性があります。');
    };
    document.head.append(script);
  }

  return `javascript:(${run.toString()})(${JSON.stringify(base)},${JSON.stringify(runtimeUrl)})`;
}
