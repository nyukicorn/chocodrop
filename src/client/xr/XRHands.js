import * as THREEModule from 'three';
const THREE = globalThis.THREE || THREEModule;

/**
 * XRHands - WebXR ハンドトラッキング
 * 両手の追跡、ジェスチャー認識、ハンドインタラクションを処理
 */
export class XRHands {
  constructor(renderer, scene, options = {}) {
    if (!renderer || !scene) {
      throw new Error('THREE.WebGLRenderer and THREE.Scene are required');
    }

    this.renderer = renderer;
    this.scene = scene;
    this.options = options;

    // ハンド
    this.hands = [];
    this.handModels = [];
    this.handModelType = options.handModelType || 'mesh'; // 'mesh' | 'spheres' | 'boxes'

    // ジェスチャー認識
    this.gestures = {
      pinch: { left: false, right: false },
      grab: { left: false, right: false },
      point: { left: false, right: false }
    };

    // インタラクション
    this.interactableObjects = options.interactableObjects || [];
    this.selectedObjects = new Map(); // hand index -> object
    this.raycaster = new THREE.Raycaster();

    // イベントリスナー
    this.listeners = {
      pinchstart: [],
      pinchend: [],
      grabstart: [],
      grabend: [],
      pointstart: [],
      pointend: []
    };

    console.log('👋 XRHands initialized');
  }

  /**
   * XRHandModelFactory でハンドモデルを読み込み
   */
  async loadHandModels(XRHandModelFactory) {
    if (!XRHandModelFactory) {
      console.warn('XRHandModelFactory not provided');
      return;
    }

    const handModelFactory = new XRHandModelFactory();

    // 左右の手
    for (let i = 0; i < 2; i++) {
      const hand = this.renderer.xr.getHand(i);

      // ハンドモデルを作成
      const handModel = handModelFactory.createHandModel(hand, this.handModelType);
      hand.add(handModel);

      this.scene.add(hand);
      this.hands[i] = hand;
      this.handModels[i] = handModel;

      // ハンドイベント
      hand.addEventListener('connected', (event) => this.onHandConnected(event, i));
      hand.addEventListener('disconnected', (event) => this.onHandDisconnected(event, i));
    }

    console.log('👋 Hand models loaded');
  }

  /**
   * ハンド接続時
   */
  onHandConnected(event, index) {
    console.log(`👋 Hand ${index} connected`);
  }

  /**
   * ハンド切断時
   */
  onHandDisconnected(event, index) {
    console.log(`👋 Hand ${index} disconnected`);
  }

  /**
   * アップデート（ジェスチャー認識）
   */
  update() {
    this.hands.forEach((hand, index) => {
      if (hand.joints && hand.joints['index-finger-tip']) {
        // ピンチジェスチャーの検出
        this.detectPinch(hand, index);

        // グラブジェスチャーの検出
        this.detectGrab(hand, index);

        // ポイントジェスチャーの検出
        this.detectPoint(hand, index);
      }
    });
  }

  /**
   * ピンチジェスチャーを検出
   */
  detectPinch(hand, handIndex) {
    const thumbTip = hand.joints['thumb-tip'];
    const indexTip = hand.joints['index-finger-tip'];

    if (!thumbTip || !indexTip) return;

    const distance = thumbTip.position.distanceTo(indexTip.position);
    const threshold = 0.02; // 2cm

    const handKey = handIndex === 0 ? 'left' : 'right';
    const wasPinching = this.gestures.pinch[handKey];
    const isPinching = distance < threshold;

    if (isPinching && !wasPinching) {
      // ピンチ開始
      this.gestures.pinch[handKey] = true;
      this.onPinchStart(handIndex);
    } else if (!isPinching && wasPinching) {
      // ピンチ終了
      this.gestures.pinch[handKey] = false;
      this.onPinchEnd(handIndex);
    }
  }

  /**
   * グラブジェスチャーを検出
   */
  detectGrab(hand, handIndex) {
    const palm = hand.joints['wrist'];
    const middleTip = hand.joints['middle-finger-tip'];

    if (!palm || !middleTip) return;

    const distance = palm.position.distanceTo(middleTip.position);
    const threshold = 0.05; // 5cm

    const handKey = handIndex === 0 ? 'left' : 'right';
    const wasGrabbing = this.gestures.grab[handKey];
    const isGrabbing = distance < threshold;

    if (isGrabbing && !wasGrabbing) {
      // グラブ開始
      this.gestures.grab[handKey] = true;
      this.onGrabStart(handIndex);
    } else if (!isGrabbing && wasGrabbing) {
      // グラブ終了
      this.gestures.grab[handKey] = false;
      this.onGrabEnd(handIndex);
    }
  }

