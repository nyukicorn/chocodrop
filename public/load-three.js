const THREE_VERSION = '0.170.0';

if (!window.__chocodropThreePromise) {
  window.__chocodropThreePromise = (async () => {
    if (window.THREE && window.THREE.GLTFLoader && window.THREE.OrbitControls) {
      return window.THREE;
    }

    const THREE_MODULE = await import(`https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.js`);
    const [{ OrbitControls }, { GLTFLoader }] = await Promise.all([
      import(`https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/jsm/controls/OrbitControls.js`),
      import(`https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/jsm/loaders/GLTFLoader.js`)
    ]);

    // Create extensible THREE object with all exports
    window.THREE = {
      ...THREE_MODULE,
      OrbitControls,
      GLTFLoader
    };

    return window.THREE;
  })();
}

export default window.__chocodropThreePromise;
