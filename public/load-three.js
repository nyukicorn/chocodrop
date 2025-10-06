const THREE_VERSION = '0.170.0';

if (!window.__chocodropThreePromise) {
  window.__chocodropThreePromise = (async () => {
    if (window.THREE && window.THREE.GLTFLoader && window.THREE.OrbitControls) {
      return window.THREE;
    }

    const THREE = await import(`https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.js`);
    const [{ OrbitControls }, { GLTFLoader }] = await Promise.all([
      import(`https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/jsm/controls/OrbitControls.js`),
      import(`https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/jsm/loaders/GLTFLoader.js`)
    ]);

    window.THREE = THREE;
    window.THREE.OrbitControls = OrbitControls;
    window.THREE.GLTFLoader = GLTFLoader;

    return window.THREE;
  })();
}

export default window.__chocodropThreePromise;
