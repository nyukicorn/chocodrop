import * as THREEModule from 'three';
const THREE = globalThis.THREE || THREEModule;

/**
 * XRGestureController - WebXR ジェスチャーベースのオブジェクト操作
 * ピンチでスケール、グラブで回転・移動、両手でマルチタッチ操作
 */
export class XRGestureController {
  constructor(xrHands, scene, camera, options = {}) {
    if (!xrHands || !scene || !camera) {
      throw new Error('XRHands, THREE.Scene, and THREE.Camera are required');
    }

    this.xrHands = xrHands;
    this.scene = scene;
    this.camera = camera;
    this.options = options;

    // 操作対象
    this.selectedObject = null;
    this.selectableObjects = []; // レイヤーまたは配列で管理

    // ジェスチャー状態
    this.gestureState = {
      left: {
        pinching: false,
        grabbing: false,
        pointing: false,
        position: new THREE.Vector3(),
        lastPosition: new THREE.Vector3()
      },
      right: {
        pinching: false,
        grabbing: false,
        pointing: false,
        position: new THREE.Vector3(),
        lastPosition: new THREE.Vector3()
      }
    };

    // ピンチ操作の初期状態
    this.pinchState = {
      active: false,
      hand: null,
      startDistance: 0,
      startScale: new THREE.Vector3(),
      object: null
    };

    // グラブ操作の初期状態
    this.grabState = {
      active: false,
      hand: null,
      startPosition: new THREE.Vector3(),
      startRotation: new THREE.Quaternion(),
      offset: new THREE.Vector3(),
      object: null
    };

    // 両手操作の状態
    this.twoHandState = {
      active: false,
      startDistance: 0,
      startScale: new THREE.Vector3(),
      startRotation: new THREE.Quaternion(),
      midpoint: new THREE.Vector3(),
      object: null
    };

    // レイキャスト設定
    this.raycaster = new THREE.Raycaster();
    this.raycaster.layers.enable(0); // デフォルトレイヤー

    // 視覚的フィードバック
    this.selectionHighlight = this.createSelectionHighlight();
    this.scene.add(this.selectionHighlight);

    // イベントリスナー
    this.listeners = {
      objectselected: [],
      objectdeselected: [],
      objectmoved: [],
      objectscaled: [],
      objectrotated: []
    };

    // ジェスチャーイベントをリスン
    this.setupGestureListeners();

    console.log('🎮 XRGestureController initialized');
  }

  /**
   * ジェスチャーイベントのセットアップ
   */
  setupGestureListeners() {
    // ピンチ
    this.xrHands.on('pinchstart', (data) => this.onPinchStart(data));
    this.xrHands.on('pinch', (data) => this.onPinch(data));
    this.xrHands.on('pinchend', (data) => this.onPinchEnd(data));

    // グラブ
    this.xrHands.on('grabstart', (data) => this.onGrabStart(data));
    this.xrHands.on('grab', (data) => this.onGrab(data));
    this.xrHands.on('grabend', (data) => this.onGrabEnd(data));

    // ポイント
    this.xrHands.on('pointstart', (data) => this.onPointStart(data));
    this.xrHands.on('pointend', (data) => this.onPointEnd(data));
  }

  /**
   * 毎フレーム更新
   */
  update() {
    // 両手の位置を更新
    ['left', 'right'].forEach((handKey, handIndex) => {
      const hand = this.xrHands.hands[handIndex];
      if (hand && hand.joints['index-finger-tip']) {
        const tipPosition = hand.joints['index-finger-tip'].position;
        this.gestureState[handKey].lastPosition.copy(this.gestureState[handKey].position);
        this.gestureState[handKey].position.copy(tipPosition);
      }
    });

    // 両手操作の検出
    this.checkTwoHandGesture();

    // ハイライト更新
    if (this.selectedObject) {
      this.updateSelectionHighlight();
    }
  }

  /**
   * ピンチ開始
   */
  onPinchStart(data) {
    const { hand, handIndex } = data;
    const handKey = handIndex === 0 ? 'left' : 'right';

    this.gestureState[handKey].pinching = true;

    // オブジェクト選択
    if (!this.selectedObject) {
      const tipPosition = hand.joints['index-finger-tip'].position;
      const selectedObj = this.getObjectAtPosition(tipPosition);

      if (selectedObj) {
        this.selectObject(selectedObj);
        this.startPinchScale(hand, handKey, selectedObj);
      }
    } else {
      // 既に選択中なら、スケール開始
      this.startPinchScale(hand, handKey, this.selectedObject);
    }
  }

