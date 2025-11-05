import { loadThree, loadOrbitControls } from '../src/pwa/utils/three-deps.js';

const DEFAULT_BACKGROUND = '#0f172a';
const TARGET_FPS = 72;
const TARGET_DELTA = 1000 / TARGET_FPS;
const DEADZONE = 0.15;
const TRANSLATION_SPEED = 1.5;
const VERTICAL_SPEED = 1.2;
const ROTATION_SPEED = Math.PI;
const SCALE_SPEED = 0.8;

/**
 * XR/非XR両対応の軽量シーンマネージャ。
 * - 72fps ターゲットで描画ループを制御
 * - WebXR 対応
 * - シーン操作用のイベントブリッジを提供
 */
export class SceneManager {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.options = {
      enableXR: true,
      pixelRatioCeiling: 1.8,
      background: DEFAULT_BACKGROUND,
      onBeforeRender: null,
      onAfterRender: null,
      ...options
    };

    this.events = new EventTarget();
    this.isReady = false;
    this.isRunning = false;
    this.lastFrameTime = 0;
    this.xrSession = null;
    this.xrMode = null;
    this.disposables = new Set();
    this.selectedObject = null;
    this._manipVectors = {};
    this._tmpEuler = null;
  }

  on(type, handler) {
    this.events.addEventListener(type, handler);
    return () => this.events.removeEventListener(type, handler);
  }

  emit(type, detail) {
    this.events.dispatchEvent(new CustomEvent(type, { detail }));
  }

  async init() {
    if (this.isReady) return;

    const THREE = await loadThree();
    const OrbitControls = await loadOrbitControls();

    this.THREE = THREE;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });

    const pixelRatio = Math.min(window.devicePixelRatio || 1, this.options.pixelRatioCeiling);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setAnimationLoop(null);

    if (this.options.enableXR && 'xr' in navigator) {
      this.renderer.xr.enabled = true;
      this.renderer.xr.addEventListener?.('sessionend', () => {
        this.xrSession = null;
        this.xrMode = null;
        this.emit('xr:exit');
      });
    }

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.options.background);
    this.dynamicRoot = new THREE.Group();
    this.dynamicRoot.name = 'SceneManagerDynamicRoot';
    this.scene.add(this.dynamicRoot);

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 1000);
    this.camera.position.set(0, 1.6, 3);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.target.set(0, 1.5, 0);

    this._initLights();
    this._initGrid();

    window.addEventListener('resize', this._handleResize);
    this.disposables.add(() => window.removeEventListener('resize', this._handleResize));

    this.isReady = true;
    this.emit('ready', { scene: this.scene, camera: this.camera });
  }

  _initLights() {
    const { THREE } = this;
    const hemi = new THREE.HemisphereLight(0xffffff, 0x404040, 1.1);
    hemi.position.set(0, 3, 0);

    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 10, 7.5);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);

    this.scene.add(hemi);
    this.scene.add(dir);
    this.lightRig = { hemi, dir };
  }

  _initGrid() {
    const { THREE } = this;
    const grid = new THREE.GridHelper(20, 20, 0x4ade80, 0x1f2937);
    grid.material.opacity = 0.4;
    grid.material.transparent = true;
    this.scene.add(grid);
  }

  _handleResize = () => {
    if (!this.isReady) return;
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.emit('resize', { width, height });
  };

  start() {
    if (!this.isReady || this.isRunning) return;
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    if (this.renderer.setAnimationLoop) {
      this.renderer.setAnimationLoop(time => {
        if (!this.isRunning) return;
        this._tick(time);
      });
    } else {
      const loop = time => {
        if (!this.isRunning) return;
        this._tick(time);
        this.animationFrame = requestAnimationFrame(loop);
      };
      this.animationFrame = requestAnimationFrame(loop);
    }
    this.emit('start');
  }

  stop() {
    this.isRunning = false;
    if (this.renderer.setAnimationLoop) {
      this.renderer.setAnimationLoop(null);
    }
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.emit('stop');
  }

  _tick(time) {
    const delta = time - this.lastFrameTime;
    if (delta < TARGET_DELTA) {
      return;
    }
    this.lastFrameTime = time;
    this.controls.update();
    this.options.onBeforeRender?.(delta);
    this.renderer.render(this.scene, this.camera);
    this.options.onAfterRender?.(delta);
    this._updateXRManipulation(delta);
  }

  async enterXR(mode = 'vr') {
    if (!this.options.enableXR || !this.renderer.xr.enabled) {
      throw new Error('WebXR はサポートされていません');
    }
    const sessionType = mode === 'ar' ? 'immersive-ar' : 'immersive-vr';
    if (mode === 'ar') {
      const supported = await this.isSessionSupported('ar');
      if (!supported) {
        throw new Error('AR セッションはこのデバイスでサポートされていません');
      }
    }
    this.emit('xr:request', { mode: sessionType });
    try {
      const session = await navigator.xr.requestSession(sessionType, {
        requiredFeatures: mode === 'ar' ? ['local-floor', 'hit-test'] : ['local-floor', 'bounded-floor'],
        optionalFeatures: ['hand-tracking', 'layers']
      });
      await this.renderer.xr.setSession(session);
      this.xrSession = session;
      this.xrMode = mode;
      this._setupXRControllers();
      this.emit('xr:entered', { session: this.xrSession, mode: sessionType });
    } catch (error) {
      this.emit('xr:error', { error, mode: sessionType });
      throw error;
    }
  }

  async enterAR() {
    return this.enterXR('ar');
  }

  async isSessionSupported(mode = 'vr') {
    if (!navigator.xr?.isSessionSupported) return false;
    try {
      return await navigator.xr.isSessionSupported(mode === 'ar' ? 'immersive-ar' : 'immersive-vr');
    } catch (error) {
      console.warn('XR support check failed', error);
      return false;
    }
  }

  async exitXR() {
    if (!this.xrSession) return;
    await this.xrSession.end();
    this.xrSession = null;
    this.xrMode = null;
    this.emit('xr:exit');
  }

  add(object3d) {
    this.dynamicRoot.add(object3d);
    this.emit('object:add', { object3d });
    this.setSelectedObject(object3d);
  }

  remove(object3d) {
    this.dynamicRoot.remove(object3d);
    this.emit('object:remove', { object3d });
    if (this.selectedObject === object3d) {
      this.setSelectedObject(null);
    }
  }

  clear() {
    [...this.dynamicRoot.children].forEach(child => {
      this.dynamicRoot.remove(child);
      child.traverse?.(node => {
        if (node.material) {
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          materials.forEach(mat => mat.dispose?.());
        }
        node.geometry?.dispose?.();
        node.dispose?.();
      });
    });
    this.emit('scene:cleared');
    this.setSelectedObject(null);
  }

  async importJSON(json) {
    const { ObjectLoader } = this.THREE;
    const loader = new ObjectLoader();
    const object = loader.parse(json);
    if (object && object.name === 'SceneManagerDynamicRoot') {
      this.clear();
      object.children.forEach(child => this.dynamicRoot.add(child));
      this.emit('import:json', { object: this.dynamicRoot });
      if (this.dynamicRoot.children[0]) {
        this.setSelectedObject(this.dynamicRoot.children[0]);
      }
      return this.dynamicRoot;
    }
    this.dynamicRoot.add(object);
    this.emit('import:json', { object });
    this.setSelectedObject(object);
    return object;
  }

  dispose() {
    this.stop();
    this.disposables.forEach(fn => {
      try { fn(); } catch (_) { /* noop */ }
    });
    this.disposables.clear();
    if (this.renderer) {
      this.renderer.dispose?.();
      this.renderer = null;
    }
    this.emit('disposed');
  }

  setSelectedObject(object) {
    this.selectedObject = object;
    this.emit('selection:changed', { object });
  }

  exportSceneJSON() {
    return this.dynamicRoot.toJSON();
  }

  _setupXRControllers() {
    if (!this.renderer?.xr || !this.THREE) return;
    if (!this._manipVectors.forward) {
      this._manipVectors.forward = new this.THREE.Vector3();
      this._manipVectors.right = new this.THREE.Vector3();
    }
  }

  _updateXRManipulation(deltaMs) {
    if (!this.xrSession || !this.selectedObject || !this.renderer?.xr) return;
    if (!this._manipVectors.forward && this.THREE) {
      this._setupXRControllers();
    }
    const session = this.renderer.xr.getSession();
    if (!session) return;
    const delta = deltaMs / 1000;
    const forward = this._manipVectors.forward;
    const right = this._manipVectors.right;
    const up = this.camera.up;

    this.camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() === 0) return;
    forward.normalize();
    right.copy(forward).applyAxisAngle(up, Math.PI / 2);

    const sources = Array.from(session.inputSources || []);
    sources.forEach((source, index) => {
      const { gamepad } = source;
      if (!gamepad || !gamepad.axes?.length) return;
      const [ax0 = 0, ax1 = 0, ax2 = 0, ax3 = 0] = gamepad.axes;

      if (index === 0) {
        if (Math.abs(ax0) > DEADZONE) {
          this.selectedObject.position.addScaledVector(right, ax0 * TRANSLATION_SPEED * delta);
        }
        if (Math.abs(ax1) > DEADZONE) {
          this.selectedObject.position.addScaledVector(forward, -ax1 * TRANSLATION_SPEED * delta);
        }
      } else if (index === 1) {
        if (Math.abs(ax1) > DEADZONE) {
          this.selectedObject.position.addScaledVector(up, ax1 * VERTICAL_SPEED * delta);
        }
        if (Math.abs(ax2) > DEADZONE) {
          this.selectedObject.rotateOnAxis(up, ax2 * ROTATION_SPEED * delta);
        }
        if (Math.abs(ax3) > DEADZONE) {
          const scaleDelta = 1 + ax3 * SCALE_SPEED * delta;
          if (scaleDelta > 0) {
            this.selectedObject.scale.multiplyScalar(scaleDelta);
            const clamp = value => Math.min(Math.max(value, 0.05), 25);
            this.selectedObject.scale.set(
              clamp(this.selectedObject.scale.x),
              clamp(this.selectedObject.scale.y),
              clamp(this.selectedObject.scale.z)
            );
          }
        }
      }
    });
  }
}

export default SceneManager;
