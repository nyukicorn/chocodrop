import * as THREEModule from 'three';
const THREE = globalThis.THREE || THREEModule;

/**
 * XRController - WebXR コントローラー管理
 * コントローラーの入力、レイキャスティング、オブジェクト操作を処理
 */
export class XRController {
  constructor(renderer, scene, options = {}) {
    if (!renderer || !scene) {
      throw new Error('THREE.WebGLRenderer and THREE.Scene are required');
    }

    this.renderer = renderer;
    this.scene = scene;
    this.options = options;

    // コントローラー
    this.controllers = [];
    this.controllerGrips = [];
    this.controllerModels = [];

    // レイキャスティング
    this.raycaster = new THREE.Raycaster();
    this.tempMatrix = new THREE.Matrix4();
    this.intersectedObjects = new Map(); // controller index -> object

    // 選択されたオブジェクト
    this.selectedObjects = new Map(); // controller index -> object

    // インタラクション可能なオブジェクトのリスト
    this.interactableObjects = options.interactableObjects || [];

    // イベントリスナー
    this.listeners = {
      select: [],
      selectstart: [],
      selectend: [],
      squeeze: [],
      squeezestart: [],
      squeezeend: []
    };

    // コントローラーをセットアップ
    this.setupControllers();

    console.log('🎮 XRController initialized');
  }

  /**
   * コントローラーのセットアップ
   */
  setupControllers() {
    // 左右2つのコントローラー
    for (let i = 0; i < 2; i++) {
      this.setupController(i);
    }
  }

