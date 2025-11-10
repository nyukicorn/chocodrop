import { logger } from '../../common/logger.js';

const log = logger.child('xrbridge');

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

const createBridgeEvent = (type, detail) => {
  if (typeof CustomEvent === 'function') {
    return new CustomEvent(type, { detail });
  }
  if (typeof Event === 'function') {
    const event = new Event(type);
    event.detail = detail;
    return event;
  }
  return { type, detail };
};

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
    this._originalRAF = null;
    this._originalCancelRAF = null;
    this._rendererSetLoopRestore = null;
    this._rawSetAnimationLoop = null;
    this._installed = false;
  }

  install() {
    if (this._installed) {
      return;
    }
    if (!this.renderer) {
      throw new Error('XRBridgeLoader: renderer が指定されていません');
    }
    if (!('xr' in this.renderer)) {
      throw new Error('XRBridgeLoader: 指定された renderer は WebXR に対応していません');
    }
    this.renderer.xr.enabled = true;
    this._rawSetAnimationLoop = this.renderer.setAnimationLoop;
    this._originalSetLoop = this.renderer.setAnimationLoop?.bind(this.renderer) ?? null;
    this._captureRendererLoop();
    this._patchRendererSetAnimationLoop();
    if (this.captureRAF) {
      this._installRAFInterceptor();
    }
    this._installSessionGrantedListener();
    this._installed = true;
    this.dispatchEvent(createBridgeEvent('installed'));
  }

  async isSessionSupported(mode = 'vr') {
    const xr = getXRSystem();
    if (!xr?.isSessionSupported) return false;
    const sessionMode = XR_MODES[mode] ?? XR_MODES.vr;
    try {
      return await xr.isSessionSupported(sessionMode);
    } catch (error) {
      this.dispatchEvent(createBridgeEvent('supportcheck:error', { error, mode: sessionMode }));
      return false;
    }
  }

  async enter(mode = 'vr', options = {}) {
    if (!this._installed) {
      this.install();
    }
    const xr = getXRSystem();
    if (!xr) {
      throw new Error('WebXR がサポートされていません');
    }
    const sessionMode = XR_MODES[mode] ?? XR_MODES.vr;
    const supported = await this.isSessionSupported(mode);
    if (!supported) {
      throw new Error(`${sessionMode} セッションはサポートされていません`);
    }

    let sessionInit = this._buildSessionInit(mode, options);
    this._lastRequestedMode = mode;
    this.dispatchEvent(createBridgeEvent('session:request', { mode: sessionMode, init: sessionInit }));

    const attemptSession = async init => xr.requestSession(sessionMode, init);

    try {
      let session;
      try {
        session = await attemptSession(sessionInit);
      } catch (error) {
        if (this._shouldRetryWithoutDomOverlay(error, sessionInit)) {
          const fallbackInit = this._stripDomOverlayFeature(sessionInit);
          sessionInit = fallbackInit;
          session = await attemptSession(fallbackInit);
        } else {
          throw error;
        }
      }
      await this._activateSession(session, mode, options);
      this._autoResumeAllowed = true;
      return session;
    } catch (error) {
      this.dispatchEvent(createBridgeEvent('session:error', { error, mode: sessionMode }));
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
    this._installed = false;
    const xr = getXRSystem();
    if (this._sessionGrantedHandler && xr?.removeEventListener) {
      xr.removeEventListener('sessiongranted', this._sessionGrantedHandler);
      this._sessionGrantedHandler = null;
    }
    if (this._rendererSetLoopRestore) {
      this._rendererSetLoopRestore();
      this._rendererSetLoopRestore = null;
    }
  }

  setAutoResume(value) {
    this.autoResume = Boolean(value);
  }

  _shouldRetryWithoutDomOverlay(error, init) {
    if (!error || error.name !== 'NotSupportedError') {
      return false;
    }
    if (!init?.requiredFeatures) {
      return false;
    }
    return init.requiredFeatures.includes('dom-overlay');
  }

  _stripDomOverlayFeature(init = {}) {
    const clone = {
      requiredFeatures: Array.isArray(init.requiredFeatures)
        ? init.requiredFeatures.filter(feature => feature !== 'dom-overlay')
        : [],
      optionalFeatures: Array.isArray(init.optionalFeatures)
        ? init.optionalFeatures.filter(feature => feature !== 'dom-overlay')
        : []
    };
    const stripped = { ...init, ...clone };
    if (stripped.domOverlay) {
      delete stripped.domOverlay;
    }
    return stripped;
  }

  _buildSessionInit(mode, options) {
    const presets = DEFAULT_FEATURES[mode] ?? DEFAULT_FEATURES.vr;
    const required = new Set(presets.required);
    const optional = new Set(presets.optional);

    const domOverlayRoot = options.domOverlayRoot || this.domOverlayRoot || (typeof document !== 'undefined' ? document.body : null);
    if (domOverlayRoot) {
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

    if (domOverlayRoot) {
      init.domOverlay = { root: domOverlayRoot };
    }

    if (mode === 'ar' && options.hitTestSource) {
      init.hitTestSource = options.hitTestSource;
    }

    return init;
  }

  _captureRendererLoop() {
    if (this._capturedLoop || !this.renderer?.getAnimationLoop) {
      return;
    }
    const existingLoop = this.renderer.getAnimationLoop();
    if (typeof existingLoop === 'function') {
      this._setCapturedLoop(existingLoop);
    }
  }

  _patchRendererSetAnimationLoop() {
    if (!this.renderer || typeof this._rawSetAnimationLoop !== 'function' || this._rendererSetLoopRestore) {
      return;
    }
    const original = this._rawSetAnimationLoop;
    const bridge = this;
    this.renderer.setAnimationLoop = function patchedSetAnimationLoop(loop) {
      if (!bridge._xrActive && typeof loop === 'function') {
        bridge._setCapturedLoop(loop);
      }
      return original.call(this, loop);
    };
    this._rendererSetLoopRestore = () => {
      this.renderer.setAnimationLoop = original;
    };
  }

  _setCapturedLoop(loop) {
    if (typeof loop !== 'function') return;
    this._capturedLoop = loop;
    log.debug('Captured main render loop');
    this.dispatchEvent(createBridgeEvent('loop:captured', { callback: loop }));
  }

  async _activateSession(session, mode, options) {
    this._currentSession = session;
    this._xrActive = true;
    this.dispatchEvent(createBridgeEvent('session:start', { session, mode }));

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
    this.dispatchEvent(createBridgeEvent('session:end'));
  }

  _installRenderLoop(loop) {
    if (!this._originalSetLoop) return;
    this._originalSetLoop((time, frame) => {
      try {
        if (loop.length >= 2) {
          loop(time, frame ?? null);
        } else {
          loop(time);
        }
      } catch (error) {
        log.error('XR render loop error', error);
        this.dispatchEvent(createBridgeEvent('loop:error', { error }));
      }
    });
  }

  _installRAFInterceptor() {
    if (this._restoreRAF || typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      return;
    }
    const originalRAF = window.requestAnimationFrame.bind(window);
    const originalCancel = typeof window.cancelAnimationFrame === 'function'
      ? window.cancelAnimationFrame.bind(window)
      : null;
    const rafHandles = this._rafHandles;
    const getHandle = () => this._rafId++;
    const bridge = this;

    window.requestAnimationFrame = function xrBridgeWrapped(callback) {
      if (typeof callback !== 'function') {
        return originalRAF(callback);
      }

      if (!bridge._capturedLoop) {
        bridge._setCapturedLoop(callback);
      }

      if (bridge._xrActive && callback === bridge._capturedLoop) {
        const handle = getHandle();
        rafHandles.set(handle, callback);
        return handle;
      }

      return originalRAF(time => {
        callback(time);
      });
    };

    window.cancelAnimationFrame = function xrBridgeCancel(handle) {
      if (rafHandles.delete(handle)) {
        return;
      }
      return originalCancel?.(handle);
    };

    this._restoreRAF = () => {
      window.requestAnimationFrame = originalRAF;
      if (originalCancel) {
        window.cancelAnimationFrame = originalCancel;
      }
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
        this.dispatchEvent(createBridgeEvent('session:error', { error, mode: this._lastRequestedMode }));
      }
    };
    xr.addEventListener('sessiongranted', this._sessionGrantedHandler);
  }
}

export default XRBridgeLoader;