  /**
   * ピンチ中
   */
  onPinch(data) {
    const { hand, handIndex } = data;
    const handKey = handIndex === 0 ? 'left' : 'right';

    if (this.pinchState.active && this.pinchState.hand === handKey) {
      this.updatePinchScale(hand);
    }
  }

  /**
   * ピンチ終了
   */
  onPinchEnd(data) {
    const { handIndex } = data;
    const handKey = handIndex === 0 ? 'left' : 'right';

    this.gestureState[handKey].pinching = false;

    if (this.pinchState.active && this.pinchState.hand === handKey) {
      this.endPinchScale();
    }
  }

  /**
   * グラブ開始
   */
  onGrabStart(data) {
    const { hand, handIndex } = data;
    const handKey = handIndex === 0 ? 'left' : 'right';

    this.gestureState[handKey].grabbing = true;

    // オブジェクト選択
    if (!this.selectedObject) {
      const palmPosition = hand.joints['wrist'].position;
      const selectedObj = this.getObjectAtPosition(palmPosition);

      if (selectedObj) {
        this.selectObject(selectedObj);
        this.startGrabMove(hand, handKey, selectedObj);
      }
    } else {
      // 既に選択中なら、移動開始
      this.startGrabMove(hand, handKey, this.selectedObject);
    }
  }

  /**
   * グラブ中
   */
  onGrab(data) {
    const { hand, handIndex } = data;
    const handKey = handIndex === 0 ? 'left' : 'right';

    if (this.grabState.active && this.grabState.hand === handKey) {
      this.updateGrabMove(hand);
    }
  }

  /**
   * グラブ終了
   */
  onGrabEnd(data) {
    const { handIndex } = data;
    const handKey = handIndex === 0 ? 'left' : 'right';

    this.gestureState[handKey].grabbing = false;

    if (this.grabState.active && this.grabState.hand === handKey) {
      this.endGrabMove();
    }
  }

  /**
   * ポイント開始
   */
  onPointStart(data) {
    const { hand, handIndex } = data;
    const handKey = handIndex === 0 ? 'left' : 'right';

    this.gestureState[handKey].pointing = true;

    // ポイントでオブジェクト選択
    const tipPosition = hand.joints['index-finger-tip'].position;
    const direction = new THREE.Vector3();
    direction.subVectors(tipPosition, hand.joints['wrist'].position).normalize();

    const selectedObj = this.raycastFromPosition(tipPosition, direction);

    if (selectedObj) {
      this.selectObject(selectedObj);
    }
  }

  /**
   * ポイント終了
   */
  onPointEnd(data) {
    const { handIndex } = data;
    const handKey = handIndex === 0 ? 'left' : 'right';

    this.gestureState[handKey].pointing = false;
  }

  /**
   * ピンチスケール開始
   */
  startPinchScale(hand, handKey, object) {
    const thumbTip = hand.joints['thumb-tip'].position;
    const indexTip = hand.joints['index-finger-tip'].position;
    const distance = thumbTip.distanceTo(indexTip);

    this.pinchState = {
      active: true,
      hand: handKey,
      startDistance: distance,
      startScale: object.scale.clone(),
      object
    };

    console.log(`👌 Pinch scale start: ${handKey}`);
  }

  /**
   * ピンチスケール更新
   */
  updatePinchScale(hand) {
    if (!this.pinchState.object) return;

    const thumbTip = hand.joints['thumb-tip'].position;
    const indexTip = hand.joints['index-finger-tip'].position;
    const currentDistance = thumbTip.distanceTo(indexTip);

    const scaleFactor = currentDistance / this.pinchState.startDistance;
    const newScale = this.pinchState.startScale.clone().multiplyScalar(scaleFactor);

    // スケール制限
    const minScale = this.options.minScale || 0.1;
    const maxScale = this.options.maxScale || 10;
    newScale.clampScalar(minScale, maxScale);

    this.pinchState.object.scale.copy(newScale);

    // イベント発火
    this.emit('objectscaled', {
      object: this.pinchState.object,
      scale: newScale
    });
  }

