/**
 * HandTracker - ハンドトラッキング機能
 * WebXR Hand Tracking API を使用して手の認識とジェスチャー検出を実装
 */

export class HandTracker {
  /**
   * @param {THREE.WebGLRenderer} renderer - Three.jsレンダラー
   * @param {THREE.Scene} scene - Three.jsシーン
   * @param {Object} options - オプション設定
   */
  constructor(renderer, scene, options = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = options.camera;

    // 手のモデルとデータ
    this.hands = {
      left: null,
      right: null
    };

    this.handModels = {
      left: null,
      right: null
    };

    // 選択可能なオブジェクト
    this.selectableObjects = options.selectableObjects || [];

    // 選択中のオブジェクト
    this.selectedObject = null;
    this.selectedHand = null; // 'left' or 'right'

    // 両手操作用の状態
    this.twoHandOperation = {
      active: false,
      initialDistance: 0,
      initialScale: null,
      object: null
    };

    // ジェスチャー検出の閾値
    this.pinchThreshold = 0.05; // ピンチ検出の距離閾値（メートル）
    this.grabThreshold = 0.1; // グラブ検出の閾値

    // レイキャスター
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 10;

    // ビジュアル要素
    this.pointerLines = {
      left: null,
      right: null
    };

    // 前フレームのピンチ状態
    this.prevPinchState = {
      left: false,
      right: false
    };

    // デバッグモード
    this.debug = options.debug || false;

    console.log('👋 HandTracker initialized');
  }

  /**
   * ハンドトラッキングをセットアップ
   * @param {XRSession} session - XRセッション
   */
  async setup(session) {
    if (!session) {
      console.warn('⚠️ XRセッションが提供されていません');
      return;
    }

    try {
      // XRHandModelFactory のインポート（動的）
      const { XRHandModelFactory } = await this.loadXRHandModelFactory();
      const handModelFactory = new XRHandModelFactory();

      // XRInputSource の取得
      const inputSources = session.inputSources;

      for (const inputSource of inputSources) {
        if (inputSource.hand) {
          const hand = inputSource.hand;
          const handedness = inputSource.handedness; // 'left' or 'right'

          // ハンドモデルの作成
          const handModel = handModelFactory.createHandModel(inputSource, 'mesh');
          this.scene.add(handModel);

          // 保存
          this.hands[handedness] = hand;
          this.handModels[handedness] = handModel;

          // ポインター線の作成
          this.createPointerLine(handedness);

          console.log(`👋 ${handedness} hand detected`);
        }
      }

      // inputsourceschangeイベントのリスニング
      session.addEventListener('inputsourceschange', (event) => {
        this.onInputSourcesChange(event, handModelFactory);
      });

    } catch (error) {
      console.error('❌ ハンドトラッキングのセットアップに失敗:', error);
    }
  }

  /**
   * XRHandModelFactory を動的にロード
   */
  async loadXRHandModelFactory() {
    // UMDビルド対応: グローバルTHREEから取得
    if (window.THREE && window.THREE.XRHandModelFactory) {
      return { XRHandModelFactory: window.THREE.XRHandModelFactory };
    }

    // ESMインポート
    try {
      const module = await import('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/webxr/XRHandModelFactory.js');
      return module;
    } catch (error) {
      console.error('❌ XRHandModelFactory のロードに失敗:', error);
      throw error;
    }
  }

