import { bootstrapApp } from './app-shell.js';
import { loadThree } from './utils/three-deps.js';

async function main() {
  const canvas = document.querySelector('#immersive-canvas');
  const overlay = document.querySelector('[data-overlay]');

  const { sceneManager } = await bootstrapApp({
    canvas,
    overlay,
    options: {
      sceneManager: {
        background: '#020817',
        onBeforeRender: delta => {
          // 軽量なフレームタイミング可視化
          performance.mark('frame-end');
        }
      },
      liveCommand: {
        autoConnect: true
      }
    }
  });

  const THREE = await loadThree();
  createDefaultEnvironment(THREE, sceneManager);
  setupXRControls(sceneManager);
}

function createDefaultEnvironment(THREE, sceneManager) {
  const floorGeometry = new THREE.CylinderGeometry(7, 7, 0.2, 48);
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.8,
    metalness: 0.05
  });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.receiveShadow = true;
  floor.position.y = -0.1;

  const ambient = new THREE.AmbientLight(0xffffff, 0.3);
  const pulseLight = new THREE.PointLight(0x60a5fa, 2, 10);
  pulseLight.position.set(0, 2.5, 0);

  const ringGeometry = new THREE.TorusGeometry(2.5, 0.12, 16, 100);
  const ringMaterial = new THREE.MeshStandardMaterial({
    color: 0x7dd3fc,
    emissive: 0x1d4ed8,
    emissiveIntensity: 0.6
  });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.4;

  sceneManager.add(floor);
  sceneManager.add(ambient);
  sceneManager.add(pulseLight);
  sceneManager.add(ring);

  let t = 0;
  sceneManager.options.onBeforeRender = delta => {
    t += delta / 800;
    pulseLight.intensity = 1.5 + Math.sin(t) * 0.6;
    ring.material.emissiveIntensity = 0.4 + Math.abs(Math.sin(t)) * 0.4;
  };
}

function setupXRControls(sceneManager) {
  const xrButton = document.querySelector('[data-action=\"enter-xr\"]');
  const xrStatus = document.querySelector('[data-xr-status]');

  if (!navigator.xr) {
    xrButton.disabled = true;
    xrStatus.textContent = 'このブラウザはWebXRに対応していません';
    xrStatus.dataset.state = 'error';
    return;
  }

  xrButton.addEventListener('click', async () => {
    xrButton.disabled = true;
    xrStatus.textContent = 'XRセッションを初期化中…';
    try {
      await sceneManager.enterXR();
      xrStatus.textContent = 'XRセッション中';
      xrStatus.dataset.state = 'ok';
    } catch (error) {
      console.error(error);
      xrStatus.textContent = 'XR開始に失敗しました';
      xrStatus.dataset.state = 'error';
      xrButton.disabled = false;
    }
  }, { passive: true });

  sceneManager.on('xr:exit', () => {
    xrStatus.textContent = 'XR待機中';
    xrStatus.dataset.state = 'idle';
    xrButton.disabled = false;
  });
}

main().catch(error => {
  console.error('immersive bootstrap failed', error);
  const overlay = document.querySelector('[data-overlay]');
  if (overlay) {
    overlay.dataset.state = 'error';
    overlay.querySelector('[data-status]').textContent = '初期化に失敗しました';
  }
});
