// UMDビルド対応: グローバルのTHREEを優先し、なければES moduleのimportを使用
import * as THREEModule from 'three';
const THREE = globalThis.THREE || THREEModule;

/**
 * VRController - VRコントローラー入力処理
 * コントローラーのレイキャスティング、オブジェクト選択、移動を管理
 */
export class VRController {
  constructor(renderer, scene, options = {}) {
    if (!renderer || !scene) {
      throw new Error('THREE.WebGLRenderer and THREE.Scene are required');
    }

    this.renderer = renderer;
    this.scene = scene;
    this.camera = options.camera || null;

    // コントローラー
    this.controller1 = null;
    this.controller2 = null;
    this.controllerGrip1 = null;
    this.controllerGrip2 = null;

    // レイキャスト用
    this.raycaster = new THREE.Raycaster();
    this.tempMatrix = new THREE.Matrix4();

    // 選択状態
    this.selectedObjects = new Map(); // controller -> object
    this.selectableObjects = options.selectableObjects || [];

    // イベントリスナー
    this.selectStartListeners = [];
    this.selectEndListeners = [];
    this.squeezeListeners = [];

    // 設定
    this.config = {
      lineLength: options.lineLength || 5,
      lineColor: options.lineColor || 0xffffff,
      enableHaptics: options.enableHaptics !== false,
      ...options.config
    };

    console.log('🎮 VRController initialized');
  }

  /**
   * コントローラーのセットアップ
   */
  setup() {
    // コントローラー1
    this.controller1 = this.renderer.xr.getController(0);
    this.controller1.addEventListener('selectstart', (e) => this.onSelectStart(e));
    this.controller1.addEventListener('selectend', (e) => this.onSelectEnd(e));
    this.controller1.addEventListener('squeezestart', (e) => this.onSqueezeStart(e));
    this.controller1.addEventListener('squeezeend', (e) => this.onSqueezeEnd(e));
    this.scene.add(this.controller1);

    // コントローラー2
    this.controller2 = this.renderer.xr.getController(1);
    this.controller2.addEventListener('selectstart', (e) => this.onSelectStart(e));
    this.controller2.addEventListener('selectend', (e) => this.onSelectEnd(e));
    this.controller2.addEventListener('squeezestart', (e) => this.onSqueezeStart(e));
    this.controller2.addEventListener('squeezeend', (e) => this.onSqueezeEnd(e));
    this.scene.add(this.controller2);

    // レイキャスト視覚化（白い線）
    this.addControllerLine(this.controller1);
    this.addControllerLine(this.controller2);

    // コントローラーグリップ（コントローラーモデル表示用）
    this.controllerGrip1 = this.renderer.xr.getControllerGrip(0);
    this.scene.add(this.controllerGrip1);

    this.controllerGrip2 = this.renderer.xr.getControllerGrip(1);
    this.scene.add(this.controllerGrip2);

    console.log('🎮 VR Controllers setup complete');
  }

  /**
   * コントローラーモデルを追加
   * Three.js addons が必要なため、外部から XRControllerModelFactory を渡す
   * @param {XRControllerModelFactory} controllerModelFactory
   */
  addControllerModels(controllerModelFactory) {
    if (!controllerModelFactory) {
      console.warn('⚠️ XRControllerModelFactory not provided, controller models will not be displayed');
      return;
    }

    const model1 = controllerModelFactory.createControllerModel(this.controllerGrip1);
    this.controllerGrip1.add(model1);

    const model2 = controllerModelFactory.createControllerModel(this.controllerGrip2);
    this.controllerGrip2.add(model2);

    console.log('✅ VR Controller models added');
  }