  /**
   * ポインター線を作成
   * @param {string} handedness - 'left' or 'right'
   */
  createPointerLine(handedness) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -5)
    ]);

    const material = new THREE.LineBasicMaterial({
      color: handedness === 'left' ? 0x00ff00 : 0x0000ff,
      linewidth: 2
    });

    const line = new THREE.Line(geometry, material);
    line.visible = false; // 初期は非表示

    this.pointerLines[handedness] = line;
    this.scene.add(line);
  }

  /**
   * 入力ソース変更イベント
   */
  onInputSourcesChange(event, handModelFactory) {
    // 追加された入力ソース
    for (const inputSource of event.added) {
      if (inputSource.hand) {
        const hand = inputSource.hand;
        const handedness = inputSource.handedness;

        const handModel = handModelFactory.createHandModel(inputSource, 'mesh');
        this.scene.add(handModel);

        this.hands[handedness] = hand;
        this.handModels[handedness] = handModel;

        if (!this.pointerLines[handedness]) {
          this.createPointerLine(handedness);
        }

        console.log(`👋 ${handedness} hand added`);
      }
    }

    // 削除された入力ソース
    for (const inputSource of event.removed) {
      if (inputSource.hand) {
        const handedness = inputSource.handedness;

        if (this.handModels[handedness]) {
          this.scene.remove(this.handModels[handedness]);
          this.handModels[handedness] = null;
        }

        this.hands[handedness] = null;

        console.log(`👋 ${handedness} hand removed`);
      }
    }
  }

  /**
   * フレーム更新
   * @param {XRFrame} frame - XRフレーム
   * @param {XRReferenceSpace} referenceSpace - 参照空間
   */
  update(frame, referenceSpace) {
    if (!frame || !referenceSpace) return;

    // 各手の処理
    ['left', 'right'].forEach((handedness) => {
      const hand = this.hands[handedness];
      if (!hand) return;

      // ジェスチャー検出
      const gestures = this.detectGestures(hand, frame, referenceSpace, handedness);

      // ポインティング処理
      if (gestures.pointing) {
        this.handlePointing(hand, frame, referenceSpace, handedness);
      } else {
        if (this.pointerLines[handedness]) {
          this.pointerLines[handedness].visible = false;
        }
      }

      // ピンチ処理
      if (gestures.pinching && !this.prevPinchState[handedness]) {
        // ピンチ開始
        this.onPinchStart(hand, frame, referenceSpace, handedness);
      } else if (!gestures.pinching && this.prevPinchState[handedness]) {
        // ピンチ終了
        this.onPinchEnd(handedness);
      } else if (gestures.pinching && this.selectedHand === handedness) {
        // ピンチ中
        this.onPinchMove(hand, frame, referenceSpace, handedness);
      }

      // グラブ処理
      if (gestures.grabbing) {
        this.handleGrab(hand, frame, referenceSpace, handedness);
      }

      this.prevPinchState[handedness] = gestures.pinching;
    });

    // 両手操作の処理
    if (this.hands.left && this.hands.right) {
      this.handleTwoHandOperation(frame, referenceSpace);
    }
  }

  /**
   * ジェスチャー検出
   * @returns {Object} 検出されたジェスチャー
   */
  detectGestures(hand, frame, referenceSpace, handedness) {
    const gestures = {
      pinching: false,
      grabbing: false,
      pointing: false
    };

    try {
      // 親指の先端と人差し指の先端の位置を取得
      const thumbTip = this.getJointPose(hand, 'thumb-tip', frame, referenceSpace);
      const indexTip = this.getJointPose(hand, 'index-finger-tip', frame, referenceSpace);
      const middleTip = this.getJointPose(hand, 'middle-finger-tip', frame, referenceSpace);

      if (!thumbTip || !indexTip) {
        return gestures;
      }

      // ピンチ検出（親指と人差し指の距離）
      const pinchDistance = thumbTip.distanceTo(indexTip);
      gestures.pinching = pinchDistance < this.pinchThreshold;

      // グラブ検出（全指が曲がっている状態）
      if (middleTip) {
        const grabDistance = thumbTip.distanceTo(middleTip);
        gestures.grabbing = grabDistance < this.grabThreshold;
      }

      // ポインティング検出（人差し指が伸びている）
      const indexMCP = this.getJointPose(hand, 'index-finger-metacarpal', frame, referenceSpace);
      if (indexMCP && indexTip) {
        const fingerLength = indexMCP.distanceTo(indexTip);
        gestures.pointing = fingerLength > 0.05; // 指が伸びている
      }

    } catch (error) {
      if (this.debug) {
        console.warn(`⚠️ ジェスチャー検出エラー (${handedness}):`, error);
      }
    }

    return gestures;
  }

  /**
   * ジョイントの位置を取得
   * @returns {THREE.Vector3} ジョイント位置
   */
  getJointPose(hand, jointName, frame, referenceSpace) {
    try {
      const joint = hand.get(jointName);
      if (!joint) return null;

      const jointPose = frame.getJointPose(joint, referenceSpace);
      if (!jointPose) return null;

      const position = jointPose.transform.position;
      return new THREE.Vector3(position.x, position.y, position.z);
    } catch (error) {
      return null;
    }
  }

  /**
   * ポインティング処理
   */
  handlePointing(hand, frame, referenceSpace, handedness) {
    const indexTip = this.getJointPose(hand, 'index-finger-tip', frame, referenceSpace);
    const indexMCP = this.getJointPose(hand, 'index-finger-metacarpal', frame, referenceSpace);

    if (!indexTip || !indexMCP) return;

    // レイの方向を計算
    const direction = new THREE.Vector3().subVectors(indexTip, indexMCP).normalize();

    // レイキャスト
    this.raycaster.set(indexTip, direction);
    const intersects = this.raycaster.intersectObjects(this.selectableObjects, true);

    // ポインター線の更新
    const line = this.pointerLines[handedness];
    if (line) {
      line.visible = true;
      line.position.copy(indexTip);
      line.lookAt(indexTip.clone().add(direction));
    }

    // ハイライト処理（今後の拡張）
    if (intersects.length > 0) {
      // TODO: オブジェクトをハイライト
    }
  }

  /**
   * ピンチ開始
   */
  onPinchStart(hand, frame, referenceSpace, handedness) {
    const indexTip = this.getJointPose(hand, 'index-finger-tip', frame, referenceSpace);
    const thumbTip = this.getJointPose(hand, 'thumb-tip', frame, referenceSpace);

    if (!indexTip || !thumbTip) return;

    // ピンチ位置（中点）
    const pinchPosition = new THREE.Vector3().addVectors(indexTip, thumbTip).multiplyScalar(0.5);

    // ピンチ位置から近いオブジェクトを検索
    let closestObject = null;
    let minDistance = 0.3; // 30cm以内

    this.selectableObjects.forEach((obj) => {
      const distance = obj.position.distanceTo(pinchPosition);
      if (distance < minDistance) {
        minDistance = distance;
        closestObject = obj;
      }
    });

    if (closestObject) {
      this.selectedObject = closestObject;
      this.selectedHand = handedness;

      // オブジェクトをピンチ位置に一時的にアタッチ
      this.selectedObject.userData.handOffset = this.selectedObject.position.clone().sub(pinchPosition);

      console.log(`👌 Pinch selected: ${this.selectedObject.userData.id || 'object'}`);
    }
  }

  /**
   * ピンチ中
   */
  onPinchMove(hand, frame, referenceSpace, handedness) {
    if (!this.selectedObject) return;

    const indexTip = this.getJointPose(hand, 'index-finger-tip', frame, referenceSpace);
    const thumbTip = this.getJointPose(hand, 'thumb-tip', frame, referenceSpace);

    if (!indexTip || !thumbTip) return;

    const pinchPosition = new THREE.Vector3().addVectors(indexTip, thumbTip).multiplyScalar(0.5);

    // オブジェクトを移動
    if (this.selectedObject.userData.handOffset) {
      this.selectedObject.position.copy(pinchPosition).add(this.selectedObject.userData.handOffset);
    } else {
      this.selectedObject.position.copy(pinchPosition);
    }
  }

  /**
   * ピンチ終了
   */
  onPinchEnd(handedness) {
    if (this.selectedHand === handedness && this.selectedObject) {
      console.log(`👌 Pinch released: ${this.selectedObject.userData.id || 'object'}`);

      delete this.selectedObject.userData.handOffset;
      this.selectedObject = null;
      this.selectedHand = null;
    }
  }

  /**
   * グラブ処理
   */
  handleGrab(hand, frame, referenceSpace, handedness) {
    // グラブはピンチと同様にオブジェクトを掴む
    // 今後の拡張で異なる動作を追加可能
  }

  /**
   * 両手操作処理（拡大縮小・回転）
   */
  handleTwoHandOperation(frame, referenceSpace) {
    const leftIndexTip = this.getJointPose(this.hands.left, 'index-finger-tip', frame, referenceSpace);
    const rightIndexTip = this.getJointPose(this.hands.right, 'index-finger-tip', frame, referenceSpace);

    if (!leftIndexTip || !rightIndexTip) return;

    const leftPinching = this.prevPinchState.left;
    const rightPinching = this.prevPinchState.right;

    if (leftPinching && rightPinching) {
      // 両手でピンチ中
      const currentDistance = leftIndexTip.distanceTo(rightIndexTip);

      if (!this.twoHandOperation.active) {
        // 両手操作開始
        this.twoHandOperation.active = true;
        this.twoHandOperation.initialDistance = currentDistance;

        if (this.selectedObject) {
          this.twoHandOperation.object = this.selectedObject;
          this.twoHandOperation.initialScale = this.selectedObject.scale.clone();
        }

        console.log('🙌 Two-hand operation started');
      } else {
        // スケール調整
        if (this.twoHandOperation.object && this.twoHandOperation.initialScale) {
          const scaleFactor = currentDistance / this.twoHandOperation.initialDistance;
          const newScale = this.twoHandOperation.initialScale.clone().multiplyScalar(scaleFactor);

          this.twoHandOperation.object.scale.copy(newScale);
        }
      }
    } else {
      // 両手操作終了
      if (this.twoHandOperation.active) {
        console.log('🙌 Two-hand operation ended');
        this.twoHandOperation.active = false;
        this.twoHandOperation.object = null;
        this.twoHandOperation.initialScale = null;
      }
    }
  }

  /**
   * 選択可能なオブジェクトを設定
   * @param {Array<THREE.Object3D>} objects - オブジェクト配列
   */
  setSelectableObjects(objects) {
    this.selectableObjects = objects;
  }

  /**
   * 選択可能なオブジェクトを追加
   * @param {THREE.Object3D} object - オブジェクト
   */
  addSelectableObject(object) {
    if (!this.selectableObjects.includes(object)) {
      this.selectableObjects.push(object);
    }
  }

  /**
   * デバッグ情報を取得
   */
  getDebugInfo() {
    return {
      leftHand: !!this.hands.left,
      rightHand: !!this.hands.right,
      selectedObject: this.selectedObject ? this.selectedObject.userData.id : null,
      twoHandOperation: this.twoHandOperation.active
    };
  }

  /**
   * クリーンアップ
   */
  dispose() {
    // ハンドモデルの削除
    ['left', 'right'].forEach((handedness) => {
      if (this.handModels[handedness]) {
        this.scene.remove(this.handModels[handedness]);
        this.handModels[handedness] = null;
      }

      if (this.pointerLines[handedness]) {
        this.scene.remove(this.pointerLines[handedness]);
        this.pointerLines[handedness].geometry.dispose();
        this.pointerLines[handedness].material.dispose();
        this.pointerLines[handedness] = null;
      }
    });

    this.hands.left = null;
    this.hands.right = null;
    this.selectedObject = null;
    this.selectedHand = null;

    console.log('👋 HandTracker disposed');
  }
}
