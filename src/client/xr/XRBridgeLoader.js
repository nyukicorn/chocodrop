const XR_MODES = {
  vr: 'immersive-vr',
  ar: 'immersive-ar'
};

const DEFAULT_FEATURES = {
  vr: {
    required: ['local-floor'],
    optional: ['bounded-floor', 'hand-tracking', 'layers']
  },
  ar: {
    required: ['local-floor', 'hit-test'],
    optional: ['dom-overlay', 'hand-tracking', 'layers']
  }
};

const RAF_SUPPRESS_TOKEN = -1;

const getXRSystem = () => (typeof globalThis !== 'undefined' && globalThis.navigator ? globalThis.navigator.xr : null);

/**
 * WebXR セッションの開始/終了とレンダーループの橋渡しを担当するローダー。
 * ユーザーコードの requestAnimationFrame を捕捉し、XR セッション時のみ setAnimationLoop に切り替える。
 */
export class XRBridgeLoader extends EventTarget {
  constructor(options = {}) {
    super();
    this.renderer = options.renderer ?? null;
    this.sceneManager = options.sceneManager ?? null;
    this.autoResume = options.autoResume !== false;
    this.domOverlayRoot = options.domOverlayRoot ?? null;
    this.captureRAF = options.captureRAF !== false;
    this._restoreRAF = null;
    this._capturedLoop = null;
    this._originalSetLoop = null;
    this._currentSession = null;
    this._xrActive = false;
    this._lastRequestedMode = null;
    this._autoResumeAllowed = false;
    this._sessionGrantedHandler = null;
    this._rafHandles = new Map();
    this._rafId = 1;
  }

  install() {
    if (!this.renderer) {
      throw new Error('XRBridgeLoader: renderer が指定されていません');
    }
    if (!('xr' in this.renderer)) {
      throw new Error('XRBridgeLoader: 指定された renderer は WebXR に対応していません');
    }
    this.renderer.xr.enabled = true;
    this._originalSetLoop = this.renderer.setAnimationLoop?.bind(this.renderer) ?? null;
    if (this.captureRAF) {
      this._installRAFInterceptor();
    }
    this._installSessionGrantedListener();
    this.dispatchEvent(new CustomEvent('installed'));
  }

  async isSessionSupported(mode = 'vr') {
    const xr = getXRSystem();
    if (!xr?.isSessionSupported) return false;
    const sessionMode = XR_MODES[mode] ?? XR_MODES.vr;
    try {
      return await xr.isSessionSupported(sessionMode);
    } catch (error) {
      this.dispatchEvent(new CustomEvent('supportcheck:error', { detail: { error, mode: sessionMode } }));
      return false;
    }
  }

  async enter(mode = 'vr', options = {}) {
    const xr = getXRSystem();
    if (!xr) {
      throw new Error('WebXR がサポートされていません');
    }
    const sessionMode = XR_MODES[mode] ?? XR_MODES.vr;
    const supported = await this.isSessionSupported(mode);
    if (!supported) {
      throw new Error(`${sessionMode} セッションはサポートされていません`);
    }

    const sessionInit = this._buildSessionInit(mode, options);
    this._lastRequestedMode = mode;
    this.dispatchEvent(new CustomEvent('session:request', { detail: { mode: sessionMode, init: sessionInit } }));

    try {
      const session = await xr.requestSession(sessionMode, sessionInit);
      await this._activateSession(session, mode, options);
      this._autoResumeAllowed = true;
      return session;
    } catch (error) {
      this.dispatchEvent(new CustomEvent('session:error', { detail: { error, mode: sessionMode } }));
      throw error;
    }
  }

  async exit() {
    if (!this._currentSession) return;
    try {
      await this._currentSession.end();
    } finally {
      this._teardownSession();
    }
  }

  dispose() {
    this.exit().catch(() => undefined);
    if (this._restoreRAF) {
      this._restoreRAF();
      this._restoreRAF = null;
    }
    const xr = getXRSystem();
    if (this._sessionGrantedHandler && xr?.removeEventListener) {
      xr.removeEventListener('sessiongranted', this._sessionGrantedHandler);
      this._sessionGrantedHandler = null;
    }
    if (this._originalSetLoop) {
      this.renderer.setAnimationLoop = this._originalSetLoop;
      this._originalSetLoop = null;
    }
  }

