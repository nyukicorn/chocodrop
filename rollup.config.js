import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

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
      sourcemap: true
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
      sourcemap: true
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

export default [demoConfig];