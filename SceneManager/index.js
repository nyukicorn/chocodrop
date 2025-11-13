import { loadThree, loadOrbitControls, loadGLTFLoader, loadDRACOLoader } from '../src/pwa/utils/three-deps.js';
import { XRBridgeLoader } from '../src/client/xr/XRBridgeLoader.js';

const DEFAULT_BACKGROUND = '#0f172a';
const TARGET_FPS = 72;
const TARGET_DELTA = 1000 / TARGET_FPS;
const DEADZONE = 0.15;
const TRANSLATION_SPEED = 1.5;
const VERTICAL_SPEED = 1.2;
const ROTATION_SPEED = Math.PI;
const SCALE_SPEED = 0.8;
const ASSET_BASE_SIZE = 3.5;
const VIDEO_BASE_SIZE = 4.5;
const DEFAULT_ASSET_DISTANCE_DESKTOP = 3.2;
const DEFAULT_ASSET_DISTANCE_XR = 5.5;
const XR_VERTICAL_BASE = 1.35;
const DRACO_DECODER_CDN = 'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/libs/draco/';
const DEFAULT_ASSET_LIMIT = 24;
const ASSET_WARNING_RATIO = 0.85;

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
      xrBridge: {},
      xrAutoResume: true,
      ...options
    };

    this.options.xrBridge = {
      ...this.options.xrBridge,
      autoResume: this.options.xrBridge?.autoResume ?? this.options.xrAutoResume,
      domOverlayRoot:
        this.options.xrBridge?.domOverlayRoot ?? (typeof document !== 'undefined' ? document.body : null),
      captureRAF: this.options.xrBridge?.captureRAF ?? false
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
    this.xrBridge = null;
    this.xrSupport = { vr: null, ar: null };
    this.xrState = 'idle';
    this.xrError = null;
    this.sceneRoot = null;
    this.assetRoot = null;
    this._textureLoader = null;
    this._gltfLoaderPromise = null;
    this._gltfLoader = null;
    this.assetLimit = this.options.assetLimit ?? DEFAULT_ASSET_LIMIT;
    this.assetHistory = [];
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

    const hasNavigatorXR = typeof navigator !== 'undefined' && navigator.xr;
    if (this.options.enableXR && hasNavigatorXR) {
      this.renderer.xr.enabled = true;
      this.renderer.xr.addEventListener?.('sessionend', this._handleXRSessionEnd);
      this.disposables.add(() => this.renderer.xr?.removeEventListener?.('sessionend', this._handleXRSessionEnd));
    }

    if (this.options.enableXR && hasNavigatorXR) {
      this._ensureXRBridge();
    }

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.options.background);
    this.dynamicRoot = new THREE.Group();
    this.dynamicRoot.name = 'SceneManagerDynamicRoot';
    this.scene.add(this.dynamicRoot);
    this.sceneRoot = new THREE.Group();
    this.sceneRoot.name = 'SceneContentRoot';
    this.assetRoot = new THREE.Group();
    this.assetRoot.name = 'SceneAssetRoot';
    this.dynamicRoot.add(this.sceneRoot);
    this.dynamicRoot.add(this.assetRoot);

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

  _handleXRSessionEnd = () => {
    if (this.xrBridge) {
      return;
    }
    this.xrSession = null;
    this.xrMode = null;
    this._updateXRState('idle');
    if (this.isRunning && this.renderer.setAnimationLoop) {
      this.renderer.setAnimationLoop(time => {
        if (!this.isRunning) return;
        this._tick(time);
      });
    }
    this.emit('xr:exit');
  };

  _ensureXRBridge() {
    if (!this.options.enableXR) {
      return null;
    }
    if (this.xrBridge) {
      return this.xrBridge;
    }
    if (typeof navigator === 'undefined' || !navigator.xr) {
      this._updateXRState('unsupported');
      return null;
    }

    const bridge = new XRBridgeLoader({
      renderer: this.renderer,
      autoResume: this.options.xrBridge.autoResume !== false,
      domOverlayRoot: this.options.xrBridge.domOverlayRoot,
      captureRAF: this.options.xrBridge.captureRAF
    });

    bridge.addEventListener('installed', () => {
      this._updateXRState('ready');
    });
    bridge.addEventListener('session:start', event => {
      this.xrSession = event.detail?.session || null;
      const mode = event.detail?.mode === 'immersive-ar' ? 'ar' : 'vr';
      this.xrMode = mode;
      this._setupXRControllers();
      this._updateXRState('active', { mode: event.detail?.mode });
      this.emit('xr:entered', { session: this.xrSession, mode: event.detail?.mode });
    });
    bridge.addEventListener('session:end', () => {
      this.xrSession = null;
      this.xrMode = null;
      this._updateXRState('idle');
      if (this.isRunning && this.renderer?.setAnimationLoop) {
        this.renderer.setAnimationLoop(time => {
          if (!this.isRunning) return;
          this._tick(time);
        });
      }
      this.emit('xr:exit');
    });
    bridge.addEventListener('session:error', event => {
      this.xrError = event.detail?.error || null;
      this._updateXRState('error', { mode: event.detail?.mode, error: this.xrError });
      this.emit('xr:error', { error: this.xrError, mode: event.detail?.mode });
    });
    bridge.addEventListener('loop:error', event => {
      this.xrError = event.detail?.error || null;
      this.emit('xr:error', { error: this.xrError });
    });
    bridge.addEventListener('support', event => {
      if (!event.detail) return;
      this.xrSupport[event.detail.mode] = event.detail.supported;
      this.emit('xr:support', event.detail);
    });
    bridge.addEventListener('support:error', event => {
      this.emit('xr:support-error', event.detail);
    });

    try {
      bridge.install();
      this.xrBridge = bridge;
      bridge.isSessionSupported('vr').then(supported => {
        this.xrSupport.vr = supported;
        this.emit('xr:support', { mode: 'vr', supported });
      }).catch(error => {
        this.emit('xr:support-error', { mode: 'vr', error });
      });
      bridge.isSessionSupported('ar').then(supported => {
        this.xrSupport.ar = supported;
        this.emit('xr:support', { mode: 'ar', supported });
      }).catch(error => {
        this.emit('xr:support-error', { mode: 'ar', error });
      });
    } catch (error) {
      this.xrError = error;
      this._updateXRState('error', { error });
      this.emit('xr:error', { error });
      return null;
    }

    return bridge;
  }

  _updateXRState(state, detail = {}) {
    this.xrState = state;
    if (state !== 'error') {
      this.xrError = null;
    }
    this.emit('xr:state', { state, ...detail });
  }

  async enterXR(mode = 'vr', options = {}) {
    const bridge = this._ensureXRBridge();
    if (!bridge || !this.renderer.xr?.enabled) {
      throw new Error('WebXR はサポートされていません');
    }
    if (mode === 'ar') {
      const supported = await bridge.isSessionSupported('ar');
      if (!supported) {
        throw new Error('AR セッションはこのデバイスでサポートされていません');
      }
    }

    const sessionType = mode === 'ar' ? 'immersive-ar' : 'immersive-vr';
    this._updateXRState('requesting', { mode: sessionType });
    this.emit('xr:request', { mode: sessionType });

    try {
      const session = await bridge.enter(mode, {
        fallbackLoop: (time, frame) => this._tick(time, frame),
        ...options,
        domOverlayRoot: options.domOverlayRoot || (typeof document !== 'undefined' ? document.body : null)
      });
      this.xrSession = session;
      this.xrMode = mode;
      return session;
    } catch (error) {
      this.xrError = error;
      this._updateXRState('error', { mode: sessionType, error });
      this.emit('xr:error', { error, mode: sessionType });
      throw error;
    }
  }

  async enterAR() {
    return this.enterXR('ar');
  }

  async isSessionSupported(mode = 'vr') {
    const bridge = this._ensureXRBridge();
    if (!bridge) return false;
    return bridge.isSessionSupported(mode);
  }

  async exitXR() {
    if (this.xrBridge) {
      await this.xrBridge.exit();
    } else if (this.xrSession) {
      await this.xrSession.end();
    }
    if (this.isRunning && this.renderer?.setAnimationLoop) {
      this.renderer.setAnimationLoop(time => {
        if (!this.isRunning) return;
        this._tick(time);
      });
    }
  }

  add(object3d) {
    const targetRoot = this.sceneRoot || this.dynamicRoot;
    targetRoot.add(object3d);
    this.emit('object:add', { object3d });
    this.setSelectedObject(object3d);
  }

  remove(object3d) {
    if (!object3d) return;
    const wasAsset = this._isAssetNode(object3d);
    if (this.sceneRoot?.children?.includes(object3d) || object3d.parent === this.sceneRoot) {
      this.sceneRoot.remove(object3d);
    } else if (this.assetRoot?.children?.includes(object3d) || object3d.parent === this.assetRoot) {
      this.assetRoot.remove(object3d);
    } else {
      this.dynamicRoot.remove(object3d);
    }
    if (wasAsset) {
      this._dropFromHistory(object3d);
    }
    this.emit('object:remove', { object3d });
    if (this.selectedObject === object3d) {
      this.setSelectedObject(null);
    }
    if (wasAsset) {
      this.emit('asset:removed', { object: object3d, id: object3d?.userData?.asset?.id });
      this._emitAssetCount();
    }
  }

  clear(options = {}) {
    const { preserveAssets = false } = options;
    this._clearGroup(this.sceneRoot ?? this.dynamicRoot);
    if (!preserveAssets) {
      this._clearGroup(this.assetRoot);
      this.assetHistory = [];
    }
    this.emit('scene:cleared', { preserveAssets });
    this.setSelectedObject(null);
    this._emitAssetCount();
  }

  clearAssets() {
    this._clearGroup(this.assetRoot);
    this.assetHistory = [];
    this.emit('assets:cleared', { reason: 'manual' });
    this._emitAssetCount();
  }

  async spawnAssetFromPayload(payload = {}) {
    if (!payload?.kind) {
      console.warn('spawnAssetFromPayload: kind is required');
      return null;
    }
    const position = this._resolveAssetPosition(payload.position);
    if (payload.id) {
      const existing = this._findAssetById(payload.id);
      if (existing) {
        return existing;
      }
    }
    try {
      switch (payload.kind) {
        case 'image':
          return await this._spawnImageAsset(payload, position);
        case 'video':
          return await this._spawnVideoAsset(payload, position);
        case 'model':
          return await this._spawnModelAsset(payload, position);
        default:
          console.warn('spawnAssetFromPayload: unsupported kind', payload.kind);
          return null;
      }
    } catch (error) {
      console.error('spawnAssetFromPayload failed', error);
      this.emit('asset:error', { error, payload });
      throw error;
    }
  }

  listAssets() {
    if (!this.assetRoot) return [];
    return this.assetRoot.children
      .filter(child => child.userData?.asset)
      .map(child => ({
        ...child.userData.asset,
        object3d: child
      }));
  }

  removeAssetById(assetId) {
    const target = this._findAssetById(assetId);
    if (!target) return false;
    this.remove(target);
    return true;
  }

  async importJSON(json) {
    const { ObjectLoader } = this.THREE;
    const loader = new ObjectLoader();
    const object = loader.parse(json);
    if (object && object.name === 'SceneManagerDynamicRoot') {
      const sceneChild = object.children.find(child => child.name === 'SceneContentRoot') || null;
      const assetChild = object.children.find(child => child.name === 'SceneAssetRoot') || null;

      this._clearGroup(this.sceneRoot ?? this.dynamicRoot);
      const sceneSources = sceneChild ? sceneChild.children : object.children.filter(child => child !== assetChild);
      sceneSources.forEach(child => this.sceneRoot.add(child));

      if (assetChild) {
        this._clearGroup(this.assetRoot);
        assetChild.children.forEach(child => this.assetRoot.add(child));
        this.assetHistory = [...this.assetRoot.children];
        this._emitAssetCount();
      } else {
        this.assetHistory = [];
        this._emitAssetCount();
      }

      this.emit('import:json', { object: this.sceneRoot });
      if (this.sceneRoot.children[0]) {
        this.setSelectedObject(this.sceneRoot.children[0]);
      }
      return this.sceneRoot;
    }
    (this.sceneRoot ?? this.dynamicRoot).add(object);
    this.emit('import:json', { object });
    this.setSelectedObject(object);
    return object;
  }

  async _spawnImageAsset(payload, position) {
    const loader = this._ensureTextureLoader();
    const source = this._resolveAssetSource(payload, 'image');
    const texture = await loader.loadAsync(source.url);
    if (source.revokeAfterLoad) {
      URL.revokeObjectURL(source.url);
    }
    texture.colorSpace = this.THREE.SRGBColorSpace;
    const width = texture.image?.naturalWidth || texture.image?.width || 1;
    const height = texture.image?.naturalHeight || texture.image?.height || 1;
    const aspect = width && height ? width / height : 1;
    const geometry = this._createPlaneGeometry(aspect, ASSET_BASE_SIZE);
    const material = new this.THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: this.THREE.DoubleSide,
      toneMapped: false
    });
    material.alphaTest = 0.01;
    const plane = new this.THREE.Mesh(geometry, material);
    plane.position.copy(position);
    this._faceObjectToCamera(plane);
    plane.renderOrder = 1000;
    const metadata = this._buildAssetMetadata(payload, { texture });
    if (payload.preserveObjectUrl === false && metadata.objectURL) {
      URL.revokeObjectURL(metadata.objectURL);
      metadata.objectURL = null;
    }
    plane.userData.asset = metadata;
    const assetTarget = this.assetRoot || this.dynamicRoot;
    assetTarget.add(plane);
    this.setSelectedObject(plane);
    this.emit('asset:added', { object: plane, payload });
    this._registerAsset(plane);
    return plane;
  }

  async _spawnVideoAsset(payload, position) {
    const source = this._resolveAssetSource(payload, 'video');
    const objectUrl = source.url;
    const video = document.createElement('video');
    video.src = objectUrl;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.preload = 'auto';

    await new Promise((resolve, reject) => {
      const handleLoaded = () => resolve();
      const handleError = event => reject(event?.error || new Error('video metadata load failed'));
      video.addEventListener('loadedmetadata', handleLoaded, { once: true });
      video.addEventListener('error', handleError, { once: true });
      video.load();
    });

    try {
      await video.play();
    } catch (error) {
      console.warn('Video autoplay prevented, will require user gesture', error);
    }

    const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 1;
    const geometry = this._createPlaneGeometry(aspect, VIDEO_BASE_SIZE);
    const videoTexture = new this.THREE.VideoTexture(video);
    videoTexture.colorSpace = this.THREE.SRGBColorSpace;
    videoTexture.minFilter = this.THREE.LinearFilter;
    videoTexture.magFilter = this.THREE.LinearFilter;
    videoTexture.generateMipmaps = false;
    const material = new this.THREE.MeshBasicMaterial({
      map: videoTexture,
      transparent: true,
      side: this.THREE.DoubleSide,
      toneMapped: false
    });
    material.alphaTest = 0.01;
    const plane = new this.THREE.Mesh(geometry, material);
    plane.position.copy(position);
    this._faceObjectToCamera(plane);
    plane.renderOrder = 1001;
    const metadata = this._buildAssetMetadata(payload, {
      videoElement: video,
      videoTexture,
      objectURL: objectUrl,
      pixelWidth: video.videoWidth,
      pixelHeight: video.videoHeight
    });
    plane.userData.asset = metadata;
    const assetTarget = this.assetRoot || this.dynamicRoot;
    assetTarget.add(plane);
    this.setSelectedObject(plane);
    this.emit('asset:added', { object: plane, payload });
    this._registerAsset(plane);
    return plane;
  }

  async _spawnModelAsset(payload, position) {
    const loader = await this._ensureGLTFLoader();
    const arrayBuffer = await this._getArrayBufferFromPayload(payload);
    const gltf = await loader.parseAsync(arrayBuffer, '');
    const object = gltf.scene || new this.THREE.Group();
    object.position.copy(position);
    this._autoScaleObject(object, payload.desiredSize ?? 1.8);
    object.traverse(node => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    const metadata = this._buildAssetMetadata(payload, { format: 'gltf', animations: gltf.animations?.length });
    if (payload.preserveObjectUrl === false && metadata.objectURL) {
      URL.revokeObjectURL(metadata.objectURL);
      metadata.objectURL = null;
    }
    object.userData.asset = metadata;
    const assetTarget = this.assetRoot || this.dynamicRoot;
    assetTarget.add(object);
    this.setSelectedObject(object);
    this.emit('asset:added', { object, payload });
    this._registerAsset(object);
    return object;
  }

  dispose() {
    this.stop();
    this.xrBridge?.dispose?.();
    this.xrBridge = null;
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

  focusOnObject(object, options = {}) {
    if (!object || !this.camera || !this.controls) return;
    if (this.renderer?.xr?.isPresenting) return;
    const { distance = 5, verticalOffset = 0 } = options;
    const targetPosition = object.position.clone();
    targetPosition.y += verticalOffset;
    const direction = new this.THREE.Vector3();
    direction.subVectors(this.camera.position, targetPosition);
    if (direction.lengthSq() === 0) {
      this.camera.getWorldDirection(direction);
      direction.multiplyScalar(-1);
    }
    direction.normalize().multiplyScalar(distance);
    const newPosition = targetPosition.clone().add(direction);
    this.camera.position.copy(newPosition);
    this.controls.target.copy(targetPosition);
    this.controls.update?.();
  }

  exportSceneJSON(options = {}) {
    const { includeAssets = false } = options;
    if (!this.assetRoot || includeAssets) {
      return this.dynamicRoot.toJSON();
    }
    this.dynamicRoot.remove(this.assetRoot);
    let json = null;
    try {
      json = this.dynamicRoot.toJSON();
    } finally {
      this.dynamicRoot.add(this.assetRoot);
    }
    return json;
  }

  _setupXRControllers() {
    if (!this.renderer?.xr || !this.THREE) return;
    if (!this._manipVectors.forward) {
      this._manipVectors.forward = new this.THREE.Vector3();
      this._manipVectors.right = new this.THREE.Vector3();
    }
  }

  _updateXRManipulation(deltaMs) {
    if (!this.xrSession || !this.selectedObject || !this.renderer?.xr || !this.THREE) return;
    if (!this._manipVectors.forward) {
      this._setupXRControllers();
    }
    const session = this.renderer.xr.getSession();
    if (!session) return;
    const delta = deltaMs / 1000;
    const inputSources = Array.from(session.inputSources || []).filter(source => source.gamepad);
    if (!inputSources.length) return;

    let leftSource = inputSources.find(source => source.handedness === 'left');
    let rightSource = inputSources.find(source => source.handedness === 'right');
    if (!leftSource) {
      leftSource = inputSources[0];
    }
    if (!rightSource) {
      rightSource = inputSources[inputSources.length - 1];
    }

    const up = this.camera.up.clone().normalize();
    const planarForward = this._manipVectors.forward;
    const planarRight = this._manipVectors.right;
    this.camera.getWorldDirection(planarForward);
    const depthForward = planarForward.clone().normalize();
    planarForward.y = 0;
    if (planarForward.lengthSq() === 0) {
      planarForward.set(0, 0, -1);
    }
    planarForward.normalize();
    planarRight.copy(planarForward).applyAxisAngle(up, Math.PI / 2).normalize();

    const leftAxes = this._getThumbstickAxes(leftSource);
    if (Math.abs(leftAxes.x) > DEADZONE) {
      this.selectedObject.position.addScaledVector(planarRight, leftAxes.x * TRANSLATION_SPEED * delta);
    }
    if (Math.abs(leftAxes.y) > DEADZONE) {
      this.selectedObject.position.addScaledVector(planarForward, -leftAxes.y * TRANSLATION_SPEED * delta);
    }

    const rightAxes = this._getThumbstickAxes(rightSource);
    if (Math.abs(rightAxes.x) > DEADZONE) {
      this.selectedObject.rotateOnAxis(up, rightAxes.x * ROTATION_SPEED * delta);
    }

    if (Math.abs(rightAxes.y) > DEADZONE) {
      const buttons = (rightSource?.gamepad?.buttons ?? []);
      const triggerValue = Math.max(buttons[0]?.value ?? 0, buttons[0]?.pressed ? 1 : 0);
      const gripValue = Math.max(buttons[1]?.value ?? 0, buttons[1]?.pressed ? 1 : 0);
      if (gripValue > 0.25) {
        const scaleDelta = 1 - rightAxes.y * SCALE_SPEED * delta;
        if (scaleDelta > 0) {
          this.selectedObject.scale.multiplyScalar(scaleDelta);
          const clamp = value => Math.min(Math.max(value, 0.05), 25);
          this.selectedObject.scale.set(
            clamp(this.selectedObject.scale.x),
            clamp(this.selectedObject.scale.y),
            clamp(this.selectedObject.scale.z)
          );
        }
      } else if (triggerValue > 0.25) {
        this.selectedObject.position.addScaledVector(up, rightAxes.y * VERTICAL_SPEED * delta);
      } else {
        this.selectedObject.position.addScaledVector(depthForward, -rightAxes.y * TRANSLATION_SPEED * delta);
      }
    }
  }

  _getThumbstickAxes(source) {
    if (!source?.gamepad?.axes?.length) {
      return { x: 0, y: 0 };
    }
    const axes = source.gamepad.axes;
    if (axes.length >= 4) {
      return { x: axes[2], y: axes[3] };
    }
    return { x: axes[0], y: axes[1] };
  }

  _isAssetNode(object) {
    return !!object?.userData?.asset;
  }

  _registerAsset(object) {
    if (!this.assetRoot || !object) return;
    if (!this.assetHistory.includes(object)) {
      this.assetHistory.push(object);
    }
    this._emitAssetCount();
    this._enforceAssetLimit();
  }

  _dropFromHistory(object) {
    const idx = this.assetHistory.indexOf(object);
    if (idx >= 0) {
      this.assetHistory.splice(idx, 1);
    }
  }

  _emitAssetCount() {
    const count = this.assetRoot?.children?.length || 0;
    this.emit('asset:count', { count, limit: this.assetLimit, warnThreshold: Math.floor(this.assetLimit * ASSET_WARNING_RATIO) });
  }

  _enforceAssetLimit() {
    if (!this.assetRoot) return;
    while (this.assetRoot.children.length > this.assetLimit && this.assetHistory.length) {
      const oldest = this.assetHistory.shift();
      if (oldest) {
        this.remove(oldest);
        this.emit('asset:auto-removed', { object: oldest, limit: this.assetLimit });
      }
    }
  }

  _clearGroup(group) {
    if (!group) return;
    [...group.children].forEach(child => {
      group.remove(child);
      const wasAsset = this._isAssetNode(child);
      this._disposeObject(child);
      if (wasAsset) {
        this._dropFromHistory(child);
      }
    });
  }

  _disposeObject(object) {
    if (!object) return;
    object.traverse?.(node => {
      if (node.material) {
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach(mat => mat.dispose?.());
      }
      node.geometry?.dispose?.();
      node.userData?.asset?.videoTexture?.dispose?.();
      node.userData?.asset?.texture?.dispose?.();
      if (node.userData?.asset?.objectURL) {
        URL.revokeObjectURL(node.userData.asset.objectURL);
      }
      if (node.userData?.asset?.videoElement) {
        node.userData.asset.videoElement.pause?.();
        node.userData.asset.videoElement.src = '';
      }
    });
  }

  _buildAssetMetadata(payload, extra = {}, options = {}) {
    const id = payload.id || `asset_${Date.now()}`;
    const persistObjectUrl = options.persistObjectUrl ?? (payload.preserveObjectUrl ?? (payload.kind === 'video'));
    const storedObjectUrl = persistObjectUrl ? (payload.objectUrl || extra.objectURL || null) : null;
    return {
      id,
      kind: payload.kind,
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      size: payload.size,
      source: payload.source || 'remote-upload',
      createdAt: payload.createdAt || Date.now(),
      objectURL: storedObjectUrl,
      ...extra
    };
  }

  _findAssetById(assetId) {
    if (!assetId || !this.assetRoot) return null;
    return this.assetRoot.children.find(child => child.userData?.asset?.id === assetId) || null;
  }

  _ensureTextureLoader() {
    if (!this.THREE) {
      throw new Error('TextureLoader requires THREE to be ready');
    }
    if (!this._textureLoader) {
      this._textureLoader = new this.THREE.TextureLoader();
    }
    return this._textureLoader;
  }

  async _ensureGLTFLoader() {
    if (this._gltfLoader) {
      return this._gltfLoader;
    }
    if (!this._gltfLoaderPromise) {
      this._gltfLoaderPromise = (async () => {
        const GLTFLoader = await loadGLTFLoader();
        const loader = new GLTFLoader();
        try {
          const DRACOLoader = await loadDRACOLoader();
          const draco = new DRACOLoader();
          draco.setDecoderPath(DRACO_DECODER_CDN);
          loader.setDRACOLoader(draco);
        } catch (error) {
          console.warn('DRACO loader unavailable, continuing without compression support', error);
        }
        return loader;
      })();
    }
    this._gltfLoader = await this._gltfLoaderPromise;
    return this._gltfLoader;
  }

  _createPlaneGeometry(aspectRatio, baseSize) {
    const width = aspectRatio >= 1 ? baseSize : baseSize * aspectRatio;
    const height = aspectRatio >= 1 ? baseSize / aspectRatio : baseSize;
    return new this.THREE.PlaneGeometry(width, height);
  }

  _resolveAssetSource(payload, kind) {
    if (payload.dataUrl) {
      return { url: payload.dataUrl, revokeAfterLoad: false };
    }
    if (payload.objectUrl) {
      const revokeAfterLoad = payload.preserveObjectUrl === false && kind !== 'video';
      return { url: payload.objectUrl, revokeAfterLoad };
    }
    if (payload.blob) {
      const url = URL.createObjectURL(payload.blob);
      const revokeAfterLoad = !(payload.preserveObjectUrl ?? (kind === 'video'));
      return { url, revokeAfterLoad };
    }
    throw new Error('Asset payload missing data source');
  }

  async _getArrayBufferFromPayload(payload) {
    if (payload.dataUrl) {
      return this._dataUrlToArrayBuffer(payload.dataUrl);
    }
    if (payload.objectUrl) {
      const response = await fetch(payload.objectUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch object URL');
      }
      return response.arrayBuffer();
    }
    if (payload.blob) {
      return payload.blob.arrayBuffer();
    }
    throw new Error('Model payload missing binary data');
  }

  _resolveAssetPosition(position) {
    if (position && ['x', 'y', 'z'].every(key => typeof position[key] === 'number')) {
      return new this.THREE.Vector3(position.x, position.y, position.z);
    }

    if (this.xrSession) {
      const base = this._getXRSpawnOrigin();
      const forward = new this.THREE.Vector3(0, 0, -1);
      if (this.camera) {
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        if (forward.lengthSq() === 0) {
          forward.set(0, 0, -1);
        }
      }
      forward.normalize().multiplyScalar(DEFAULT_ASSET_DISTANCE_XR);
      const spawn = base.addScaledVector(forward, -1);
      spawn.y = XR_VERTICAL_BASE;
      return spawn;
    }

    const fallback = new this.THREE.Vector3(0, 1.5, -DEFAULT_ASSET_DISTANCE_DESKTOP);
    if (!this.camera) return fallback;
    const result = this.camera.position.clone();
    const forward = new this.THREE.Vector3();
    this.camera.getWorldDirection(forward);
    if (forward.lengthSq() === 0) {
      forward.set(0, 0, -1);
    }
    forward.normalize().multiplyScalar(DEFAULT_ASSET_DISTANCE_DESKTOP);
    result.add(forward);
    return result;
  }

  _getXRSpawnOrigin() {
    const anchorPos = this.xr?.anchor?.position;
    if (anchorPos?.isVector3) {
      return anchorPos.clone();
    }
    if (anchorPos) {
      return new this.THREE.Vector3(anchorPos.x ?? 0, anchorPos.y ?? XR_VERTICAL_BASE, anchorPos.z ?? -DEFAULT_ASSET_DISTANCE_XR);
    }
    if (this.controls?.target) {
      return this.controls.target.clone();
    }
    return new this.THREE.Vector3(0, XR_VERTICAL_BASE, -DEFAULT_ASSET_DISTANCE_XR);
  }

  _faceObjectToCamera(object) {
    if (!this.camera || !object?.lookAt) return;
    const target = this.camera.position.clone();
    target.y = object.position.y;
    object.lookAt(target);
  }

  _autoScaleObject(object, targetSize) {
    if (!this.THREE || !object) return;
    const box = new this.THREE.Box3().setFromObject(object);
    const size = box.getSize(new this.THREE.Vector3());
    const maxAxis = Math.max(size.x, size.y, size.z);
    if (!isFinite(maxAxis) || maxAxis <= 0) return;
    const desiredSize = typeof targetSize === 'number' ? targetSize : 1.5;
    const scale = desiredSize / maxAxis;
    if (scale > 0 && isFinite(scale)) {
      object.scale.multiplyScalar(scale);
    }
  }

  async _dataUrlToArrayBuffer(dataUrl) {
    const blob = await this._dataUrlToBlob(dataUrl);
    return blob.arrayBuffer();
  }

  async _dataUrlToObjectUrl(dataUrl, mimeType) {
    const blob = await this._dataUrlToBlob(dataUrl);
    const typedBlob = mimeType ? blob.slice(0, blob.size, mimeType) : blob;
    return URL.createObjectURL(typedBlob);
  }

  async _dataUrlToBlob(dataUrl) {
    const response = await fetch(dataUrl);
    if (!response.ok) {
      throw new Error('Failed to decode data URL');
    }
    return response.blob();
  }
}

export default SceneManager;