  setAutoResume(value) {
    this.autoResume = Boolean(value);
  }

  _buildSessionInit(mode, options) {
    const presets = DEFAULT_FEATURES[mode] ?? DEFAULT_FEATURES.vr;
    const required = new Set(presets.required);
    const optional = new Set(presets.optional);

    if (options.domOverlayRoot || this.domOverlayRoot) {
      required.add('dom-overlay');
    }

    if (Array.isArray(options.requiredFeatures)) {
      options.requiredFeatures.forEach(feature => required.add(feature));
    }
    if (Array.isArray(options.optionalFeatures)) {
      options.optionalFeatures.forEach(feature => optional.add(feature));
    }

    const init = {
      requiredFeatures: Array.from(required),
      optionalFeatures: Array.from(optional)
    };

    if (options.domOverlayRoot || this.domOverlayRoot) {
      init.domOverlay = { root: options.domOverlayRoot || this.domOverlayRoot };
    }

    if (mode === 'ar' && options.hitTestSource) {
      init.hitTestSource = options.hitTestSource;
    }

    return init;
  }

  async _activateSession(session, mode, options) {
    this._currentSession = session;
    this._xrActive = true;
    this.dispatchEvent(new CustomEvent('session:start', { detail: { session, mode } }));

    session.addEventListener('end', () => this._teardownSession(), { once: true });

    if (this.renderer.xr.setSession) {
      await this.renderer.xr.setSession(session);
    }

    const renderLoop = this._capturedLoop ?? options.fallbackLoop;
    if (renderLoop) {
      this._installRenderLoop(renderLoop);
    }
  }

  _teardownSession() {
    if (!this._xrActive) return;
    this._xrActive = false;
    this._currentSession = null;
    if (this._originalSetLoop) {
      this.renderer.setAnimationLoop(null);
    }
    this.dispatchEvent(new CustomEvent('session:end'));
  }

  _installRenderLoop(loop) {
    if (!this._originalSetLoop) return;
    this.renderer.setAnimationLoop(time => {
      try {
        if (loop.length >= 2) {
          loop(time, { frame: this._currentSession?.renderState });
        } else {
          loop(time);
        }
      } catch (error) {
        this.dispatchEvent(new CustomEvent('loop:error', { detail: { error } }));
      }
    });
  }

  _installRAFInterceptor() {
    if (this._restoreRAF || typeof window === 'undefined') {
      return;
    }
    const originalRAF = window.requestAnimationFrame.bind(window);
    const rafHandles = this._rafHandles;
    const getHandle = () => this._rafId++;
    const self = this;

    window.requestAnimationFrame = function xrBridgeWrapped(callback) {
      if (typeof callback !== 'function') {
        return originalRAF(callback);
      }

      if (!self._capturedLoop) {
        self._capturedLoop = callback;
        self.dispatchEvent(new CustomEvent('loop:captured', { detail: { callback } }));
      }

      if (self._xrActive && callback === self._capturedLoop) {
        const handle = getHandle();
        rafHandles.set(handle, callback);
        return RAF_SUPPRESS_TOKEN;
      }

      return originalRAF(time => {
        callback(time);
      });
    };

    this._restoreRAF = () => {
      window.requestAnimationFrame = originalRAF;
      rafHandles.clear();
    };
  }

  _installSessionGrantedListener() {
    const xr = getXRSystem();
    if (!xr?.addEventListener) return;
    this._sessionGrantedHandler = async () => {
      if (!this.autoResume || !this._autoResumeAllowed || this._xrActive || !this._lastRequestedMode) {
        return;
      }
      try {
        await this.enter(this._lastRequestedMode);
      } catch (error) {
        this.dispatchEvent(new CustomEvent('session:error', { detail: { error, mode: this._lastRequestedMode } }));
      }
    };
    xr.addEventListener('sessiongranted', this._sessionGrantedHandler);
  }
}

export default XRBridgeLoader;
