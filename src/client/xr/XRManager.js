// UMDビルド対応: グローバルのTHREEを優先し、なければES moduleのimportを使用
import * as THREEModule from 'three';
const THREE = globalThis.THREE || THREEModule;

/**
 * XRManager - WebXRセッション管理
 * VR/ARセッションの開始、終了、状態管理を行う
 */
export class XRManager {
  constructor(renderer, options = {}) {
    if (!renderer) {
      throw new Error('THREE.WebGLRenderer is required');
    }

    this.renderer = renderer;
    this.scene = options.scene || null;
    this.camera = options.camera || null;

    // WebXR有効化
    this.renderer.xr.enabled = true;

    // XR状態
    this.isXRSupported = false;
    this.isVRSupported = false;
    this.isARSupported = false;
    this.currentSession = null;
    this.currentMode = null; // 'vr' | 'ar' | null

    // イベントリスナー
    this.sessionStartListeners = [];
    this.sessionEndListeners = [];

    // 初期化
    this.checkXRSupport();

    console.log('🥽 XRManager initialized');
  }

  /**
   * WebXRサポート確認
   */
  async checkXRSupport() {
    if (!('xr' in navigator)) {
      console.warn('⚠️ WebXR not supported in this browser');
      return;
    }

    this.isXRSupported = true;

    try {
      // VRサポート確認
      this.isVRSupported = await navigator.xr.isSessionSupported('immersive-vr');
      console.log(`🥽 VR Support: ${this.isVRSupported ? '✅' : '❌'}`);

      // ARサポート確認
      this.isARSupported = await navigator.xr.isSessionSupported('immersive-ar');
      console.log(`📱 AR Support: ${this.isARSupported ? '✅' : '❌'}`);
    } catch (error) {
      console.error('❌ Error checking XR support:', error);
    }
  }

  /**
   * VRセッション開始
   * @param {Object} options - セッションオプション
   * @returns {Promise<XRSession>}
   */
  async startVRSession(options = {}) {
    if (!this.isVRSupported) {
      throw new Error('VR is not supported on this device');
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
      await this.onSessionStarted(session, 'vr');
      return session;
    } catch (error) {
      console.error('❌ Failed to start VR session:', error);
      throw error;
    }
  }

  /**
   * ARセッション開始
   * @param {Object} options - セッションオプション
   * @returns {Promise<XRSession>}
   */
  async startARSession(options = {}) {
    if (!this.isARSupported) {
      throw new Error('AR is not supported on this device');
    }

    const sessionInit = {
      requiredFeatures: ['hit-test'],
      optionalFeatures: [
        'dom-overlay',
        'dom-overlay-for-handheld-ar',
        'plane-detection',
        'depth-sensing',
        'anchors',
        'hand-tracking',
        'layers',
        ...(options.optionalFeatures || [])
      ],
      domOverlay: options.domOverlay || { root: document.body }
    };

    try {
      const session = await navigator.xr.requestSession('immersive-ar', sessionInit);
      await this.onSessionStarted(session, 'ar');
      return session;
    } catch (error) {
      console.error('❌ Failed to start AR session:', error);
      throw error;
    }
  }

  /**
   * セッション開始時の処理
   * @param {XRSession} session
   * @param {string} mode - 'vr' | 'ar'
   */
  async onSessionStarted(session, mode) {
    this.currentSession = session;
    this.currentMode = mode;

    // セッション終了イベント
    session.addEventListener('end', () => {
      this.onSessionEnded();
    });

    // レンダラーにセッションを設定
    await this.renderer.xr.setSession(session);

    console.log(`🎉 ${mode.toUpperCase()} Session Started`);

    // 有効な機能をログ出力
    if (session.enabledFeatures) {
      console.log('✨ Enabled Features:', session.enabledFeatures);
    }

    // リスナーに通知
    this.sessionStartListeners.forEach(listener => {
      try {
        listener(session, mode);
      } catch (error) {
        console.error('❌ Error in session start listener:', error);
      }
    });
  }

  /**
   * セッション終了時の処理
   */
  onSessionEnded() {
    console.log(`👋 ${this.currentMode?.toUpperCase()} Session Ended`);

    const mode = this.currentMode;
    this.currentSession = null;
    this.currentMode = null;

    // リスナーに通知
    this.sessionEndListeners.forEach(listener => {
      try {
        listener(mode);
      } catch (error) {
        console.error('❌ Error in session end listener:', error);
      }
    });
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
   * セッション開始イベントリスナー追加
   * @param {Function} listener - (session, mode) => void
   */
  onSessionStart(listener) {
    this.sessionStartListeners.push(listener);
  }

  /**
   * セッション終了イベントリスナー追加
   * @param {Function} listener - (mode) => void
   */
  onSessionEnd(listener) {
    this.sessionEndListeners.push(listener);
  }

  /**
   * XRリファレンス空間を取得
   * @returns {XRReferenceSpace}
   */
  getReferenceSpace() {
    return this.renderer.xr.getReferenceSpace();
  }

  /**
   * 現在のセッションを取得
   * @returns {XRSession|null}
   */
  getSession() {
    return this.currentSession;
  }

  /**
   * VRモードかどうか
   * @returns {boolean}
   */
  isVRMode() {
    return this.currentMode === 'vr';
  }

  /**
   * ARモードかどうか
   * @returns {boolean}
   */
  isARMode() {
    return this.currentMode === 'ar';
  }

  /**
   * XRセッション中かどうか
   * @returns {boolean}
   */
  isPresenting() {
    return this.renderer.xr.isPresenting;
  }

  /**
   * デバッグ情報を取得
   * @returns {Object}
   */
  getDebugInfo() {
    return {
      isXRSupported: this.isXRSupported,
      isVRSupported: this.isVRSupported,
      isARSupported: this.isARSupported,
      currentMode: this.currentMode,
      isPresenting: this.isPresenting(),
      enabledFeatures: this.currentSession?.enabledFeatures || null
    };
  }
}
