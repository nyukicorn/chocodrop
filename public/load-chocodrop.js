import ensureThree from './load-three.js';

const BUNDLE_VERSION = '20251011025008';
const BUNDLE_URL = new URL(`./chocodrop-demo.umd.min.js?v=${BUNDLE_VERSION}`, import.meta.url).href;

async function ensureChocoDrop() {
  await ensureThree;

  if (!window.__chocodropUmdPromise || window.__chocodropUmdPromise.version !== BUNDLE_VERSION) {
    window.__chocodropUmdPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = BUNDLE_URL;
      script.onload = () => resolve(window.ChocoDrop);
      script.onerror = reject;
      document.head.appendChild(script);
    });
    window.__chocodropUmdPromise.version = BUNDLE_VERSION;
  }

  await window.__chocodropUmdPromise;
  return window.ChocoDrop;
}

export { ensureChocoDrop };
export default ensureChocoDrop;
