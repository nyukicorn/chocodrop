/**
 * ChocoDrop Browser SDK - Minimal version with existing UI integration
 */

(() => {
  const BASE = 'http://127.0.0.1:43110';
  const ORIGIN = typeof location !== 'undefined' ? location.origin : '';

  /**
   * Restore and persist chocodropConfig across page reloads
   * Fixes Issue #3: allowCdn: false not persisting
   */
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      // Restore from localStorage
      const stored = localStorage.getItem('chocodropConfig');
      const storedConfig = stored ? JSON.parse(stored) : {};

      // Merge with window config (window takes precedence)
      window.chocodropConfig = {
        ...storedConfig,
        ...(window.chocodropConfig || {})
      };

      // Save merged config back to localStorage
      localStorage.setItem('chocodropConfig', JSON.stringify(window.chocodropConfig));
    } catch (err) {
      console.warn('Failed to restore chocodropConfig:', err);
    }
  }

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
   * Load THREE from CDN or local fallback if not already available
   * Supports configuration via window.chocodropConfig:
   * - allowCdn: false to disable CDN loading (default: true)
   * - threeSrc: custom THREE.js source URL
   */
  async function ensureThreeAvailable() {
    if (typeof window !== 'undefined' && window.THREE) {
      return true; // Already available
    }

    const config = (typeof window !== 'undefined' && window.chocodropConfig) || {};
    const allowCdn = config.allowCdn !== false; // Default: true
    const customSrc = config.threeSrc || null;

    // Try custom source first if specified
    if (customSrc) {
      try {
        console.log(`📦 Loading THREE from custom source: ${customSrc}`);
        const mod = await import(customSrc);
        if (typeof window !== 'undefined') {
          window.THREE = mod;
        }
        console.log('✅ THREE loaded from custom source');
        return true;
      } catch (error) {
        console.warn('Failed to load THREE from custom source:', error);
      }
    }

    // Try CDN with SRI if allowed
    if (allowCdn) {
      try {
        console.log('📦 Loading THREE from CDN (pinned v0.158.0 with SRI)...');

        // Load via script tag to support integrity checking
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.type = 'module';
          script.crossOrigin = 'anonymous';
          script.integrity = 'sha384-8BWMu/Do9SsP0UPy64KoqsVP4vTp4JAQF2X6jRMBYVnWcZVkgwtEZLJ1KE0blEKT';

          // Create inline module to import and expose THREE
          const inlineModule = `
            import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.min.js';
            window.THREE = THREE;
          `;

          script.textContent = inlineModule;
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });

        console.log('✅ THREE loaded from CDN');
        return true;
      } catch (error) {
        console.warn('Failed to load THREE from CDN, trying local fallback:', error);
      }
    }

    // Try local fallback
    try {
      console.log('📦 Loading THREE from local vendor...');
      const mod = await import(`${BASE}/vendor/three-0.158.0.min.js`);
      if (typeof window !== 'undefined') {
        window.THREE = mod;
      }
      console.log('✅ THREE loaded from local vendor');
      return true;
    } catch (error) {
      console.warn('Failed to load THREE from local vendor:', error);
      return false;
    }
  }

  let liteSceneContext = null;

  /**
   * Create lightweight preview scene when host page has no SceneManager
   */
  function createLightweightScene() {
    if (liteSceneContext) {
      return liteSceneContext;
    }

    if (typeof window === 'undefined' || !window.THREE) {
      throw new Error('THREE is required to bootstrap lightweight scene');
    }

    const THREE = window.THREE;

    // Container
    const container = document.createElement('div');
    container.id = '__chocodrop_lite_scene__';
    Object.assign(container.style, {
      position: 'fixed',
      right: '24px',
      bottom: '24px',
      width: 'min(420px, calc(100vw - 48px))',
      height: 'min(420px, calc(100vh - 120px))',
      zIndex: '2147483600',
      borderRadius: '18px',
      boxShadow: '0 20px 45px rgba(0, 0, 0, 0.45)',
      background: 'rgba(14, 14, 18, 0.92)',
      backdropFilter: 'blur(16px)',
      color: '#f8fafc',
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      pointerEvents: 'auto'
    });

    const header = document.createElement('div');
    Object.assign(header.style, {
      padding: '14px 18px 6px',
      fontSize: '13px',
      letterSpacing: '0.02em',
      textTransform: 'uppercase',
      opacity: '0.75',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    });
    header.innerHTML = `<span style="font-size:16px;">🍫</span> Lite Scene Preview`;
    container.appendChild(header);

    const canvasWrapper = document.createElement('div');
    Object.assign(canvasWrapper.style, {
      position: 'relative',
      flex: '1 1 auto'
    });
    container.appendChild(canvasWrapper);

    if (!document.body.contains(container)) {
      document.body.appendChild(container);
    }

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.borderRadius = '12px';
    canvasWrapper.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111215);

    const aspect = canvasWrapper.clientWidth / Math.max(canvasWrapper.clientHeight, 1);
    const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
    camera.position.set(0, 1.6, 3.8);

    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.85);
    const fillLight = new THREE.DirectionalLight(0x4450ff, 0.45);
    keyLight.position.set(3, 6, 4);
    fillLight.position.set(-4, 2, -6);
    scene.add(ambient, keyLight, fillLight);

    const grid = new THREE.GridHelper(6, 12, 0x2f3542, 0x1e272e);
    grid.position.y = -0.01;
    scene.add(grid);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(3, 64),
      new THREE.MeshStandardMaterial({
        color: 0x20242e,
        emissive: 0x0,
        metalness: 0.05,
        roughness: 0.9
      })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // Simple animation loop
    let animationId = null;
    const target = new THREE.Vector3(0, 1.4, 0);

    function resizeRenderer() {
      const rect = canvasWrapper.getBoundingClientRect();
      const width = Math.max(rect.width, 1);
      const height = Math.max(rect.height, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    function tick() {
      animationId = requestAnimationFrame(tick);
      camera.lookAt(target);
      renderer.render(scene, camera);
    }

    resizeRenderer();
    tick();

    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        resizeRenderer();
      });
      resizeObserver.observe(canvasWrapper);
    }
    window.addEventListener('resize', resizeRenderer);

    function dispose() {
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener('resize', resizeRenderer);
      renderer.dispose();
      if (container && container.parentElement) {
        container.parentElement.removeChild(container);
      }
      liteSceneContext = null;
    }

    function togglePointerEvents(disabled) {
      renderer.domElement.style.pointerEvents = disabled ? 'none' : 'auto';
    }

    liteSceneContext = {
      scene,
      camera,
      renderer,
      dispose,
      togglePointerEvents
    };

    return liteSceneContext;
  }

  /**
   * Ensure scene/camera/renderer exist, creating a lightweight fallback if needed
   */
  function ensureSceneContext(scene, opts = {}) {
    if (scene && (opts.camera || opts.renderer)) {
      return { scene, options: opts };
    }

    if (scene && !opts.camera && !opts.renderer) {
      return {
        scene,
        options: {
          ...opts
        }
      };
    }

    const lite = createLightweightScene();

    const mergedOptions = {
      ...opts,
      camera: lite.camera,
      renderer: lite.renderer,
      sceneOptions: {
        enableMouseInteraction: false,
        ...(opts.sceneOptions || {})
      },
      uiOptions: {
        ...(opts.uiOptions || {}),
        lightweightMode: true
      }
    };

    const originalToggle = opts.onControlsToggle;
    mergedOptions.onControlsToggle = (disabled) => {
      lite.togglePointerEvents?.(disabled);
      if (typeof originalToggle === 'function') {
        originalToggle(disabled);
      }
    };

    return {
      scene: lite.scene,
      options: mergedOptions
    };
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

      const { scene: resolvedScene, options: resolvedOptions } = ensureSceneContext(scene, opts);

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
          const result = await window.ChocoDropUI.attach(resolvedScene, resolvedOptions);
          mounted = true;
          console.log('✅ ChocoDrop UI loaded from global bundle');
          return { ...result, reload };
        }
      } else {
        // Load ESM bundle for bundler environments
        console.log('📦 Loading ESM bundle');
        const mod = await import(`${BASE}/ui/ui.esm.js`);

        if (mod.attach) {
          const result = await mod.attach(resolvedScene, resolvedOptions);
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
