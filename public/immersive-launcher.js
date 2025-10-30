import ensureThree from './load-three.js';
import { ensureChocoDrop } from './load-chocodrop.js';

const statusEl = document.getElementById('statusMessage');
const startButton = document.getElementById('startXR');
const backButton = document.getElementById('backToDashboard');
const canvasContainer = document.getElementById('canvasContainer');
const chocoPWA = window.chocoPWA || null;

let renderer = null;
let scene = null;
let camera = null;
let dropInstance = null;
let xrSession = null;

function updateStatus(message) {
  if (statusEl) {
    statusEl.textContent = message;
  }
}

function logImmersive(tag, details = {}) {
  if (!chocoPWA || typeof chocoPWA.appendLog !== 'function') {
    return;
  }
  const entry = { tag, ...details };
  chocoPWA.appendLog(entry).catch((error) => {
    console.warn('⚠️ XRログ書き込みに失敗しました', error);
  });
}

async function prepareScene() {
  if (renderer) {
    return;
  }

  const THREE = await ensureThree;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
  renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
  renderer.xr.enabled = true;

  canvasContainer.innerHTML = '';
  canvasContainer.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color('#05070d');

  camera = new THREE.PerspectiveCamera(
    65,
    canvasContainer.clientWidth / canvasContainer.clientHeight,
    0.1,
    100
  );
  camera.position.set(0, 1.6, 3);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x1f2937, 1.2);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(4, 6, 2);
  scene.add(dirLight);

  const grid = new THREE.GridHelper(12, 24, 0x6f35bc, 0x312663);
  scene.add(grid);

  const { createChocoDrop } = await ensureChocoDrop();
  dropInstance = createChocoDrop(scene, {
    camera,
    renderer,
    sceneOptions: {
      enableMouseInteraction: false,
      showLocationIndicator: false,
      defaultObjectScale: 1.2
    },
    uiOptions: {
      skipServiceDialog: true,
      enableServerHealthCheck: false,
      showGuidedOnboarding: false
    }
  });

  renderer.setAnimationLoop(() => {
    renderer.render(scene, camera);
  });

  updateStatus('準備完了。XR体験を開始できます。');
}

async function startXRSession(autoTriggered = false) {
  if (!navigator.xr) {
    updateStatus('XR API をサポートしていない環境です。Quest 3 または対応ブラウザで再度お試しください。');
    startButton.disabled = true;
    logImmersive('xr-unsupported', { userAgent: navigator.userAgent });
    return;
  }

  if (xrSession) {
    updateStatus('XR セッションは既に実行中です。');
    return;
  }

  startButton.disabled = true;
  updateStatus('XR セッションを初期化しています...');

  try {
    await prepareScene();
    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers']
    });

    session.addEventListener('end', () => {
      xrSession = null;
      startButton.disabled = false;
      updateStatus('XR セッションが終了しました。再開するにはもう一度タップしてください。');
      logImmersive('xr-session-ended', {});
    });

    await renderer.xr.setSession(session);
    xrSession = session;
    updateStatus('XR セッションを開始しました。ヘッドセットで体験をお楽しみください。');
    logImmersive('xr-session-started', { autoTriggered });
  } catch (error) {
    console.error('XR session failed', error);
    startButton.disabled = false;
    updateStatus(`XR 開始に失敗しました: ${error.message}`);
    logImmersive('xr-start-error', { message: error.message });
  }
}

function handleResize() {
  if (!renderer || !camera) return;
  const width = canvasContainer.clientWidth;
  const height = canvasContainer.clientHeight;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function navigateBack() {
  window.location.href = '/index.html';
}

async function recordLaunchTimestamp() {
  if (!chocoPWA || typeof chocoPWA.saveSession !== 'function') return;
  try {
    const existing = (await chocoPWA.loadSession()) || {};
    await chocoPWA.saveSession({
      ...existing,
      lastXRLaunchAt: new Date().toISOString()
    });
  } catch (error) {
    console.warn('⚠️ XR 起動時刻の保存に失敗しました', error);
  }
}

function init() {
  startButton.addEventListener('click', () => {
    startXRSession(false);
    recordLaunchTimestamp();
  });

  backButton.addEventListener('click', navigateBack);
  window.addEventListener('resize', handleResize);

  if (window.location.hash.includes('autoplay')) {
    // ブラウザ制約によりユーザー操作が必要な場合あり
    setTimeout(() => startXRSession(true), 350);
    recordLaunchTimestamp();
  } else {
    updateStatus('没入準備が整いました。ヘッドセットを装着して「XR体験を開始する」をタップしてください。');
  }
}

init();
