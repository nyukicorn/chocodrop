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
   * Check if daemon is running
   */
  async function ready() {
    const isRunning = await ping();
    if (isRunning) {
      console.log('✅ ChocoDrop daemon is ready');
      return true;
    }

    // Daemon not running - show instructions
    const shouldStart = confirm(
      'ChocoDrop daemon is not running.\n\n' +
      'Please run in terminal:\n' +
      '  npx chocodropd\n\n' +
      'Then reload this page.\n\n' +
      'Continue?'
    );

    if (!shouldStart) {
      throw new Error('ChocoDrop daemon not running');
    }

    alert(
      'Start ChocoDrop daemon in terminal:\n\n' +
      '  npx chocodropd\n\n' +
      'Then reload this page.'
    );

    throw new Error('Prompted user to start daemon');
  }

  /**
   * Attach ChocoDrop to scene
   */
  async function attach(scene, opts = {}) {
    const root = getRootOverlay();
    let mounted = false;

    // Try to load existing CommandUI from daemon
    try {
      // First, try to load CommandUI dependencies
      const [CommandUIMod, SceneManagerMod, ClientMod] = await Promise.all([
        import(`${BASE}/ui/CommandUI.js`),
        import(`${BASE}/ui/SceneManager.js`),
        import(`${BASE}/ui/LiveCommandClient.js`)
      ]);

      const CommandUI = CommandUIMod.CommandUI || CommandUIMod.default;
      const SceneManager = SceneManagerMod.SceneManager || SceneManagerMod.default;
      const LiveCommandClient = ClientMod.LiveCommandClient || ClientMod.default;

      if (CommandUI && SceneManager && LiveCommandClient) {
        // Initialize existing UI
        const sceneManager = new SceneManager(scene, opts);
        const client = new LiveCommandClient({ serverUrl: BASE });
        const ui = new CommandUI({
          sceneManager,
          client,
          onControlsToggle: opts.onControlsToggle,
          ...opts.uiOptions
        });

        ui.show();
        mounted = true;

        console.log('✅ ChocoDrop UI loaded from existing implementation');

        return {
          ui,
          sceneManager,
          client,
          reload: () => fetch(`${BASE}/v1/reload`, {
            method: 'POST',
            headers: { 'x-chocodrop-origin': ORIGIN }
          })
        };
      }
    } catch (error) {
      console.warn('Could not load existing UI, using fallback:', error);
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
          await fetch(`${BASE}/v1/reload`, {
            method: 'POST',
            headers: { 'x-chocodrop-origin': ORIGIN }
          });
          alert('Configuration reloaded!');
        } catch (error) {
          alert('Failed to reload: ' + error.message);
        }
      };

      console.log('✅ ChocoDrop placeholder UI loaded');
    }

    return {
      reload: () => fetch(`${BASE}/v1/reload`, {
        method: 'POST',
        headers: { 'x-chocodrop-origin': ORIGIN }
      })
    };
  }

  // Export to window
  if (typeof window !== 'undefined') {
    window.chocodrop = { ready, attach };
  }

  // Export for ES modules
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ready, attach };
  }
})();