  /**
   * コントローラーにレイキャスト視覚化線を追加
   * @param {THREE.XRTargetRaySpace} controller
   */
  addControllerLine(controller) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1)
    ]);

    const line = new THREE.Line(geometry);
    line.name = 'line';
    line.scale.z = this.config.lineLength;

    const material = new THREE.LineBasicMaterial({
      color: this.config.lineColor
    });
    line.material = material;

    controller.add(line);
  }

  /**
   * トリガー押下開始
   * @param {XRInputSourceEvent} event
   */
  onSelectStart(event) {
    const controller = event.target;
    const intersections = this.getIntersections(controller);

    if (intersections.length > 0) {
      const intersection = intersections[0];
      const object = intersection.object;

      // オブジェクトを選択
      this.selectedObjects.set(controller, object);
      controller.userData.selected = object;

      // ビジュアルフィードバック
      if (object.material) {
        object.userData.originalEmissive = object.material.emissive?.getHex() || 0x000000;
        object.userData.originalEmissiveIntensity = object.material.emissiveIntensity || 0;

        if (object.material.emissive) {
          object.material.emissive.setHex(0xffffff);
        }
        if (object.material.emissiveIntensity !== undefined) {
          object.material.emissiveIntensity = 0.5;
        }
      }

      // オブジェクトをコントローラーに親子付け
      controller.attach(object);

      // ハプティクスフィードバック
      this.triggerHaptic(controller, 0.5, 100);

      // イベント通知
      this.notifySelectStart(controller, object, intersection);

      console.log('🎯 Object selected:', object.name || object.type);
    }
  }

  /**
   * トリガー押下終了
   * @param {XRInputSourceEvent} event
   */
  onSelectEnd(event) {
    const controller = event.target;
    const object = controller.userData.selected;

    if (object) {
      // ビジュアルフィードバックをリセット
      if (object.material) {
        if (object.userData.originalEmissive !== undefined && object.material.emissive) {
          object.material.emissive.setHex(object.userData.originalEmissive);
        }
        if (object.userData.originalEmissiveIntensity !== undefined) {
          object.material.emissiveIntensity = object.userData.originalEmissiveIntensity;
        }
      }

      // オブジェクトをシーンに戻す
      this.scene.attach(object);

      // 選択解除
      this.selectedObjects.delete(controller);
      delete controller.userData.selected;

      // イベント通知
      this.notifySelectEnd(controller, object);

      console.log('📍 Object placed:', object.name || object.type);
    }
  }

  /**
   * グリップ押下開始
   * @param {XRInputSourceEvent} event
   */
  onSqueezeStart(event) {
    const controller = event.target;
    const intersections = this.getIntersections(controller);

    if (intersections.length > 0) {
      const intersection = intersections[0];
      const object = intersection.object;

      // ハプティクスフィードバック
      this.triggerHaptic(controller, 0.8, 200);

      // イベント通知
      this.notifySqueeze(controller, object, intersection, 'start');

      console.log('✊ Squeeze start:', object.name || object.type);
    }
  }

  /**
   * グリップ押下終了
   * @param {XRInputSourceEvent} event
   */
  onSqueezeEnd(event) {
    const controller = event.target;
    const object = controller.userData.squeezed;

    if (object) {
      delete controller.userData.squeezed;

      // イベント通知
      this.notifySqueeze(controller, object, null, 'end');

      console.log('👐 Squeeze end:', object.name || object.type);
    }
  }

  /**
   * コントローラーからのレイキャスティング
   * @param {THREE.XRTargetRaySpace} controller
   * @returns {Array<Intersection>}
   */
  getIntersections(controller) {
    this.tempMatrix.identity().extractRotation(controller.matrixWorld);

    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);

    return this.raycaster.intersectObjects(this.selectableObjects, false);
  }

  /**
   * ハプティクスフィードバック
   * @param {THREE.XRTargetRaySpace} controller
   * @param {number} intensity - 0.0-1.0
   * @param {number} duration - ミリ秒
   */
  triggerHaptic(controller, intensity = 1.0, duration = 100) {
    if (!this.config.enableHaptics) return;

    const session = this.renderer.xr.getSession();
    if (!session) return;

    const inputSource = session.inputSources.find(source => {
      return source.hand === null; // コントローラー入力のみ
    });

    if (inputSource && inputSource.gamepad && inputSource.gamepad.hapticActuators) {
      const actuator = inputSource.gamepad.hapticActuators[0];
      if (actuator) {
        actuator.pulse(intensity, duration);
      }
    }
  }

  /**
   * 選択可能オブジェクトを設定
   * @param {Array<THREE.Object3D>} objects
   */
  setSelectableObjects(objects) {
    this.selectableObjects = objects;
  }

  /**
   * 選択可能オブジェクトを追加
   * @param {THREE.Object3D} object
   */
  addSelectableObject(object) {
    if (!this.selectableObjects.includes(object)) {
      this.selectableObjects.push(object);
    }
  }

  /**
   * 選択可能オブジェクトを削除
   * @param {THREE.Object3D} object
   */
  removeSelectableObject(object) {
    const index = this.selectableObjects.indexOf(object);
    if (index !== -1) {
      this.selectableObjects.splice(index, 1);
    }
  }

  /**
   * コントローラーを取得
   * @returns {Object}
   */
  getControllers() {
    return {
      controller1: this.controller1,
      controller2: this.controller2,
      controllerGrip1: this.controllerGrip1,
      controllerGrip2: this.controllerGrip2
    };
  }

  /**
   * クリーンアップ
   */
  dispose() {
    if (this.controller1) {
      this.scene.remove(this.controller1);
    }
    if (this.controller2) {
      this.scene.remove(this.controller2);
    }
    if (this.controllerGrip1) {
      this.scene.remove(this.controllerGrip1);
    }
    if (this.controllerGrip2) {
      this.scene.remove(this.controllerGrip2);
    }

    this.selectedObjects.clear();
    this.selectStartListeners = [];
    this.selectEndListeners = [];
    this.squeezeListeners = [];

    console.log('🗑️ VRController disposed');
  }

  // イベントリスナー管理
  onSelectStart(listener) {
    this.selectStartListeners.push(listener);
  }

  onSelectEnd(listener) {
    this.selectEndListeners.push(listener);
  }

  onSqueeze(listener) {
    this.squeezeListeners.push(listener);
  }

  notifySelectStart(controller, object, intersection) {
    this.selectStartListeners.forEach(listener => {
      try {
        listener(controller, object, intersection);
      } catch (error) {
        console.error('❌ Error in select start listener:', error);
      }
    });
  }

  notifySelectEnd(controller, object) {
    this.selectEndListeners.forEach(listener => {
      try {
        listener(controller, object);
      } catch (error) {
        console.error('❌ Error in select end listener:', error);
      }
    });
  }

  notifySqueeze(controller, object, intersection, type) {
    this.squeezeListeners.forEach(listener => {
      try {
        listener(controller, object, intersection, type);
      } catch (error) {
        console.error('❌ Error in squeeze listener:', error);
      }
    });
  }
}
