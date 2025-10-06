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
    },
    plugins: [
      nodeResolve({
        browser: true,
        preferBuiltins: false
      })
    ],
    external: ['three'], // Only three is external, GLTFLoader will be bundled
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
    },
    plugins: [
      nodeResolve({
        browser: true,
        preferBuiltins: false
      })
    ],
    external: ['three'], // Only three is external, GLTFLoader will be bundled
  },
];
