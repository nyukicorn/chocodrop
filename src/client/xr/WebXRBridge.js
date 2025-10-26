/**
 * WebXRBridge
 * Meta Quest 3 / visionOS / Galaxy XR などで WebXR セッションを開始・管理する軽量ユーティリティ
 * Three.js の renderer / scene / camera を注入しておくと、セッション開始時に自動で紐付けを行う
 */
export class WebXRBridge {
  /**
   * @param {Object} options
   * @param {THREE.WebGLRenderer} [options.renderer]
   * @param {THREE.Scene} [options.scene]
   * @param {THREE.Camera} [options.camera]
   * @param {string} [options.preferredMode='immersive-vr']
   * @param {string[]} [options.requiredFeatures=['local-floor']]
   * @param {string[]} [options.optionalFeatures=['hand-tracking', 'layers', 'dom-overlay']]
   * @param {string} [options.referenceSpaceType='local-floor']
   * @param {Function} [options.onSessionStart]
   * @param {Function} [options.onSessionEnd]
   * @param {Function} [options.onError]
   */
  constructor(options = {}) {
    this.renderer = options.renderer || null;
    this.scene = options.scene || null;
    this.camera = options.camera || null;
    this.preferredMode = options.preferredMode || 'immersive-vr';
    this.requiredFeatures = options.requiredFeatures || ['local-floor'];
    this.optionalFeatures = options.optionalFeatures || ['hand-tracking', 'layers', 'dom-overlay'];
    this.referenceSpaceType = options.referenceSpaceType || 'local-floor';
    this.onSessionStart = options.onSessionStart || (() => {});
    this.onSessionEnd = options.onSessionEnd || (() => {});
    this.onError = options.onError || (() => {});

    this.session = null;
    this.referenceSpace = null;
    this.supportCache = null;
    this._boundEndHandler = this._handleSessionEnd.bind(this);

    this._ensureRendererXR();
  }

  /**
   * renderer を後から差し替える場合に使用
   * @param {THREE.WebGLRenderer} renderer
   */
  setRenderer(renderer) {
    this.renderer = renderer;
    this._ensureRendererXR();
  }

  /**
   * @param {THREE.Scene} scene
   */
  setScene(scene) {
    this.scene = scene;
  }

  /**
    * @param {THREE.Camera} camera
    */
  setCamera(camera) {
    this.camera = camera;
  }

  /**
   * WebXR API が利用可能かどうか
   */
  static get isXRAvailable() {
    return typeof navigator !== 'undefined' && !!navigator.xr;
  }

  /**
   * ブラウザが VR / AR / inlineXR をサポートしているかを調べる
   * 結果は一定時間キャッシュされる
   * @returns {Promise<{supported:boolean, modes: Record<string, boolean>}>}
   */
  async getSupportStatus() {
    if (this.supportCache) {
      return this.supportCache;
    }
    if (!WebXRBridge.isXRAvailable) {
      this.supportCache = {
        supported: false,
        modes: {
          'immersive-vr': false,
          'immersive-ar': false,
          inline: false
        }
      };
      return this.supportCache;
    }

    const results = await Promise.allSettled([
      navigator.xr.isSessionSupported('immersive-vr'),
      navigator.xr.isSessionSupported('immersive-ar'),
      navigator.xr.isSessionSupported('inline')
    ]);

    const status = {
      supported: results.some((res) => res.status === 'fulfilled' && res.value === true),
      modes: {
        'immersive-vr': results[0]?.status === 'fulfilled' && results[0].value === true,
        'immersive-ar': results[1]?.status === 'fulfilled' && results[1].value === true,
        inline: results[2]?.status === 'fulfilled' && results[2].value === true
      }
    };

    this.supportCache = status;
    return status;
  }

  /**
   * Quest Browser などで WebXR セッションを開始する
   * @param {'immersive-vr'|'immersive-ar'} [mode]
   * @param {Object} [options]
   * @param {Array<string>} [options.requiredFeatures]
   * @param {Array<string>} [options.optionalFeatures]
   * @param {HTMLElement} [options.domOverlay]
   * @param {string} [options.referenceSpaceType]
   */
  async enterXR(mode = this.preferredMode, options = {}) {
    if (this.session) return this.session;
    if (!WebXRBridge.isXRAvailable) {
      const error = new Error('WebXR API is not available in this environment');
      this.onError(error);
      throw error;
    }

    const support = await this.getSupportStatus();
    if (!support.modes[mode]) {
      const error = new Error(`WebXR mode "${mode}" is not supported on this device/browser`);
      this.onError(error);
      throw error;
    }

    const requiredFeatures = [
      ...new Set([
        ...this.requiredFeatures,
        ...(options.requiredFeatures || []),
        options.referenceSpaceType || this.referenceSpaceType
      ])
    ];
    const optionalFeatures = [
      ...new Set([
        ...this.optionalFeatures,
        ...(options.optionalFeatures || [])
      ])
    ];

    const sessionInit = {
      requiredFeatures,
      optionalFeatures
    };

    if (options.domOverlay) {
      sessionInit.domOverlay = { root: options.domOverlay };
    }

    let session;
    try {
      session = await navigator.xr.requestSession(mode, sessionInit);
    } catch (err) {
      this.onError(err);
      throw err;
    }

    this.session = session;
    session.addEventListener('end', this._boundEndHandler, { once: false });

    await this._configureThreeRenderer(session, options.referenceSpaceType);
    this.onSessionStart({ session, mode, referenceSpace: this.referenceSpace });
    return session;
  }

  /**
   * セッションを終了する
   */
  async exitXR() {
    if (!this.session) return;
    try {
      await this.session.end();
    } catch (err) {
      // すでに終了している場合などは握りつぶす
      console.warn('WebXRBridge: failed to end session', err);
    }
  }

  /**
   * 現在のセッション情報を返す
   */
  getSession() {
    return this.session;
  }

  /**
   * Quest などではセッション開始前に renderer.xr.enabled を true にしておく必要がある
   * renderer が存在しない場合は安全にスキップ
   * @private
   */
  _ensureRendererXR() {
    if (this.renderer && this.renderer.xr) {
      this.renderer.xr.enabled = true;
      if (typeof this.renderer.xr.setReferenceSpaceType === 'function') {
        this.renderer.xr.setReferenceSpaceType(this.referenceSpaceType);
      }
    }
  }

  async _configureThreeRenderer(session, referenceSpaceType) {
    if (!this.renderer || !this.renderer.xr) return;

    const refType = referenceSpaceType || this.referenceSpaceType;
    if (typeof this.renderer.xr.setReferenceSpaceType === 'function') {
      this.renderer.xr.setReferenceSpaceType(refType);
    }

    try {
      this.referenceSpace = await session.requestReferenceSpace(refType);
    } catch (err) {
      console.warn(`WebXRBridge: failed to get reference space "${refType}", fallback to "local"`, err);
      this.referenceSpace = await session.requestReferenceSpace('local');
    }

    await this.renderer.xr.setSession(session);
  }

  _handleSessionEnd() {
    if (this.session) {
      this.session.removeEventListener('end', this._boundEndHandler);
    }
    const endedSession = this.session;
    this.session = null;
    this.referenceSpace = null;
    this.onSessionEnd({ session: endedSession });
  }
}
