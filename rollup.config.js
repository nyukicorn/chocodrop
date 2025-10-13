import { nodeResolve } from '@rollup/plugin-node-resolve';

// Production build removed - ES Modules only

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
    }
  ],
  plugins: [
    nodeResolve({
      browser: true,
      preferBuiltins: false
    })
  ],
  external: ['three', 'three/examples/jsm/renderers/CSS2DRenderer.js', 'three/examples/jsm/loaders/GLTFLoader.js']
};

// Browser SDK bundle
const sdkConfig = {
  input: 'packages/sdk/src/index.js',
  output: [
    {
      file: 'dist/chocodrop-sdk.esm.js',
      format: 'esm',
      sourcemap: true
    },
    {
      file: 'dist/chocodrop-sdk.umd.js',
      format: 'iife',
      name: 'ChocoDropSDK',
      sourcemap: true
    }
  ],
  plugins: [
    nodeResolve({
      browser: true,
      preferBuiltins: false
    })
  ]
};

export default [demoConfig, sdkConfig];
