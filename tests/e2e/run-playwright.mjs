import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const browserCacheDir = path.join(repoRoot, '.playwright-browsers');
const browserHomeDir = path.join(browserCacheDir, '.home');
if (!fs.existsSync(browserHomeDir)) {
  fs.mkdirSync(browserHomeDir, { recursive: true });
}
process.env.PLAYWRIGHT_BROWSERS_PATH = browserCacheDir;
process.env.HOME = browserHomeDir;

const { webkit } = await import('playwright');
const baseLaunchOptions = {
  headless: true,
  env: {
    ...process.env,
    HOME: browserHomeDir,
    PLAYWRIGHT_BROWSERS_PATH: browserCacheDir
  }
};
const xrBridgeModule = pathToFileURL(path.join(repoRoot, 'src/client/xr/XRBridgeLoader.js')).href;
const remoteLoaderModule = pathToFileURL(path.join(repoRoot, 'src/pwa/remote/RemoteSceneLoader.js')).href;

let attemptedBrowserInstall = false;

async function launchBrowser() {
  try {
    return await webkit.launch(baseLaunchOptions);
  } catch (error) {
    if (!attemptedBrowserInstall && /playwright install/.test(error.message)) {
      attemptedBrowserInstall = true;
      await installBrowsers();
      return webkit.launch(baseLaunchOptions);
    }
    throw error;
  }
}

async function installBrowsers() {
  const binDir = path.join(repoRoot, 'node_modules', '.bin');
  const candidates = ['playwright', 'playwright-core'];
  for (const candidate of candidates) {
    const bin = process.platform === 'win32' ? `${candidate}.cmd` : candidate;
    const cliPath = path.join(binDir, bin);
    if (fs.existsSync(cliPath)) {
      await runCommand(cliPath, ['install', 'webkit']);
      return;
    }
  }
  await runCommand('npx', ['playwright', 'install', 'webkit']);
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browserCacheDir }
    });
    child.on('exit', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
      }
    });
    child.on('error', reject);
  });
}

async function withPage(fn) {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  try {
    await page.goto('about:blank');
    await fn(page);
  } finally {
    await browser.close();
  }
}

async function testXRBridgeLoopCapture() {
  await withPage(async page => {
    const frame = await page.evaluate(async moduleUrl => {
      const { XRBridgeLoader } = await import(moduleUrl);

      const fakeRenderer = {
        xr: {
          enabled: false,
          addEventListener() {},
          removeEventListener() {},
          async setSession(session) {
            this.session = session;
          },
          getSession() {
            return this.session;
          }
        },
        _loop: null,
        setAnimationLoop(loop) {
          this._loop = loop;
        },
        getAnimationLoop() {
          return this._loop;
        }
      };

      const fakeSession = {
        end: async () => {},
        addEventListener() {},
        removeEventListener() {}
      };

      const fakeXR = {
        async isSessionSupported() {
          return true;
        },
        async requestSession() {
          return fakeSession;
        },
        addEventListener() {},
        removeEventListener() {}
      };

      Object.defineProperty(navigator, 'xr', { value: fakeXR, configurable: true });

      let receivedFrame = null;
      const hostLoop = (time, frameData) => {
        if (frameData) {
          receivedFrame = frameData;
        }
      };

      const bridge = new XRBridgeLoader({ renderer: fakeRenderer });
      bridge.install();

      window.requestAnimationFrame(hostLoop);
      fakeRenderer.setAnimationLoop(hostLoop);

      await bridge.enter('vr', { fallbackLoop: hostLoop });
      fakeRenderer._loop?.(0, { source: 'test-xr' });
      return receivedFrame;
    }, xrBridgeModule);

    if (!frame || frame.source !== 'test-xr') {
      throw new Error('XRFrame was not forwarded to captured loop');
    }
  });
}

async function testRemoteSceneProxyFallback() {
  await withPage(async page => {
    const result = await page.evaluate(async moduleUrl => {
      const { default: RemoteSceneLoader } = await import(moduleUrl);
      const events = [];

      const loader = new RemoteSceneLoader({
        proxyOrigin: 'https://proxy.local',
        log: (event, payload) => events.push({ event, payload }),
        fetcher: async () => ({
          ok: true,
          headers: {
            get(name) {
              if (name && name.toLowerCase() === 'access-control-allow-origin') {
                return '*';
              }
              return null;
            }
          }
        })
      });

      loader.createSandboxedFrame = function patchedFrame(url, { useProxy }) {
        const iframe = document.createElement('iframe');
        setTimeout(() => {
          iframe.dispatchEvent(new Event(useProxy ? 'load' : 'error'));
        }, 0);
        return iframe;
      };

      const container = document.createElement('div');
      container.classList.add('remote-preview');
      document.body.appendChild(container);

      const recoveryEvents = [];
      loader.addEventListener('fallback', () => recoveryEvents.push('fallback-event'));
      loader.addEventListener('loaded', ({ detail }) => recoveryEvents.push(detail.useProxy ? 'loaded-proxy' : 'loaded-direct'));

      await loader.load(container, 'https://example.com/scene', {});
      await new Promise(resolve => setTimeout(resolve, 30));
      return recoveryEvents;
    }, remoteLoaderModule);

    if (!result.includes('fallback-event') || !result.includes('loaded-proxy')) {
      throw new Error('Proxy fallback flow did not complete');
    }
  });
}

(async () => {
  const tests = [
    { name: 'XRBridge forwards XRFrame', fn: testXRBridgeLoopCapture },
    { name: 'RemoteSceneLoader proxy fallback', fn: testRemoteSceneProxyFallback }
  ];

  const failures = [];
  for (const testCase of tests) {
    try {
      await testCase.fn();
      console.log(`✅ ${testCase.name}`);
    } catch (error) {
      failures.push({ name: testCase.name, error });
      console.error(`❌ ${testCase.name}`, error);
    }
  }

  if (failures.length > 0) {
    process.exitCode = 1;
  }
})();
