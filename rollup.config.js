import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

// UI Bundle for SDK distribution
const uiConfig = {
  input: 'src/client/ui-bundle.js',
  output: {
    dir: 'dist/ui',
    format: 'esm',
    sourcemap: true,
    entryFileNames: 'ui.esm.js'
  },
  plugins: [
    nodeResolve({
      browser: true,
      preferBuiltins: false
    })
  ],
  external: ['three', 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js', 'https://cdn.skypack.dev/three@0.158.0/examples/jsm/renderers/CSS2DRenderer.js']
};

// Demo build (restricted functionality)
const demoConfig = {
  input: 'src/demo/index.js',
  output: [
    {
      file: 'dist/chocodrop-demo.umd.js',
      format: 'umd',
      name: 'ChocoDrop',
      exports: 'named',
      globals: {
        'three': 'THREE'
      },
      sourcemap: true,
      inlineDynamicImports: true
    },
    {
      file: 'dist/chocodrop-demo.umd.min.js',
      format: 'umd',
      name: 'ChocoDrop',
      exports: 'named',
      globals: {
        'three': 'THREE'
      },
      plugins: [terser()],
      sourcemap: true,
      inlineDynamicImports: true
    }
  ],
  plugins: [
    nodeResolve({
      browser: true,
      preferBuiltins: false
    })
  ],
  external: ['three', 'https://cdn.skypack.dev/three@0.158.0/examples/jsm/renderers/CSS2DRenderer.js']
};

export default [uiConfig, demoConfig];