import { test, expect } from '@playwright/test';
import { XRBridgeLoader } from '../../src/client/xr/XRBridgeLoader.js';

const cleanupGlobals = () => {
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.navigator;
  delete globalThis.requestAnimationFrame;
  delete globalThis.cancelAnimationFrame;
};

if (typeof globalThis.performance === 'undefined') {
  globalThis.performance = { now: () => 0 };
}

test.describe('XRBridgeLoader loop capture', () => {
  test('pipes XRFrame into legacy animation callback', async () => {
    cleanupGlobals();
    const rafCallbacks = new Map();
    let rafId = 0;
    globalThis.window = globalThis;
    globalThis.document = { querySelectorAll: () => [] };
    globalThis.performance = { now: () => 0 };
    globalThis.requestAnimationFrame = (callback) => {
      const id = ++rafId;
      rafCallbacks.set(id, callback);
      return id;
    };
    globalThis.cancelAnimationFrame = (id) => {
      rafCallbacks.delete(id);
    };
    const flushRaf = () => {
      const entries = Array.from(rafCallbacks.values());
      rafCallbacks.clear();
      entries.forEach(cb => cb(16));
    };

    const legacyFrames = [];
    const fakeSession = {
      addEventListener: () => {},
      end: async () => {}
    };
    globalThis.navigator = {
      xr: {
        isSessionSupported: async () => true,
        requestSession: async () => fakeSession,
        addEventListener: () => {}
      }
    };

    const renderer = {
      isWebGLRenderer: true,
      xr: {
        enabled: false,
        addEventListener: () => {},
        setSession: async () => {}
      },
      render: () => legacyFrames.push('render'),
      __originalLoop: null,
      __loop: null,
      setAnimationLoop(fn) {
        this.__loop = fn;
      },
      getAnimationLoop() {
        return this.__originalLoop;
      }
    };

    renderer.__originalLoop = (timestamp, frame) => {
      legacyFrames.push(frame ? 'legacy-frame-with-xr' : 'legacy-frame');
      window.requestAnimationFrame(renderer.__originalLoop);
    };

    const bridge = new XRBridgeLoader({
      renderer,
      scene: {},
      camera: {}
    });

    window.requestAnimationFrame(renderer.__originalLoop);
    flushRaf();

    await bridge.enter('vr');

    await renderer.__loop?.(33, { mocked: true });
    await renderer.__loop?.(34, { mocked: true });

    expect(legacyFrames.filter(entry => entry === 'legacy-frame-with-xr').length).toBeGreaterThan(0);
    cleanupGlobals();
  });
});
