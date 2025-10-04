/**
 * ChocoDrop Browser SDK - Minimal version with existing UI integration
 */

(() => {
  const BASE = 'http://127.0.0.1:43110';
  const ORIGIN = typeof location !== 'undefined' ? location.origin : '';

  /**
   * Timeout helper
   */
  function timeout(ms) {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms)
    );
  }

  /**
   * Ping daemon health
   */
  async function ping() {
    try {
      const response = await Promise.race([
        fetch(`${BASE}/v1/health`),
        timeout(1000)
      ]);
      return response && response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get or create root overlay element
   */
  function getRootOverlay() {
    let el = document.getElementById('__chocodrop_overlay__');
    if (!el) {
      el = document.createElement('div');
      el.id = '__chocodrop_overlay__';
      Object.assign(el.style, {
        position: 'fixed',
        right: '16px',
        bottom: '16px',
        zIndex: '999999'
      });
      document.body.appendChild(el);
    }
    return el;
  }

  /**
   * Show friendly startup toast with polling
   */
  function showStartToast({ base = BASE, pollMs = 2500 } = {}) {
    if (document.getElementById('__chocodrop_start_toast__')) return;

    const root = document.createElement('div');
    root.id = '__chocodrop_start_toast__';
    Object.assign(root.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      zIndex: '2147483647',
      width: 'min(380px, calc(100vw - 32px))',
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif'
    });

    root.innerHTML = `
      <div style="background:#18181c; color:#fff; padding:14px 16px; border-radius:14px; box-shadow:0 10px 30px rgba(0,0,0,.35)">
        <div style="font-weight:700; display:flex; gap:8px; align-items:center">
          <span>🍫 ChocoDrop が起動していません</span>
          <span id="cd-dot" style="margin-left:auto;width:8px;height:8px;border-radius:50%;background:#f43"></span>
        </div>
        <div style="font-size:12px; opacity:.85; margin-top:6px">ローカル(127.0.0.1)のみで動作・外部送信なし。起動すると自動で接続します。</div>
        <div style="display:grid; gap:8px; margin-top:12px">
          <button id="cd-open-guide" style="padding:10px 12px; border:0; border-radius:10px; cursor:pointer; background:#fff; color:#111; font-weight:600;">起動ガイドを開く</button>
          <button id="cd-retry" style="padding:10px 12px; border:1px solid #444; border-radius:10px; cursor:pointer; background:transparent; color:#fff;">再試行</button>
        </div>
      </div>`;

    document.body.appendChild(root);

    const dot = root.querySelector('#cd-dot');
    const guide = document.createElement('dialog');
    guide.style.border = '0';
    guide.style.borderRadius = '14px';
    guide.style.padding = '0';
    guide.style.maxWidth = '560px';
    guide.style.width = 'calc(100vw - 40px)';
    guide.innerHTML = `
      <div style="background:#161618; color:#fff; padding:16px; border-radius:14px">
        <div style="font-weight:700; margin-bottom:8px">起動ガイド</div>
        <pre id="cd-code" style="background:#0e0e10; color:#eaeaea; padding:12px; border-radius:10px; overflow:auto; margin:0; font-size:13px"></pre>
        <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:12px">
          <button id="cd-copy" style="padding:8px 10px; border-radius:8px; border:0; cursor:pointer; background:#444; color:#fff">コピー</button>
          <button id="cd-done" style="padding:8px 10px; border-radius:8px; border:0; cursor:pointer; background:#fff; color:#111">OK</button>
        </div>
      </div>`;

    document.body.appendChild(guide);

    const isMac = /Mac|Darwin/i.test(navigator.platform) || /Mac OS X/i.test(navigator.userAgent);
    const isWin = /Win/i.test(navigator.platform) || /Windows/i.test(navigator.userAgent);
    const cmd = 'npx --yes @chocodrop/daemon@alpha';
    guide.querySelector('#cd-code').textContent = cmd;

    root.querySelector('#cd-open-guide').onclick = () => guide.showModal();
    guide.querySelector('#cd-done').onclick = () => guide.close();
    guide.querySelector('#cd-copy').onclick = async () => {
      try {
        await navigator.clipboard.writeText(cmd);
        const btn = guide.querySelector('#cd-copy');
        btn.textContent = 'コピー完了！';
        setTimeout(() => { btn.textContent = 'コピー'; }, 1000);
      } catch (e) {
        console.warn('Clipboard write failed:', e);
      }
    };
    root.querySelector('#cd-retry').onclick = loop;

    async function checkPing() {
      try {
        const r = await fetch(`${base}/v1/health`, { method: 'GET' });
        return r.ok;
      } catch {
        return false;
      }
    }

    async function loop() {
      const ok = await checkPing();
      dot.style.background = ok ? '#0f6' : '#f43';
      if (ok) {
        root.querySelector('span').textContent = '🍫 接続できました';
        setTimeout(() => root.remove(), 700);
      } else {
        setTimeout(loop, pollMs);
      }
    }

    loop();
  }

  /**
   * Check if daemon is running
   */
  async function ready() {
    const isRunning = await ping();
    if (isRunning) {
      console.log('✅ ChocoDrop daemon is ready');
      return true;
    }

    // Daemon not running - show friendly toast UI
    showStartToast({ base: BASE });
    throw new Error('ChocoDrop daemon not running - please start it');
  }

  /**
   * Reload daemon configuration
   */
  async function reload() {
    try {
      // Get CSRF token first
      const tokenRes = await fetch(`${BASE}/v1/csrf-token`);
      const { csrfToken } = await tokenRes.json();

      const response = await fetch(`${BASE}/v1/reload`, {
        method: 'POST',
        headers: {
          'x-chocodrop-origin': ORIGIN,
          'x-csrf-token': csrfToken
        }
      });
      if (!response.ok) {
        throw new Error(`Reload failed: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to reload configuration:', error);
      throw error;
    }
  }

  /**
   * Load THREE from CDN if not already available
   */
  async function ensureThreeAvailable() {
    if (typeof window !== 'undefined' && window.THREE) {
      return true; // Already available
    }

    try {
      console.log('📦 Loading THREE from CDN...');
      const mod = await import('https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js');
      if (typeof window !== 'undefined') {
        window.THREE = mod;
      }
      console.log('✅ THREE loaded from CDN');
      return true;
    } catch (error) {
      console.warn('Failed to load THREE from CDN:', error);
      return false;
    }
  }

  /**
   * Attach ChocoDrop to scene
   */
  async function attach(scene, opts = {}) {
    const root = getRootOverlay();
    let mounted = false;

    // Auto-detect environment and load appropriate bundle
    try {
      // Ensure THREE is available globally
      await ensureThreeAvailable();

      const hasGlobalThree = typeof window !== 'undefined' && window.THREE;

      if (hasGlobalThree) {
        // Load global.js (IIFE bundle) for external sites using <script> tag
        console.log('🌐 Detected window.THREE - loading global bundle');

        // Use script tag to load IIFE bundle (not import, which creates module scope)
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = `${BASE}/ui/ui.global.js`;
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });

        if (window.ChocoDropUI && window.ChocoDropUI.attach) {
          const result = await window.ChocoDropUI.attach(scene, opts);
          mounted = true;
          console.log('✅ ChocoDrop UI loaded from global bundle');
          return { ...result, reload };
        }
      } else {
        // Load ESM bundle for bundler environments
        console.log('📦 Loading ESM bundle');
        const mod = await import(`${BASE}/ui/ui.esm.js`);

        if (mod.attach) {
          const result = await mod.attach(scene, opts);
          mounted = true;
          console.log('✅ ChocoDrop UI loaded from ESM bundle');
          return { ...result, reload };
        }
      }
    } catch (error) {
      console.warn('Could not load UI bundle, using fallback:', error);
    }

    // Fallback: Simple placeholder UI
    if (!mounted) {
      root.innerHTML = '';
      const wrapper = document.createElement('div');
      Object.assign(wrapper.style, {
        background: 'rgba(20, 20, 20, 0.95)',
        color: '#fff',
        padding: '12px 16px',
        borderRadius: '12px',
        boxShadow: '0 6px 18px rgba(0, 0, 0, 0.3)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '14px'
      });

      wrapper.innerHTML = `
        <div style="margin-bottom: 8px; font-weight: 600;">🍫 ChocoDrop</div>
        <button id="__cd_reload__" style="
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: white;
          padding: 6px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
        ">🔄 Reload Config</button>
      `;

      root.appendChild(wrapper);

      const reloadBtn = wrapper.querySelector('#__cd_reload__');
      reloadBtn.onclick = async () => {
        try {
          await reload();
          alert('Configuration reloaded!');
        } catch (error) {
          alert('Failed to reload: ' + error.message);
        }
      };

      console.log('✅ ChocoDrop placeholder UI loaded');
    }

    return {
      reload
    };
  }

  // Export to window
  if (typeof window !== 'undefined') {
    window.chocodrop = { ready, attach, reload };
  }

  // Export for ES modules
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ready, attach, reload };
  }
})();