  /**
   * ピンチスケール終了
   */
  endPinchScale() {
    console.log(`👌 Pinch scale end`);
    this.pinchState = {
      active: false,
      hand: null,
      startDistance: 0,
      startScale: new THREE.Vector3(),
      object: null
    };
  }

  /**
   * グラブ移動開始
   */
  startGrabMove(hand, handKey, object) {
    const palmPosition = hand.joints['wrist'].position.clone();

    this.grabState = {
      active: true,
      hand: handKey,
      startPosition: palmPosition.clone(),
      startRotation: object.quaternion.clone(),
      offset: new THREE.Vector3().subVectors(object.position, palmPosition),
      object
    };

    console.log(`✊ Grab move start: ${handKey}`);
  }

  /**
   * グラブ移動更新
   */
  updateGrabMove(hand) {
    if (!this.grabState.object) return;

    const palmPosition = hand.joints['wrist'].position.clone();

    // 位置更新
    const newPosition = palmPosition.clone().add(this.grabState.offset);
    this.grabState.object.position.copy(newPosition);

    // 回転更新（手首の回転を反映）
    if (hand.joints['middle-finger-metacarpal']) {
      const handDirection = new THREE.Vector3();
      handDirection.subVectors(
        hand.joints['middle-finger-metacarpal'].position,
        hand.joints['wrist'].position
      ).normalize();

      const upVector = new THREE.Vector3(0, 1, 0);
      const rotationMatrix = new THREE.Matrix4().lookAt(
        new THREE.Vector3(0, 0, 0),
        handDirection,
        upVector
      );

      const rotation = new THREE.Quaternion().setFromRotationMatrix(rotationMatrix);
      this.grabState.object.quaternion.copy(rotation);

      // イベント発火
      this.emit('objectrotated', {
        object: this.grabState.object,
        rotation
      });
    }

    // イベント発火
    this.emit('objectmoved', {
      object: this.grabState.object,
      position: newPosition
    });
  }

  /**
   * グラブ移動終了
   */
  endGrabMove() {
    console.log(`✊ Grab move end`);
    this.grabState = {
      active: false,
      hand: null,
      startPosition: new THREE.Vector3(),
      startRotation: new THREE.Quaternion(),
      offset: new THREE.Vector3(),
      object: null
    };
  }

  /**
   * 両手ジェスチャー検出
   */
  checkTwoHandGesture() {
    const leftPinching = this.gestureState.left.pinching;
    const rightPinching = this.gestureState.right.pinching;

    // 両手ピンチでスケール+回転
    if (leftPinching && rightPinching && this.selectedObject) {
      if (!this.twoHandState.active) {
        this.startTwoHandManipulation();
      } else {
        this.updateTwoHandManipulation();
      }
    } else if (this.twoHandState.active) {
      this.endTwoHandManipulation();
    }
  }

  /**
   * 両手操作開始
   */
  startTwoHandManipulation() {
    const leftPos = this.gestureState.left.position;
    const rightPos = this.gestureState.right.position;
    const distance = leftPos.distanceTo(rightPos);

    const midpoint = new THREE.Vector3().addVectors(leftPos, rightPos).multiplyScalar(0.5);

    this.twoHandState = {
      active: true,
      startDistance: distance,
      startScale: this.selectedObject.scale.clone(),
      startRotation: this.selectedObject.quaternion.clone(),
      midpoint: midpoint.clone(),
      object: this.selectedObject
    };

    console.log('🙌 Two-hand manipulation start');
  }

