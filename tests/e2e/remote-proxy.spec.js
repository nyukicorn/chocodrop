import { test, expect } from '@playwright/test';
import { RemoteSceneLoader } from '../../src/client/remote/RemoteSceneLoader.js';

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.dataset = {};
    this.eventListeners = {};
    this._innerHTML = '';
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    this.children = this.children.filter(entry => entry !== child);
    child.parentNode = null;
    return child;
  }

  addEventListener(type, handler, options = {}) {
    if (!this.eventListeners[type]) {
      this.eventListeners[type] = [];
    }
    this.eventListeners[type].push({ handler, once: Boolean(options?.once) });
  }

  focus() {
    this.dataset.focused = 'true';
  }

  set innerHTML(value) {
    this._innerHTML = value;
    this.children.forEach(child => {
      child.parentNode = null;
    });
    this.children = [];
  }

  get innerHTML() {
    return this._innerHTML;
  }

  trigger(type) {
    const listeners = this.eventListeners[type] || [];
    this.eventListeners[type] = listeners.filter(entry => !entry.once);
    listeners.forEach(entry => entry.handler({ type }));
  }

  set src(value) {
    this._src = value;
    setTimeout(() => this.trigger('load'), 0);
  }

  get src() {
    return this._src;
  }
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement('body');
  }

  createElement(tag) {
    return new FakeElement(tag);
  }

  querySelectorAll() {
    return [];
  }
}

const setupDom = () => {
  const document = new FakeDocument();
  globalThis.document = document;
  globalThis.window = {
    location: { origin: 'https://local.test' }
  };
  globalThis.performance = { now: () => 0 };
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(type, params = {}) {
      super(type);
      this.detail = params.detail;
    }
  };
  return document;
};

const cleanupDom = () => {
  delete globalThis.document;
  delete globalThis.window;
  delete globalThis.CustomEvent;
};

test.describe('RemoteSceneLoader proxy fallback', () => {
  test('retries via Service Worker proxy when CORS is blocked', async () => {
    setupDom();
    const telemetry = [];
    globalThis.fetch = async (url, options = {}) => {
      if (options.method === 'HEAD') {
        throw new TypeError('CORS blocked');
      }
      return new Response('<html></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' }
      });
    };

    const controller = {
      postMessage: (_payload, ports) => {
        const port = ports?.[0];
        setTimeout(() => {
          port.postMessage({
            ok: true,
            ticket: 'test-ticket',
            url: 'https://proxy.local/scene.html'
          });
        }, 0);
      }
    };

    const loader = new RemoteSceneLoader({
      container: new FakeElement('section'),
      serviceWorker: { controller },
      telemetry: (entry) => telemetry.push(entry)
    });

    loader.setContainer(loader.container);
    const result = await loader.load('https://blocked.example.com/world/index.html', { autoProxy: true });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(result.viaProxy).toBeTruthy();
    expect(loader.currentState.viaProxy).toBeTruthy();
    expect(loader.container.children[0]?.dataset?.state).toBe('loaded');
    expect(telemetry.some(entry => entry.event === 'proxy:success')).toBeTruthy();

    cleanupDom();
    delete globalThis.fetch;
  });
});
