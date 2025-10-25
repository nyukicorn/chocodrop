// XRBridge: Detects and manages spatial runtimes (WebXR / visionOS Safari / Meta Quest)
// This module intentionally avoids hard dependencies so it can run in non-XR browsers.

const DEFAULT_SESSION_MODE = 'immersive-ar';
const OPTIONAL_FEATURES = ['local-floor', 'anchors', 'plane-detection', 'hit-test', 'hand-tracking'];

function getNavigator() {
  if (typeof navigator !== 'undefined') {
    return navigator;
  }
  return undefined;
}

function detectPlatform() {
  const nav = getNavigator();
  const ua = (nav && nav.userAgent) ? nav.userAgent.toLowerCase() : '';
  const platform = (nav && nav.platform) ? nav.platform.toLowerCase() : '';

  const isVisionOS = /visionos|applevision|xr os/.test(ua);
  const isIOSSafari = /iphone|ipad|ipod/.test(ua) && /safari/.test(ua) && !/crios|fxios|android/.test(ua);
  const isQuest = /quest|oculus|meta/.test(ua);

  if (isVisionOS) {
    return 'visionos';
  }

  if (isQuest) {
    return 'quest';
  }

  if (isIOSSafari) {
    return 'ios';
  }

  if (/android/.test(ua)) {
    return 'android';
  }

  if (/mac/.test(platform)) {
    return 'mac';
  }

  return 'web';
}

export function detectSpatialEnvironment() {
  const nav = getNavigator();
  const hasXR = !!(nav && nav.xr);
  const platform = detectPlatform();
  return {
    platform,
    hasXR,
    isVisionOS: platform === 'visionos',
    isQuest: platform === 'quest',
    isMobileSafari: platform === 'ios' || platform === 'visionos',
    // Apple Vision Pro (visionOS Safari) exposes `navigator.platform === 'MacIntel'` but has `maxTouchPoints > 0`
    maxTouchPoints: nav?.maxTouchPoints ?? 0
  };
}

export class XRBridge {
  constructor(renderer = null) {
    this.renderer = renderer || null;
    this.environment = detectSpatialEnvironment();
    this.session = null;
    this.referenceSpace = null;
    this.hitTestSource = null;
    this.viewerSpace = null;
    this.isInitializing = false;
    this.listeners = new Set();
  }

  /**
   * True when WebXR (or equivalent visionOS runtime) is reachable.
   */
  get isSupported() {
    const nav = getNavigator();
    return !!(nav && nav.xr);
  }

  /**
   * lazily create a WebXR session and bind it to the renderer (if provided)
   */
  async ensureSession(options = {}) {
    if (!this.isSupported) {
      return null;
    }

    if (this.session) {
      return this.session;
    }

    if (this.isInitializing) {
      return new Promise((resolve, reject) => {
        const onReady = (event) => {
          if (event.type === 'xrbridge:ready') {
            this.listeners.delete(onReady);
            resolve(this.session);
          } else if (event.type === 'xrbridge:error') {
            this.listeners.delete(onReady);
            reject(event.error);
          }
        };
        this.listeners.add(onReady);
      });
    }

    this.isInitializing = true;
    const nav = getNavigator();

    try {
      const sessionInit = {
        mode: options.mode || DEFAULT_SESSION_MODE,
        requiredFeatures: options.requiredFeatures || ['local-floor'],
        optionalFeatures: options.optionalFeatures || OPTIONAL_FEATURES
      };

      const session = await nav.xr.requestSession(sessionInit.mode, {
        requiredFeatures: sessionInit.requiredFeatures,
        optionalFeatures: sessionInit.optionalFeatures
      });

      this.session = session;

      if (this.renderer && this.renderer.xr) {
        this.renderer.xr.setReferenceSpaceType('local-floor');
        await this.renderer.xr.setSession(session);
      }

      try {
        this.referenceSpace = await session.requestReferenceSpace('local-floor');
      } catch (err) {
        this.referenceSpace = await session.requestReferenceSpace('local');
      }

      try {
        this.viewerSpace = await session.requestReferenceSpace('viewer');
      } catch (err) {
        this.viewerSpace = null;
      }

      session.addEventListener('end', () => {
        this.session = null;
        this.referenceSpace = null;
        this.hitTestSource = null;
        this.viewerSpace = null;
      });

      this.isInitializing = false;
      this.emit({ type: 'xrbridge:ready' });
      return session;
    } catch (error) {
      console.warn('XRBridge failed to start session:', error);
      this.isInitializing = false;
      this.emit({ type: 'xrbridge:error', error });
      throw error;
    }
  }

  /**
   * Acquire or reuse a hit-test source (if supported). On browsers without hit-test
   * support we simply resolve to null so callers can fallback to camera-relative placement.
   */
  async ensureHitTestSource() {
    if (!this.session || !this.session.requestHitTestSource) {
      return null;
    }

    if (this.hitTestSource) {
      return this.hitTestSource;
    }

    if (!this.viewerSpace) {
      this.viewerSpace = await this.session.requestReferenceSpace('viewer');
    }

    this.hitTestSource = await this.session.requestHitTestSource({ space: this.viewerSpace });
    return this.hitTestSource;
  }

  emit(event) {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.warn('XRBridge listener error:', error);
      }
    });
  }
}

export default XRBridge;