  /**
   * ポイントジェスチャーを検出
   */
  detectPoint(hand, handIndex) {
    const indexTip = hand.joints['index-finger-tip'];
    const indexBase = hand.joints['index-finger-metacarpal'];

    if (!indexTip || !indexBase) return;

    // 人差し指の向きを取得
    const direction = new THREE.Vector3()
      .subVectors(indexTip.position, indexBase.position)
      .normalize();

    // 他の指が曲がっているかチェック（簡易版）
    const middleTip = hand.joints['middle-finger-tip'];
    const palm = hand.joints['wrist'];

    if (!middleTip || !palm) return;

    const middleDistance = palm.position.distanceTo(middleTip.position);
    const isPointing = middleDistance < 0.08; // 8cm未満なら他の指は曲がっている

    const handKey = handIndex === 0 ? 'left' : 'right';
    const wasPointing = this.gestures.point[handKey];

    if (isPointing && !wasPointing) {
      // ポイント開始
      this.gestures.point[handKey] = true;
      this.onPointStart(handIndex, direction);
    } else if (!isPointing && wasPointing) {
      // ポイント終了
      this.gestures.point[handKey] = false;
      this.onPointEnd(handIndex);
    }
  }

  /**
   * ピンチ開始
   */
  onPinchStart(handIndex) {
    console.log(`👌 Pinch start (hand ${handIndex})`);

    // オブジェクトを選択
    const hand = this.hands[handIndex];
    const indexTip = hand.joints['index-finger-tip'];

    if (indexTip) {
      const nearestObject = this.findNearestObject(indexTip.position);
      if (nearestObject) {
        this.selectObject(handIndex, nearestObject);
      }
    }

    this.emit('pinchstart', { handIndex });
  }

  /**
   * ピンチ終了
   */
  onPinchEnd(handIndex) {
    console.log(`👌 Pinch end (hand ${handIndex})`);

    // オブジェクトを解放
    this.releaseObject(handIndex);

    this.emit('pinchend', { handIndex });
  }

  /**
   * グラブ開始
   */
  onGrabStart(handIndex) {
    console.log(`✊ Grab start (hand ${handIndex})`);
    this.emit('grabstart', { handIndex });
  }

  /**
   * グラブ終了
   */
  onGrabEnd(handIndex) {
    console.log(`✊ Grab end (hand ${handIndex})`);
    this.emit('grabend', { handIndex });
  }

  /**
   * ポイント開始
   */
  onPointStart(handIndex, direction) {
    console.log(`☝️ Point start (hand ${handIndex})`);
    this.emit('pointstart', { handIndex, direction });
  }

  /**
   * ポイント終了
   */
  onPointEnd(handIndex) {
    console.log(`☝️ Point end (hand ${handIndex})`);
    this.emit('pointend', { handIndex });
  }

  /**
   * 最も近いオブジェクトを探す
   */
  findNearestObject(position, maxDistance = 0.1) {
    let nearest = null;
    let minDistance = maxDistance;

    this.interactableObjects.forEach(obj => {
      const distance = position.distanceTo(obj.position);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = obj;
      }
    });

    return nearest;
  }

  /**
   * オブジェクトを選択
   */
  selectObject(handIndex, object) {
    const hand = this.hands[handIndex];

    // オブジェクトを手にアタッチ
    hand.attach(object);
    this.selectedObjects.set(handIndex, object);

    console.log(`👋 Object selected by hand ${handIndex}:`, object.name);
  }

  /**
   * オブジェクトを解放
   */
  releaseObject(handIndex) {
    const object = this.selectedObjects.get(handIndex);

    if (object) {
      // シーンに戻す
      this.scene.attach(object);
      this.selectedObjects.delete(handIndex);

      console.log(`👋 Object released by hand ${handIndex}:`, object.name);
    }
  }

  /**
   * インタラクション可能なオブジェクトを設定
   */
  setInteractableObjects(objects) {
    this.interactableObjects = objects;
  }

  /**
   * 現在のジェスチャー状態を取得
   */
  getGestures() {
    return this.gestures;
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
    this.hands.forEach(hand => {
      this.scene.remove(hand);
    });

    this.hands = [];
    this.handModels = [];
    this.selectedObjects.clear();

    console.log('🗑️ XRHands disposed');
  }
}

export default XRHands;
