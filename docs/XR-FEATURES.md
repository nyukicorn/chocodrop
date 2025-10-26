# 🥽 ChocoDrop WebXR 機能ガイド

ChocoDrop の WebXR 実装により、Meta Quest 3 などの XR デバイスで没入型 VR/AR 体験が可能です。

## 📋 目次

1. [アーキテクチャ概要](#アーキテクチャ概要)
2. [コンポーネント](#コンポーネント)
3. [使用方法](#使用方法)
4. [API リファレンス](#api-リファレンス)
5. [ジェスチャー検出](#ジェスチャー検出)
6. [ベストプラクティス](#ベストプラクティス)

---

## アーキテクチャ概要

```
SceneManager
    ├── XRManager (セッション管理)
    ├── XRController (コントローラー入力)
    ├── XRHands (ハンドトラッキング)
    ├── XRPlaneDetector (AR平面検出)
    └── XRAnchorManager (空間アンカー)
```

### XRフレームループ

```javascript
renderer.setAnimationLoop((time, frame) => {
  if (frame && xrManager.isSessionActive()) {
    // XR更新処理
    xrController.update();
    xrHands.update();
    xrPlaneDetector.update(frame, referenceSpace);
    xrAnchorManager.update(frame, referenceSpace);
  }
  renderer.render(scene, camera);
});
```

---

## コンポーネント

### 1. XRManager

**役割**: XRセッションのライフサイクル管理

**主要メソッド**:
- `startSession(mode)`: VR/ARセッション開始
- `endSession()`: セッション終了
- `isSessionActive()`: セッション状態確認
- `getReferenceSpace()`: 参照空間取得

**使用例**:
```javascript
const xrManager = new XRManager(renderer);
await xrManager.startSession('immersive-vr');
```

### 2. XRController

**役割**: VRコントローラー入力処理

**機能**:
- レイキャストによるオブジェクト選択
- トリガー/グリップボタン検出
- コントローラーモデル表示

**イベント**:
- `select`: トリガー押下
- `selectstart`: トリガー押し始め
- `selectend`: トリガー離し
- `squeeze`: グリップ押下

**使用例**:
```javascript
xrController.on('select', (data) => {
  console.log('選択:', data.intersection);
});
```

### 3. XRHands

**役割**: ハンドトラッキングとジェスチャー検出

**ジェスチャー**:
- **Pinch (ピンチ)**: 親指と人差し指 < 2cm
- **Grab (グラブ)**: 全指を握る < 5cm
- **Point (ポイント)**: 人差し指を伸ばす > 8cm

**イベント**:
- `pinchstart/pinchend`: ピンチ開始/終了
- `grabstart/grabend`: グラブ開始/終了
- `pointstart/pointend`: ポイント開始/終了

**使用例**:
```javascript
xrHands.on('pinchstart', (data) => {
  const { hand, handIndex } = data;
  console.log(`${handIndex}手でピンチ開始`);
});
```

### 4. XRPlaneDetector (AR専用)

**役割**: 現実空間の平面検出

**機能**:
- 水平面(床)検出: `getHorizontalPlanes()`
- 垂直面(壁)検出: `getVerticalPlanes()`
- ヒットテスト: タップ位置の3D座標取得

**イベント**:
- `planeadded`: 平面検出
- `planechanged`: 平面更新
- `planeremoved`: 平面消失
- `hittest`: ヒットテスト結果

**使用例**:
```javascript
xrPlaneDetector.on('planeadded', (data) => {
  const { xrPlane, mesh, orientation } = data;
  console.log(`平面検出: ${orientation}`);
});
```

### 5. XRAnchorManager (AR専用)

**役割**: 空間アンカー管理(オブジェクトを現実空間に固定)

**主要メソッド**:
- `createAnchor(pose)`: 位置指定でアンカー作成
- `createAnchorFromHit(hitTestResult)`: ヒットテスト結果からアンカー作成
- `attachObjectToAnchor(anchor, object)`: オブジェクトをアンカーに紐付け
- `removeAnchor(anchor)`: アンカー削除

**使用例**:
```javascript
// ヒットテストからアンカー作成
xrPlaneDetector.on('hittest', async (data) => {
  const anchor = await xrAnchorManager.createAnchorFromHit(data.hit, {
    attachedObject: myObject,
    userData: { name: 'テーブル' }
  });
});
```

---

## 使用方法

### VRモード開始

```javascript
// SceneManager経由
await sceneManager.startVR();

// または直接
await sceneManager.xrManager.startSession('immersive-vr');
```

### ARモード開始

```javascript
await sceneManager.startAR();
```

### オブジェクト選択 (VR)

```javascript
// コントローラー選択
sceneManager.xrController.on('select', (data) => {
  if (data.intersection) {
    const selectedObject = data.intersection.object;
    selectedObject.material.color.set(0xff0000);
  }
});

// ハンド選択
sceneManager.xrHands.on('pinchstart', (data) => {
  const { hand } = data;
  const position = hand.joints['index-finger-tip'].position;
  // positionで選択処理
});
```

### オブジェクト配置 (AR)

```javascript
let placementMode = true;

sceneManager.xrPlaneDetector.on('hittest', async (data) => {
  if (placementMode) {
    // プレビュー表示
    previewMesh.position.copy(data.position);
    previewMesh.quaternion.copy(data.orientation);
  }
});

// タップで配置確定
sceneManager.xrController.on('select', async () => {
  if (placementMode) {
    const hitData = lastHitTestResult;
    const anchor = await sceneManager.xrAnchorManager.createAnchorFromHit(
      hitData.hit,
      { attachedObject: realObject }
    );
    placementMode = false;
  }
});
```

### カスタムジェスチャー

```javascript
// ピンチでスケール
let pinchStartDistance = 0;
let pinchStartScale = 1;

sceneManager.xrHands.on('pinchstart', (data) => {
  const { hand } = data;
  const thumb = hand.joints['thumb-tip'].position;
  const index = hand.joints['index-finger-tip'].position;
  pinchStartDistance = thumb.distanceTo(index);
  pinchStartScale = selectedObject.scale.x;
});

sceneManager.xrHands.on('pinch', (data) => {
  const { hand } = data;
  const thumb = hand.joints['thumb-tip'].position;
  const index = hand.joints['index-finger-tip'].position;
  const currentDistance = thumb.distanceTo(index);

  const scale = pinchStartScale * (currentDistance / pinchStartDistance);
  selectedObject.scale.setScalar(scale);
});
```

---

## API リファレンス

### XRManager

```typescript
class XRManager {
  constructor(renderer: THREE.WebGLRenderer)

  async startSession(mode: 'immersive-vr' | 'immersive-ar'): Promise<void>
  async endSession(): Promise<void>

  isSessionActive(): boolean
  isVRMode(): boolean
  isARMode(): boolean

  getReferenceSpace(): XRReferenceSpace
  getSession(): XRSession
}
```

### XRController

```typescript
class XRController {
  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, options?: {
    enableRaycast?: boolean
    raycastLayers?: THREE.Layers
  })

  loadControllerModels(XRControllerModelFactory: any): void
  update(): void

  on(event: 'select' | 'selectstart' | 'selectend' | 'squeeze',
     callback: Function): void
}
```

### XRHands

```typescript
class XRHands {
  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, options?: {
    handModelType?: 'boxes' | 'spheres' | 'mesh'
    showHands?: boolean
    gestureDetection?: {
      pinch?: boolean
      grab?: boolean
      point?: boolean
    }
  })

  loadHandModels(XRHandModelFactory: any): void
  update(): void

  on(event: 'pinchstart' | 'pinchend' | 'pinch' |
            'grabstart' | 'grabend' | 'grab' |
            'pointstart' | 'pointend' | 'point',
     callback: Function): void
}
```

### XRPlaneDetector

```typescript
class XRPlaneDetector {
  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, options?: {
    showPlanes?: boolean
    planeOpacity?: number
    planeColor?: number
  })

  async onSessionStart(session: XRSession): Promise<void>
  update(frame: XRFrame, referenceSpace: XRReferenceSpace): void

  getHorizontalPlanes(): Array<{ xrPlane: XRPlane, mesh: THREE.Mesh }>
  getVerticalPlanes(): Array<{ xrPlane: XRPlane, mesh: THREE.Mesh }>

  setShowPlanes(show: boolean): void

  on(event: 'planeadded' | 'planechanged' | 'planeremoved' | 'hittest',
     callback: Function): void
}
```

### XRAnchorManager

```typescript
class XRAnchorManager {
  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, options?: {
    showAnchors?: boolean
    anchorMarkerSize?: number
  })

  async createAnchor(pose: XRPose, options?: {
    referenceSpace?: XRReferenceSpace
    attachedObject?: THREE.Object3D
    userData?: any
  }): Promise<XRAnchor>

  async createAnchorFromHit(hitTestResult: XRHitTestResult, options?: {
    attachedObject?: THREE.Object3D
    userData?: any
  }): Promise<XRAnchor>

  update(frame: XRFrame, referenceSpace: XRReferenceSpace): void

  attachObjectToAnchor(anchor: XRAnchor, object: THREE.Object3D): void
  detachObjectFromAnchor(anchor: XRAnchor): THREE.Object3D

  async removeAnchor(anchor: XRAnchor): Promise<void>
  async clearAllAnchors(): Promise<void>

  getAllAnchors(): Array<{ anchor: XRAnchor, mesh: THREE.Mesh,
                          object: THREE.Object3D, userData: any }>
  getAnchorCount(): number

  findNearestAnchor(position: THREE.Vector3, maxDistance?: number):
    { anchor: XRAnchor, distance: number, anchorData: any }

  on(event: 'anchoradded' | 'anchorremoved' | 'anchorupdated',
     callback: Function): void
}
```

---

## ジェスチャー検出

### 検出ロジック

```javascript
// Pinch: 親指と人差し指の距離
const thumbTip = hand.joints['thumb-tip'];
const indexTip = hand.joints['index-finger-tip'];
const distance = thumbTip.position.distanceTo(indexTip.position);
const isPinching = distance < 0.02; // 2cm

// Grab: 全指の握り
const palm = hand.joints['wrist'];
const fingerTips = ['thumb-tip', 'index-finger-tip', 'middle-finger-tip',
                    'ring-finger-tip', 'pinky-finger-tip'];
const distances = fingerTips.map(tip =>
  hand.joints[tip].position.distanceTo(palm.position)
);
const avgDistance = distances.reduce((a, b) => a + b) / distances.length;
const isGrabbing = avgDistance < 0.05; // 5cm

// Point: 人差し指が伸びている
const indexBase = hand.joints['index-finger-metacarpal'];
const indexDistance = indexTip.position.distanceTo(indexBase.position);
const isPointing = indexDistance > 0.08; // 8cm
```

### カスタム閾値

```javascript
const xrHands = new XRHands(renderer, scene, {
  gestureDetection: {
    pinch: { threshold: 0.025 }, // 2.5cm
    grab: { threshold: 0.06 },   // 6cm
    point: { threshold: 0.1 }    // 10cm
  }
});
```

---

## ベストプラクティス

### 1. パフォーマンス最適化

```javascript
// ジオメトリの再利用
const planeGeometry = new THREE.PlaneGeometry(1, 1);
const planeMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });

// インスタンスメッシュの使用
const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
```

### 2. メモリ管理

```javascript
// セッション終了時のクリーンアップ
async function cleanup() {
  await xrAnchorManager.clearAllAnchors();
  xrPlaneDetector.dispose();
  xrHands.dispose();
  xrController.dispose();
  await xrManager.endSession();
}
```

### 3. エラーハンドリング

```javascript
try {
  await xrManager.startSession('immersive-ar');
} catch (error) {
  if (error.name === 'NotSupportedError') {
    console.error('このデバイスはARをサポートしていません');
  } else if (error.name === 'SecurityError') {
    console.error('HTTPSが必要です');
  }
}
```

### 4. ユーザビリティ

```javascript
// 視覚的フィードバック
xrController.on('selectstart', (data) => {
  if (data.intersection) {
    data.intersection.object.material.emissive.set(0xffffff);
  }
});

xrController.on('selectend', (data) => {
  if (data.intersection) {
    data.intersection.object.material.emissive.set(0x000000);
  }
});
```

### 5. AR配置ガイド

```javascript
// 平面検出まで待機
let planesReady = false;

xrPlaneDetector.on('planeadded', () => {
  if (xrPlaneDetector.getHorizontalPlanes().length > 0) {
    planesReady = true;
    showMessage('床を認識しました。タップして配置してください');
  }
});
```

---

## デバイス互換性

| デバイス | VRモード | ARモード | ハンドトラッキング | 平面検出 | アンカー |
|---------|---------|---------|-----------------|---------|---------|
| Meta Quest 3 | ✅ | ✅ | ✅ | ✅ | ✅ |
| Meta Quest 2 | ✅ | ❌ | ✅ | ❌ | ❌ |
| Meta Quest Pro | ✅ | ✅ | ✅ | ✅ | ✅ |
| HTC Vive | ✅ | ❌ | ❌ | ❌ | ❌ |
| Valve Index | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## トラブルシューティング

### 問題: ハンドトラッキングが動作しない

**解決策**:
1. Quest設定で「ハンドトラッキング」を有効化
2. コントローラーを手から離す
3. 明るい環境で使用

### 問題: 平面が検出されない

**解決策**:
1. デバイスを動かして空間をスキャン
2. テクスチャのある床/壁を使用
3. 十分な照明を確保

### 問題: アンカーが動く

**解決策**:
1. デバイスのトラッキングを改善(空間再スキャン)
2. より広い参照面積を確保
3. 静的な環境で使用

---

## サンプルコード

完全な実装例は `examples/xr-demo/index.html` を参照してください。

**起動方法**:
```bash
cd /Users/nukuiyuki/Dev/ChocoDrop/.worktrees/task-1761476416770-73488a
npm run dev
```

Meta Quest 3 ブラウザから `https://192.168.1.15:3011/examples/xr-demo/` にアクセス。

---

## 参考資料

- [WebXR Device API](https://www.w3.org/TR/webxr/)
- [Three.js WebXR Examples](https://threejs.org/examples/?q=webxr)
- [Meta Quest Developer Documentation](https://developer.oculus.com/documentation/web/webxr-gs/)