  /**
   * 両手操作更新
   */
  updateTwoHandManipulation() {
    if (!this.twoHandState.object) return;

    const leftPos = this.gestureState.left.position;
    const rightPos = this.gestureState.right.position;
    const currentDistance = leftPos.distanceTo(rightPos);

    // スケール
    const scaleFactor = currentDistance / this.twoHandState.startDistance;
    const newScale = this.twoHandState.startScale.clone().multiplyScalar(scaleFactor);

    const minScale = this.options.minScale || 0.1;
    const maxScale = this.options.maxScale || 10;
    newScale.clampScalar(minScale, maxScale);

    this.twoHandState.object.scale.copy(newScale);

    // 位置（両手の中点）
    const midpoint = new THREE.Vector3().addVectors(leftPos, rightPos).multiplyScalar(0.5);
    this.twoHandState.object.position.copy(midpoint);

    // 回転（両手の方向）
    const direction = new THREE.Vector3().subVectors(rightPos, leftPos).normalize();
    const upVector = new THREE.Vector3(0, 1, 0);
    const rotationMatrix = new THREE.Matrix4().lookAt(
      new THREE.Vector3(0, 0, 0),
      direction,
      upVector
    );

    const rotation = new THREE.Quaternion().setFromRotationMatrix(rotationMatrix);
    this.twoHandState.object.quaternion.copy(rotation);

    // イベント発火
    this.emit('objectscaled', { object: this.twoHandState.object, scale: newScale });
    this.emit('objectmoved', { object: this.twoHandState.object, position: midpoint });
    this.emit('objectrotated', { object: this.twoHandState.object, rotation });
  }

  /**
   * 両手操作終了
   */
  endTwoHandManipulation() {
    console.log('🙌 Two-hand manipulation end');
    this.twoHandState = {
      active: false,
      startDistance: 0,
      startScale: new THREE.Vector3(),
      startRotation: new THREE.Quaternion(),
      midpoint: new THREE.Vector3(),
      object: null
    };
  }

  /**
   * 位置からオブジェクトを取得
   */
  getObjectAtPosition(position, radius = 0.1) {
    // 簡易的な距離ベース選択
    let nearest = null;
    let minDistance = radius;

    this.selectableObjects.forEach(obj => {
      const distance = position.distanceTo(obj.position);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = obj;
      }
    });

    return nearest;
  }

  /**
   * レイキャストでオブジェクトを取得
   */
  raycastFromPosition(origin, direction) {
    this.raycaster.set(origin, direction);
    const intersections = this.raycaster.intersectObjects(this.selectableObjects, true);

    if (intersections.length > 0) {
      return intersections[0].object;
    }

    return null;
  }

  /**
   * オブジェクトを選択
   */
  selectObject(object) {
    if (this.selectedObject === object) return;

    // 前の選択を解除
    if (this.selectedObject) {
      this.deselectObject();
    }

    this.selectedObject = object;
    this.selectionHighlight.visible = true;

    console.log(`✨ Object selected: ${object.name}`);

    // イベント発火
    this.emit('objectselected', { object });
  }

  /**
   * オブジェクトの選択を解除
   */
  deselectObject() {
    if (!this.selectedObject) return;

    const object = this.selectedObject;
    this.selectedObject = null;
    this.selectionHighlight.visible = false;

    console.log(`💫 Object deselected: ${object.name}`);

    // イベント発火
    this.emit('objectdeselected', { object });
  }

  /**
   * 選択可能なオブジェクトを追加
   */
  addSelectableObject(object) {
    if (!this.selectableObjects.includes(object)) {
      this.selectableObjects.push(object);
    }
  }

  /**
   * 選択可能なオブジェクトを削除
   */
  removeSelectableObject(object) {
    const index = this.selectableObjects.indexOf(object);
    if (index > -1) {
      this.selectableObjects.splice(index, 1);
    }
  }

  /**
   * 選択ハイライトを作成
   */
  createSelectionHighlight() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const edges = new THREE.EdgesGeometry(geometry);
    const material = new THREE.LineBasicMaterial({
      color: 0x00ffff,
      linewidth: 2
    });

    const highlight = new THREE.LineSegments(edges, material);
    highlight.visible = false;

    return highlight;
  }

  /**
   * 選択ハイライトを更新
   */
  updateSelectionHighlight() {
    if (!this.selectedObject) return;

    // オブジェクトのバウンディングボックスに合わせる
    const box = new THREE.Box3().setFromObject(this.selectedObject);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    this.selectionHighlight.scale.copy(size);
    this.selectionHighlight.position.copy(center);
  }

  /**
   * イベントリスナーを登録
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
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
    this.deselectObject();
    this.selectableObjects = [];

    this.scene.remove(this.selectionHighlight);
    this.selectionHighlight.geometry.dispose();
    this.selectionHighlight.material.dispose();

    console.log('🗑️ XRGestureController disposed');
  }
}

export default XRGestureController;
