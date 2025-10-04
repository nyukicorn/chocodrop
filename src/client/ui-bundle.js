/**
 * ChocoDrop UI Bundle Entry Point
 * Used for Rollup builds (ESM and IIFE)
 */

import { createChocoDrop } from './bootstrap.js';

const BASE = 'http://127.0.0.1:43110';

/**
 * Attach ChocoDrop UI to a Three.js scene
 * @param {THREE.Scene} scene - Three.js scene
 * @param {Object} opts - Options
 * @returns {Object} - ChocoDrop components
 */
export async function attach(scene, opts = {}) {
  try {
    const components = createChocoDrop(scene, {
      ...opts,
      serverUrl: BASE
    });

    // Show UI
    if (components.ui && components.ui.show) {
      components.ui.show();
    }

    return components;
  } catch (error) {
    console.error('ChocoDrop attach failed:', error);
    throw error;
  }
}
