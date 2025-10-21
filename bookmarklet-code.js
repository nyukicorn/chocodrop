// ChocoDrop Bookmarklet v2 - コンソール実行用
// このコードをコピーして、ブラウザのコンソールに貼り付けてください

(async () => {
  const b = 'http://127.0.0.1:43110';
  let toastDismissed = false;

  async function check() {
    try {
      const r = await fetch(b + '/v1/health');
      return r.ok;
    } catch {
      return false;
    }
  }

  async function showToast() {
    if (toastDismissed) return;
    if (document.getElementById('__cd_toast__')) return;

    const t = document.createElement('div');
    t.id = '__cd_toast__';
    Object.assign(t.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      zIndex: '2147483647',
      width: 'min(380px, calc(100vw - 32px))',
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif'
    });

    t.innerHTML = `
      <div style="background:#18181c; color:#fff; padding:14px 16px; border-radius:14px; box-shadow:0 10px 30px rgba(0,0,0,.35)">
        <div style="font-weight:700; display:flex; gap:8px; align-items:center">
          <span id="cd-title">🍫 ChocoDrop が起動していません</span>
          <span id="cd-dot" style="margin-left:auto;width:8px;height:8px;border-radius:50%;background:#f43"></span>
          <button id="cd-dismiss" type="button" style="border:0;background:transparent;color:rgba(255,255,255,0.75);cursor:pointer;font-size:16px;line-height:1;padding:2px;">×</button>
        </div>
        <div style="font-size:12px; opacity:.85; margin-top:6px">ローカル(127.0.0.1)のみで動作・外部送信なし。起動すると自動で接続します。</div>
        <div style="display:grid; gap:8px; margin-top:12px">
          <button id="cd-guide" style="padding:10px 12px; border:0; border-radius:10px; cursor:pointer; background:#fff; color:#111; font-weight:600;">起動ガイドを開く</button>
          <button id="cd-retry" style="padding:10px 12px; border:1px solid #444; border-radius:10px; cursor:pointer; background:transparent; color:#fff;">再試行</button>
        </div>
      </div>`;

    document.body.appendChild(t);

    const d = t.querySelector('#cd-dot');
    const title = t.querySelector('#cd-title');
    const closeButton = t.querySelector('#cd-dismiss');
    const g = document.createElement('dialog');
    g.style.border = '0';
    g.style.borderRadius = '14px';
    g.style.padding = '0';
    g.style.maxWidth = '560px';
    g.style.width = 'calc(100vw - 40px)';
    g.innerHTML = `
      <div style="background:#161618; color:#fff; padding:16px; border-radius:14px">
        <div style="font-weight:700; margin-bottom:8px">起動ガイド</div>
        <pre id="cd-code" style="background:#0e0e10; color:#eaeaea; padding:12px; border-radius:10px; overflow:auto; margin:0; font-size:13px">npx --yes @chocodrop/daemon@alpha</pre>
        <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:12px">
          <button id="cd-copy" style="padding:8px 10px; border-radius:8px; border:0; cursor:pointer; background:#444; color:#fff">コピー</button>
          <button id="cd-done" style="padding:8px 10px; border-radius:8px; border:0; cursor:pointer; background:#fff; color:#111">OK</button>
        </div>
      </div>`;

    document.body.appendChild(g);

    t.querySelector('#cd-guide').onclick = () => g.showModal();
    g.querySelector('#cd-done').onclick = () => g.close();
    g.querySelector('#cd-copy').onclick = async () => {
      try {
        await navigator.clipboard.writeText('npx --yes @chocodrop/daemon@alpha');
        const btn = g.querySelector('#cd-copy');
        btn.textContent = 'コピー完了！';
        setTimeout(() => { btn.textContent = 'コピー'; }, 1000);
      } catch (e) {
        console.error('Clipboard error:', e);
      }
    };

    t.querySelector('#cd-retry').onclick = poll;

    let dismissed = false;

    function teardown(autoConnected = false) {
      if (dismissed) return;
      dismissed = true;
      if (!autoConnected) {
        toastDismissed = true;
      }
      if (g.open) {
        g.close();
      }
      g.remove();
      if (t.parentElement) {
        t.parentElement.removeChild(t);
      }
    }

    closeButton.onclick = () => {
      teardown(false);
    };

    async function poll() {
      if (dismissed) return;

      const ok = await check();
      d.style.background = ok ? '#0f6' : '#f43';
      if (ok) {
        if (title) {
          title.textContent = '🍫 接続できました';
        }
        setTimeout(() => {
          teardown(true);
          loadSDK();
        }, 700);
      } else {
        setTimeout(() => {
          if (!dismissed) {
            poll();
          }
        }, 2500);
      }
    }

    poll();
  }

  function findThreeObjects(w) {
    let scene, camera, renderer;
    for (const key in w) {
      const val = w[key];
      if (val?.isScene) scene = val;
      if (val?.isCamera) camera = val;
      if (val?.isWebGLRenderer) renderer = val;
    }
    return { scene, camera, renderer };
  }

  async function attachChoco(targetWindow) {
    await targetWindow.chocodrop.ready();
    const three = findThreeObjects(targetWindow);
    const opts = three.scene ? { camera: three.camera, renderer: three.renderer } : {};
    await targetWindow.chocodrop.attach(three.scene || null, opts);
  }

  function loadSDK() {
    const iframe = document.querySelector('iframe');
    const targetWindow = iframe?.contentWindow || window;
    const targetDoc = iframe?.contentDocument || document;
    const existing = targetDoc.getElementById('__chocodrop_sdk');

    if (existing && targetWindow.chocodrop) {
      attachChoco(targetWindow).catch(e => console.warn('ChocoDrop:', e));
      return;
    }

    const s = targetDoc.createElement('script');
    s.id = '__chocodrop_sdk';
    s.src = b + '/sdk.js';
    s.onload = () => {
      console.log('✅ SDK loaded');
      attachChoco(targetWindow).catch(e => console.warn('ChocoDrop:', e));
    };
    s.onerror = () => console.error('❌ SDK load failed');
    targetDoc.head.appendChild(s);
  }

  console.log('🍫 ChocoDrop Bookmarklet v2');
  const isRunning = await check();
  console.log('Daemon status:', isRunning ? '✅ Running' : '❌ Stopped');

  if (isRunning) {
    loadSDK();
  } else {
    showToast();
  }
})();
