/**
 * ChocoDrop Compatibility Layer
 *
 * This package provides backward compatibility for the old createChocoDrop API.
 * It is deprecated and will be removed in v3.0.0.
 *
 * Please migrate to @chocodrop/sdk:
 *   import { ready, attach } from '@chocodrop/sdk';
 *   await ready();
 *   await attach(scene, { camera, renderer });
 */

// Track if deprecation warning has been shown
let deprecationWarningShown = false;

/**
 * Show deprecation warning (once per session)
 */
function showDeprecationWarning() {
  if (deprecationWarningShown) return;
  deprecationWarningShown = true;

  console.warn(
    '%c⚠️ ChocoDrop Deprecation Warning',
    'color: #ff6ad5; font-weight: bold; font-size: 14px;',
    '\n\nThe `createChocoDrop` function is deprecated and will be removed in v3.0.0.\n\n' +
    'Please migrate to the new API:\n\n' +
    'OLD:\n' +
    '  import { createChocoDrop } from \'chocodrop\';\n' +
    '  createChocoDrop(scene, { camera, renderer });\n\n' +
    'NEW:\n' +
    '  <script src="http://127.0.0.1:43110/sdk.js"></script>\n' +
    '  <script type="module">\n' +
    '    await window.chocodrop.ready();\n' +
    '    await window.chocodrop.attach(scene, { camera, renderer });\n' +
    '  </script>\n\n' +
    'For more information, see: https://github.com/nyukicorn/chocodrop\n'
  );
}

/**
 * Create ChocoDrop instance (DEPRECATED)
 *
 * @deprecated Please use @chocodrop/sdk directly
 * @param {THREE.Scene} scene - Three.js scene
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} ChocoDrop instance
 */
export async function createChocoDrop(scene, options = {}) {
  showDeprecationWarning();

  // Try to load SDK from daemon
  try {
    // Dynamic import of SDK from daemon
    const SDK_URL = 'http://127.0.0.1:43110/sdk.js';

    // Load SDK script
    if (!window.chocodrop) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = SDK_URL;
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load ChocoDrop SDK from daemon'));
        document.head.appendChild(script);
      });
    }

    // Wait a bit for SDK to initialize
    await new Promise(resolve => setTimeout(resolve, 100));

    if (!window.chocodrop) {
      throw new Error('ChocoDrop SDK not available');
    }

    // Check if daemon is running
    await window.chocodrop.ready();

    // Attach to scene
    return await window.chocodrop.attach(scene, options);
  } catch (error) {
    console.error('Failed to initialize ChocoDrop:', error);

    // Fallback: Return minimal compatibility object
    console.warn('Using compatibility fallback - limited functionality');

    return {
      client: null,
      sceneManager: null,
      ui: null,
      error: error.message,
      reload: async () => {
        console.warn('Reload not available in compatibility mode');
      }
    };
  }
}

// Default export
export default createChocoDrop;