  /**
   * 個別のコントローラーをセットアップ
   */
  setupController(index) {
    // コントローラー（位置追跡 + 入力イベント）
    const controller = this.renderer.xr.getController(index);

    // イベントリスナー
    controller.addEventListener('selectstart', (event) => this.onSelectStart(event, index));
    controller.addEventListener('selectend', (event) => this.onSelectEnd(event, index));
    controller.addEventListener('select', (event) => this.onSelect(event, index));

    controller.addEventListener('squeezestart', (event) => this.onSqueezeStart(event, index));
    controller.addEventListener('squeezeend', (event) => this.onSqueezeEnd(event, index));
    controller.addEventListener('squeeze', (event) => this.onSqueeze(event, index));

    this.scene.add(controller);
    this.controllers[index] = controller;

    // コントローラーグリップ（視覚的なモデル表示用）
    const controllerGrip = this.renderer.xr.getControllerGrip(index);
    this.scene.add(controllerGrip);
    this.controllerGrips[index] = controllerGrip;

    // レイビジュアライゼーション（レーザーポインター）
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1)
    ]);

    const material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      linewidth: 2
    });

    const line = new THREE.Line(geometry, material);
    line.name = 'ray';
    line.scale.z = 5;

    controller.add(line);

    console.log(`🎮 Controller ${index} setup complete`);
  }

  /**
   * XRControllerModelFactory でコントローラーモデルを読み込み
   * （Three.js addons が必要）
   */
  async loadControllerModels(XRControllerModelFactory) {
    if (!XRControllerModelFactory) {
      console.warn('XRControllerModelFactory not provided');
      return;
    }

    const controllerModelFactory = new XRControllerModelFactory();

    for (let i = 0; i < this.controllerGrips.length; i++) {
      const grip = this.controllerGrips[i];
      const model = controllerModelFactory.createControllerModel(grip);
      grip.add(model);
      this.controllerModels[i] = model;
    }

    console.log('🎮 Controller models loaded');
  }

  /**
   * Select Start イベント（トリガー押下開始）
   */
  onSelectStart(event, index) {
    const controller = this.controllers[index];
    const intersections = this.getIntersections(controller);

    if (intersections.length > 0) {
      const intersection = intersections[0];
      const object = intersection.object;

      // オブジェクトを選択
      this.selectObject(index, object);

      // レイの色を変更
      const line = controller.getObjectByName('ray');
      if (line) {
        line.material.color.setHex(0x00ff00);
      }
    }

    // イベント発火
    this.emit('selectstart', { index, controller });
  }

  /**
   * Select End イベント（トリガー押下終了）
   */
  onSelectEnd(event, index) {
    const controller = this.controllers[index];

    // オブジェクトを解放
    this.releaseObject(index);

    // レイの色を元に戻す
    const line = controller.getObjectByName('ray');
    if (line) {
      line.material.color.setHex(0xffffff);
    }

    // イベント発火
    this.emit('selectend', { index, controller });
  }

  /**
   * Select イベント（トリガークリック）
   */
  onSelect(event, index) {
    const controller = this.controllers[index];

    // イベント発火
    this.emit('select', { index, controller });
  }

  /**
   * Squeeze Start イベント（グリップ押下開始）
   */
  onSqueezeStart(event, index) {
    this.emit('squeezestart', { index, controller: this.controllers[index] });
  }

  /**
   * Squeeze End イベント（グリップ押下終了）
   */
  onSqueezeEnd(event, index) {
    this.emit('squeezeend', { index, controller: this.controllers[index] });
  }

  /**
   * Squeeze イベント（グリッククリック）
   */
  onSqueeze(event, index) {
    this.emit('squeeze', { index, controller: this.controllers[index] });
  }

  /**
   * オブジェクトを選択
   */
  selectObject(controllerIndex, object) {
    const controller = this.controllers[controllerIndex];

    // オブジェクトをコントローラーにアタッチ
    this.tempMatrix.copy(controller.matrixWorld).invert();
    object.applyMatrix4(this.tempMatrix);
    controller.attach(object);

    this.selectedObjects.set(controllerIndex, object);

    console.log(`🎯 Object selected by controller ${controllerIndex}:`, object.name);
  }

  /**
   * オブジェクトを解放
   */
  releaseObject(controllerIndex) {
    const object = this.selectedObjects.get(controllerIndex);

    if (object) {
      // シーンに戻す
      this.scene.attach(object);
      this.selectedObjects.delete(controllerIndex);

      console.log(`🎯 Object released by controller ${controllerIndex}:`, object.name);
    }
  }

  /**
   * レイキャストでインタラクション可能なオブジェクトを取得
   */
  getIntersections(controller) {
    this.tempMatrix.identity().extractRotation(controller.matrixWorld);

    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);

    return this.raycaster.intersectObjects(this.interactableObjects, true);
  }

  /**
   * インタラクション可能なオブジェクトを設定
   */
  setInteractableObjects(objects) {
    this.interactableObjects = objects;
  }

  /**
   * インタラクション可能なオブジェクトを追加
   */
  addInteractableObject(object) {
    if (!this.interactableObjects.includes(object)) {
      this.interactableObjects.push(object);
    }
  }

  /**
   * インタラクション可能なオブジェクトを削除
   */
  removeInteractableObject(object) {
    const index = this.interactableObjects.indexOf(object);
    if (index !== -1) {
      this.interactableObjects.splice(index, 1);
    }
  }

  /**
   * アップデート（レイキャストのハイライト表示など）
   */
  update() {
    // 各コントローラーでレイキャスト
    this.controllers.forEach((controller, index) => {
      const intersections = this.getIntersections(controller);

      // 以前のハイライトをクリア
      const prevIntersected = this.intersectedObjects.get(index);
      if (prevIntersected && prevIntersected !== this.selectedObjects.get(index)) {
        this.clearHighlight(prevIntersected);
      }

      // 新しいオブジェクトをハイライト
      if (intersections.length > 0 && !this.selectedObjects.has(index)) {
        const object = intersections[0].object;
        this.highlightObject(object);
        this.intersectedObjects.set(index, object);
      } else {
        this.intersectedObjects.delete(index);
      }
    });
  }

  /**
   * オブジェクトをハイライト
   */
  highlightObject(object) {
    if (object.material && object.material.emissive) {
      object.currentHex = object.material.emissive.getHex();
      object.material.emissive.setHex(0x555555);
    }
  }

  /**
   * ハイライトをクリア
   */
  clearHighlight(object) {
    if (object.material && object.material.emissive && object.currentHex !== undefined) {
      object.material.emissive.setHex(object.currentHex);
      object.currentHex = undefined;
    }
  }

  /**
   * イベントリスナーを登録
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    } else {
      console.warn(`Unknown event: ${event}`);
    }
  }

  /**
   * イベントリスナーを削除
   */
  off(event, callback) {
    if (this.listeners[event]) {
      const index = this.listeners[event].indexOf(callback);
      if (index !== -1) {
        this.listeners[event].splice(index, 1);
      }
    }
  }

  /**
   * イベントを発火
   */
  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }

  /**
   * クリーンアップ
   */
  dispose() {
    // コントローラーをシーンから削除
    this.controllers.forEach(controller => {
      this.scene.remove(controller);
    });

    this.controllerGrips.forEach(grip => {
      this.scene.remove(grip);
    });

    this.controllers = [];
    this.controllerGrips = [];
    this.controllerModels = [];
    this.selectedObjects.clear();
    this.intersectedObjects.clear();

    this.listeners = {
      select: [],
      selectstart: [],
      selectend: [],
      squeeze: [],
      squeezestart: [],
      squeezeend: []
    };

    console.log('🗑️ XRController disposed');
  }
}

export default XRController;
