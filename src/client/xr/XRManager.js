/**
 * XRManager - WebXR セッション管理
 * VR/ARモードの制御、セッション状態管理、イベントハンドリングを行う
 */
export class XRManager {
  constructor(renderer, options = {}) {
    if (!renderer) {
      throw new Error('THREE.WebGLRenderer is required');
    }

    this.renderer = renderer;
    this.options = options;

    // XR状態
    this.isXRSupported = false;
    this.isVRSupported = false;
    this.isARSupported = false;
    this.currentSession = null;
    this.currentMode = null; // 'immersive-vr' | 'immersive-ar' | null

    // イベントリスナー
    this.listeners = {
      sessionstart: [],
      sessionend: [],
      modechange: []
    };

    // WebXR有効化
    this.renderer.xr.enabled = true;

    // WebXRサポートチェック
    this.checkWebXRSupport();

    console.log('🥽 XRManager initialized');
  }

  /**
   * WebXRサポートをチェック
   */
  async checkWebXRSupport() {
    if (!('xr' in navigator)) {
      console.warn('⚠️ WebXR not supported in this browser');
      this.isXRSupported = false;
      return;
    }

    this.isXRSupported = true;

    try {
      // VRサポートチェック
      this.isVRSupported = await navigator.xr.isSessionSupported('immersive-vr');
      console.log('VR Supported:', this.isVRSupported);

      // ARサポートチェック
      this.isARSupported = await navigator.xr.isSessionSupported('immersive-ar');
      console.log('AR Supported:', this.isARSupported);

    } catch (error) {
      console.error('Error checking WebXR support:', error);
    }

    return {
      isXRSupported: this.isXRSupported,
      isVRSupported: this.isVRSupported,
      isARSupported: this.isARSupported
    };
  }

  /**
   * VRセッションを開始
   */
  async startVRSession(options = {}) {
    if (!this.isVRSupported) {
      throw new Error('VR not supported');
    }

    const sessionInit = {
      optionalFeatures: [
        'local-floor',
        'bounded-floor',
        'hand-tracking',
        'layers',
        ...(options.optionalFeatures || [])
      ]
    };

    try {
      const session = await navigator.xr.requestSession('immersive-vr', sessionInit);
      await this.setupSession(session, 'immersive-vr');
      console.log('🥽 VR Session started');
      return session;
    } catch (error) {
      console.error('Failed to start VR session:', error);
      throw error;
    }
  }

  /**
   * ARセッションを開始
   */
  async startARSession(options = {}) {
    if (!this.isARSupported) {
      throw new Error('AR not supported');
    }

    const sessionInit = {
      requiredFeatures: ['local-floor'],
      optionalFeatures: [
        'hit-test',
        'dom-overlay',
        'hand-tracking',
        'layers',
        'plane-detection',
        'anchors',
        ...(options.optionalFeatures || [])
      ],
      ...(options.domOverlay && {
        domOverlay: { root: options.domOverlay }
      })
    };

    try {
      const session = await navigator.xr.requestSession('immersive-ar', sessionInit);
      await this.setupSession(session, 'immersive-ar');
      console.log('🌐 AR Session started');
      return session;
    } catch (error) {
      console.error('Failed to start AR session:', error);
      throw error;
    }
  }

  /**
   * セッションのセットアップ
   */
  async setupSession(session, mode) {
    this.currentSession = session;
    this.currentMode = mode;

    // レンダラーにセッションを設定
    await this.renderer.xr.setSession(session);

    // ARモードの場合は背景を透明に
    if (mode === 'immersive-ar') {
      // 背景はnullにしてパススルーを表示
      // これは呼び出し側（SceneManager）で制御
    }

    // セッションイベント
    session.addEventListener('end', () => {
      this.onSessionEnd();
    });

    // sessionstart イベントを発火
    this.emit('sessionstart', { session, mode });
  }

  /**
   * セッション終了時の処理
   */
  onSessionEnd() {
    const previousMode = this.currentMode;

    this.currentSession = null;
    this.currentMode = null;

    console.log(`🔚 XR Session ended (${previousMode})`);

    // sessionend イベントを発火
    this.emit('sessionend', { mode: previousMode });
  }

  /**
   * 現在のセッションを終了
   */
  async endSession() {
    if (this.currentSession) {
      await this.currentSession.end();
    }
  }

  /**
   * イベントリスナーを登録
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    } else {
      console.warn(`Unknown event: ${event}`);
    }
  }

  /**
   * イベントリスナーを削除
   */
  off(event, callback) {
    if (this.listeners[event]) {
      const index = this.listeners[event].indexOf(callback);
      if (index !== -1) {
        this.listeners[event].splice(index, 1);
      }
    }
  }

  /**
   * イベントを発火
   */
  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }

  /**
   * 現在のXRモードを取得
   */
  getCurrentMode() {
    return this.currentMode;
  }

  /**
   * XRセッションがアクティブかどうか
   */
  isSessionActive() {
    return this.currentSession !== null;
  }

  /**
   * VRモードかどうか
   */
  isVRMode() {
    return this.currentMode === 'immersive-vr';
  }

  /**
   * ARモードかどうか
   */
  isARMode() {
    return this.currentMode === 'immersive-ar';
  }

  /**
   * XR参照空間を取得
   */
  getReferenceSpace() {
    return this.renderer.xr.getReferenceSpace();
  }

  /**
   * XRフレームレートを取得（デバッグ用）
   */
  getFrameRate() {
    const session = this.currentSession;
    if (session && session.frameRate) {
      return session.frameRate;
    }
    return null;
  }

  /**
   * クリーンアップ
   */
  dispose() {
    if (this.currentSession) {
      this.currentSession.end();
    }

    this.listeners = {
      sessionstart: [],
      sessionend: [],
      modechange: []
    };

    console.log('🗑️ XRManager disposed');
  }
}

export default XRManager;
