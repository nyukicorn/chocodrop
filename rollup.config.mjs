import { nodeResolve } from '@rollup/plugin-node-resolve';

/**
 * Rollup configuration for ChocoDrop UI
 * Creates two bundles:
 * 1. ESM version (for bundlers, keep 'three' as external)
 * 2. IIFE/Global version (for external sites with window.THREE)
 *
 * Note: GLTFLoader is bundled in both versions for convenience
 */
export default [
  // ESM version (for bundlers)
  {
    input: 'src/client/ui-bundle.js',
    output: {
      file: 'dist/ui.esm.js',
      format: 'esm',
      inlineDynamicImports: true,
    },
    plugins: [
      nodeResolve({
        browser: true,
        preferBuiltins: false
      })
    ],
    external: ['three', 'https://cdn.skypack.dev/three@0.158.0/examples/jsm/renderers/CSS2DRenderer.js', 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js'],
  },

  // IIFE/Global version (for external sites)
  {
    input: 'src/client/ui-bundle.js',
    output: {
      file: 'dist/ui.global.js',
      format: 'iife',
      name: 'ChocoDropUI',
      globals: {
        three: 'THREE', // Map 'three' import to window.THREE
      },
      inlineDynamicImports: true,
    },
    plugins: [
      nodeResolve({
        browser: true,
        preferBuiltins: false
      })
    ],
    external: ['three', 'https://cdn.skypack.dev/three@0.158.0/examples/jsm/renderers/CSS2DRenderer.js', 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js'],
  },
];
