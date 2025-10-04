/**
 * Rollup configuration for ChocoDrop UI
 * Creates two bundles:
 * 1. ESM version (for bundlers, keep 'three' as external)
 * 2. IIFE/Global version (for external sites with window.THREE)
 */
export default [
  // ESM version (for bundlers)
  {
    input: 'src/client/ui-bundle.js',
    output: {
      file: 'dist/ui.esm.js',
      format: 'esm',
    },
    external: ['three'], // Don't bundle three
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
    external: ['three'], // Don't bundle three, use window.THREE
  },
];
