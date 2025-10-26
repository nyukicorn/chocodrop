/**
 * XRSessionManager
 * Meta Quest 3/3S などの WebXR 対応ブラウザで VR/MR セッションを統合的に扱う軽量マネージャー
 */
export class XRSessionManager {
  constructor(options = {}) {
    this.renderer = options.renderer || null;
    this.scene = options.scene || null;
    this.camera = options.camera || null;
    this.referenceSpace = options.referenceSpace || 'local-floor';
    this.domOverlayRoot = options.domOverlayRoot || (typeof document !== 'undefined' ? document.body : null);
    this.preferredHost = options.preferredHost || 'http://192.168.1.15:3011';
    this.enableDiagnostics = options.enableDiagnostics !== false;
    this.maxLogs = options.maxLogs || 20;
    this.listeners = new Map();
    this.diagnostics = [];

    this.currentSession = null;
    this.currentMode = null;
    this.environmentBlendMode = null;
    this.supportStatus = {
      'immersive-vr': null,
      'immersive-ar': null
    };

    if (this.renderer) {
      this.prepareRenderer(this.renderer);
    }

    // 初期サポート判定
    if (this.hasXRSupport()) {
      this.detectSupport();
    }

    this.emit('hoststatus', this.getHostStatus());
  }

  hasXRSupport() {
    return typeof navigator !== 'undefined' && !!navigator.xr;
  }

  setRenderer(renderer) {
    this.renderer = renderer;
    this.prepareRenderer(renderer);
  }

  prepareRenderer(renderer) {
    if (!renderer) return;
    try {
      renderer.xr.enabled = true;
      renderer.xr.setReferenceSpaceType(this.referenceSpace);
      if (renderer.domElement) {
        renderer.domElement.style.touchAction = 'none';
      }
      this.log('info', 'Renderer prepared for WebXR');
    } catch (error) {
      this.log('error', 'Failed to prepare renderer for WebXR', error);
    }
  }

  async detectSupport() {
    if (!this.hasXRSupport()) {
      return { 'immersive-vr': false, 'immersive-ar': false };
    }
    try {
      const [vr, ar] = await Promise.allSettled([
        navigator.xr.isSessionSupported('immersive-vr'),
        navigator.xr.isSessionSupported('immersive-ar')
      ]);
      this.supportStatus['immersive-vr'] = vr.status === 'fulfilled' ? vr.value : false;
      this.supportStatus['immersive-ar'] = ar.status === 'fulfilled' ? ar.value : false;
      this.emit('statuschange', this.getStatus());
      this.log('info', 'XR support updated', { support: this.supportStatus });
      return this.supportStatus;
    } catch (error) {
      this.log('error', 'Failed to detect XR support', error);
      return this.supportStatus;
    }
  }

  async ensureXRCompatible() {
    if (!this.renderer) return;
    const gl = this.renderer.getContext?.();
    if (gl?.makeXRCompatible) {
      await gl.makeXRCompatible();
    }
  }

  buildSessionInit(mode, overrides = {}) {
    const base = {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['bounded-floor', 'hand-tracking', 'layers']
    };
    if (mode === 'immersive-ar') {
      base.optionalFeatures = [...base.optionalFeatures, 'dom-overlay'];
      if (this.domOverlayRoot) {
        base.domOverlay = { root: this.domOverlayRoot };
      }
    }

    const merged = {
      ...base,
      ...overrides
    };

    if (base.optionalFeatures || overrides.optionalFeatures) {
      merged.optionalFeatures = Array.from(
        new Set([...(base.optionalFeatures || []), ...(overrides.optionalFeatures || [])])
      );
    }

    return merged;
  }

  async startSession(mode = 'immersive-vr', overrides = {}) {
    if (!this.hasXRSupport()) {
      throw new Error('このブラウザはWebXRに対応していません');
    }
    if (!this.renderer) {
      throw new Error('rendererが未設定のためXRセッションを開始できません');
    }

    if (this.currentSession && this.currentMode === mode) {
      this.log('info', `Reuse existing session (${mode})`);
      return this.currentSession;
    }

    if (this.currentSession) {
      await this.endSession();
    }

    await this.ensureXRCompatible();

    const init = this.buildSessionInit(mode, overrides);
    this.log('info', `Requesting XR session (${mode})`, init);
    const session = await navigator.xr.requestSession(mode, init);

    session.addEventListener('end', () => {
      this.log('info', 'XR session ended by runtime');
      this.handleSessionEnd();
    });

    await this.renderer.xr.setSession(session);

    this.currentSession = session;
    this.currentMode = mode;
    this.environmentBlendMode = session.environmentBlendMode || null;

    this.emit('sessionstart', { mode, session });
    this.emit('statuschange', this.getStatus());
    this.log('info', 'XR session established', {
      mode,
      blendMode: this.environmentBlendMode
    });
    return session;
  }

  async endSession() {
    if (!this.currentSession) {
      return;
    }
    try {
      await this.currentSession.end();
    } catch (error) {
      this.log('warn', 'Failed to end XR session gracefully', error);
    }
    this.handleSessionEnd();
  }

  handleSessionEnd() {
    this.currentSession = null;
    this.currentMode = null;
    this.environmentBlendMode = null;
    this.emit('sessionend');
    this.emit('statuschange', this.getStatus());
  }

  isSessionActive() {
    return !!this.currentSession;
  }

  getStatus() {
    return {
      hasXR: this.hasXRSupport(),
      currentMode: this.currentMode,
      environmentBlendMode: this.environmentBlendMode,
      support: { ...this.supportStatus },
      sessionActive: this.isSessionActive(),
      host: this.getHostStatus(),
      diagnostics: [...this.diagnostics]
    };
  }

  getHostStatus(origin) {
    const currentOrigin = origin || (typeof window !== 'undefined' ? window.location.origin : '');
    const preferred = (this.preferredHost || '').replace(/\/$/, '');
    const normalized = (currentOrigin || '').replace(/\/$/, '');
    const matches = !!preferred && preferred === normalized;
    return {
      current: normalized,
      preferred,
      matches
    };
  }

  setPreferredHost(host) {
    this.preferredHost = host;
    this.emit('hoststatus', this.getHostStatus());
  }

  getLog() {
    return [...this.diagnostics];
  }

  log(level, message, detail) {
    if (!this.enableDiagnostics) {
      return;
    }
    const entry = {
      timestamp: Date.now(),
      level,
      message,
      detail
    };
    this.diagnostics.unshift(entry);
    if (this.diagnostics.length > this.maxLogs) {
      this.diagnostics.length = this.maxLogs;
    }
    this.emit('log', entry);
    if (level === 'error') {
      console.error('[XR]', message, detail || '');
    } else if (level === 'warn') {
      console.warn('[XR]', message, detail || '');
    } else {
      console.log('[XR]', message, detail || '');
    }
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(handler);
  }

  off(event, handler) {
    if (!this.listeners.has(event)) return;
    this.listeners.get(event).delete(handler);
  }

  emit(event, payload) {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    handlers.forEach((handler) => {
      try {
        handler(payload);
      } catch (error) {
        console.error('[XR] Listener error', error);
      }
    });
  }

  dispose() {
    this.endSession();
    this.listeners.clear();
    this.diagnostics = [];
  }
}
