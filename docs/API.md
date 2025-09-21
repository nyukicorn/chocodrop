# ChocoDrop API リファレンス

## 📖 概要

ChocoDrop は Three.js シーンにAI生成コンテンツを統合するためのライブラリです。自然言語コマンドで3D空間にオブジェクトを配置できます。

## 🏗️ アーキテクチャ

```
ChocoDrop
├── Client (ChocoDropClient) - サーバー通信
├── SceneManager - 3D オブジェクト管理
├── CommandUI - ユーザーインターフェース
└── Server - AI生成・MCP連携
```

## 🚀 初期化

### createChocoDrop()

Three.js プロジェクトに ChocoDrop を統合する主要関数です。

```javascript
import { createChocoDrop } from '@chocodrop/core';

const chocoDrop = createChocoDrop(scene, options);
```

#### パラメーター

| パラメーター | 型 | 必須 | 説明 |
|-------------|-----|------|------|
| `scene` | `THREE.Scene` | ✅ | 統合先の Three.js シーン |
| `options` | `Object` | - | 初期化オプション |

#### options オブジェクト

```javascript
{
  camera: THREE.Camera,           // カメラ（位置計算用）
  renderer: THREE.WebGLRenderer,  // レンダラー（UI統合用）
  serverUrl: string,              // サーバーURL（省略時自動検出）
  client: ChocoDropClient,        // 既存クライアント注入
  onControlsToggle: function,     // UI開閉時コールバック
  sceneOptions: Object,           // SceneManager追加オプション
  uiOptions: Object              // CommandUI追加オプション
}
```

#### 戻り値

```javascript
{
  client: ChocoDropClient,      // HTTP通信クライアント
  sceneManager: SceneManager,   // 3Dオブジェクト管理
  ui: CommandUI,               // ユーザーインターフェース
  dispose: function            // リソース解放
}
```

### 基本的な統合例

```javascript
// Three.js セットアップ
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
const controls = new OrbitControls(camera, renderer.domElement);

// ChocoDrop 統合
const chocoDrop = createChocoDrop(scene, {
  camera,
  renderer,
  serverUrl: 'http://localhost:3011', // 省略可能
  onControlsToggle: (disabled) => {
    controls.enabled = !disabled;
  }
});

// @キーでUI起動、自然言語で操作可能
```

## 🎮 ChocoDropClient API

サーバーとの通信を担当するクライアントクラスです。

### generateImage()

AI画像を生成します。

```javascript
const result = await chocoDrop.client.generateImage(prompt, options);
```

#### パラメーター

```javascript
{
  prompt: string,        // 生成プロンプト（日本語対応）
  width: number,         // 画像幅（デフォルト: 512）
  height: number,        // 画像高（デフォルト: 512）
  service: string       // 使用モデル（省略時デフォルト）
}
```

#### 利用可能モデル
- `t2i-kamui-seedream-v4` (デフォルト) - 高品質画像
- `t2i-kamui-flux-schnell` - 最高品質画像
- `t2i-kamui-qwen-image` - 高速生成
- `t2i-kamui-imagen4-fast` - バランス型

#### レスポンス

```javascript
{
  success: boolean,
  imageUrl: string,      // Web用URL
  localPath: string,     // ローカルパス
  metadata: {
    prompt: string,
    service: string,
    timestamp: number
  }
}
```

### generateVideo()

AI動画を生成します。

```javascript
const result = await chocoDrop.client.generateVideo(prompt, options);
```

#### パラメーター

```javascript
{
  prompt: string,                    // 生成プロンプト
  duration: number,                  // 動画長(秒、デフォルト: 3)
  aspect_ratio: string,              // アスペクト比 "16:9"|"9:16"|"1:1"
  resolution: string,                // 解像度 "720p"|"580p"|"480p"
  width: number,                     // カスタム幅
  height: number,                    // カスタム高
  model: string,                     // 使用モデル
  negative_prompt: string,           // ネガティブプロンプト
  seed: number,                      // シード値
  enable_safety_checker: boolean,    // セーフティチェック
  enable_prompt_expansion: boolean,  // プロンプト拡張
  frames_per_second: number,         // フレームレート
  guidance_scale: number            // ガイダンススケール
}
```

#### レスポンス

```javascript
{
  success: boolean,
  videoUrl: string,
  localPath: string,
  metadata: {
    prompt: string,
    model: string,
    width: number,
    height: number,
    duration: number,
    // その他メタデータ
  }
}
```

### executeCommand()

自然言語コマンドを実行します。

```javascript
const result = await chocoDrop.client.executeCommand(naturalLanguage);
```

#### 対応コマンド例

```javascript
// 配置コマンド
"ドラゴンを右上に作って"
"桜を中央に配置"
"背景に森を生成"

// 編集コマンド
"大きくして"
"位置を変更"
"削除"

// 複合コマンド
"青い猫を左下に小さく配置"
```

#### 位置指定

| 日本語 | 英語 | 座標 |
|--------|------|------|
| 右上 | top-right | x:5, y:5, z:-10 |
| 左上 | top-left | x:-5, y:5, z:-10 |
| 右下 | bottom-right | x:5, y:-5, z:-10 |
| 左下 | bottom-left | x:-5, y:-5, z:-10 |
| 中央 | center | x:0, y:0, z:-10 |

## 🎭 SceneManager API

3Dシーン内のオブジェクト管理を担当します。

### addObject()

3Dオブジェクトをシーンに追加します。

```javascript
const result = sceneManager.addObject(mesh, options);
```

#### パラメーター

```javascript
{
  position: { x, y, z },    // 配置座標
  scale: { x, y, z },       // スケール
  rotation: { x, y, z },    // 回転
  metadata: Object          // メタデータ
}
```

### removeObject()

オブジェクトをシーンから削除します。

```javascript
sceneManager.removeObject(objectId);
```

### clearAll()

全てのChocoDrop管理オブジェクトを削除します。

```javascript
sceneManager.clearAll();
```

### getObjects()

管理中のオブジェクト一覧を取得します。

```javascript
const objects = sceneManager.getObjects();
```

## 🎨 CommandUI API

ユーザーインターフェースを管理します。

### show()

コマンドUIを表示します。

```javascript
chocoDrop.ui.show();
```

### hide()

コマンドUIを非表示にします。

```javascript
chocoDrop.ui.hide();
```

### toggle()

コマンドUIの表示/非表示を切り替えます。

```javascript
chocoDrop.ui.toggle();
```

## 🖥️ サーバー API

REST APIエンドポイント（サーバー側）

### POST /api/generate

画像生成リクエスト

```javascript
// リクエスト
{
  "prompt": "beautiful landscape",
  "width": 512,
  "height": 512,
  "service": "t2i-kamui-seedream-v4"
}

// レスポンス
{
  "success": true,
  "imageUrl": "/generated/image_123.png",
  "metadata": { ... }
}
```

### POST /api/generate-video

動画生成リクエスト

```javascript
// リクエスト
{
  "prompt": "flowing river",
  "duration": 5,
  "aspect_ratio": "16:9"
}

// レスポンス
{
  "success": true,
  "videoUrl": "/generated/video_123.mp4",
  "metadata": { ... }
}
```

### POST /api/command

自然言語コマンド実行

```javascript
// リクエスト
{
  "command": "ドラゴンを右上に作って"
}

// レスポンス
{
  "success": true,
  "action": "generate_and_place",
  "result": { ... }
}
```

### GET /api/config

クライアント設定取得

```javascript
// レスポンス
{
  "serverUrl": "http://localhost:3011",
  "defaultWidth": 512,
  "defaultHeight": 512,
  "availableServices": [...]
}
```

### GET /api/services

利用可能なAIサービス一覧

```javascript
// レスポンス
{
  "image": [
    {
      "id": "t2i-kamui-seedream-v4",
      "name": "Seedream V4",
      "type": "image",
      "description": "High quality image generation"
    }
  ],
  "video": [...]
}
```

## 🎯 イベント

### onControlsToggle

UI開閉時に呼ばれるコールバック

```javascript
const chocoDrop = createChocoDrop(scene, {
  onControlsToggle: (disabled) => {
    // UIが開いている間はカメラコントロールを無効化
    controls.enabled = !disabled;
  }
});
```

### カスタムイベント

```javascript
// 生成完了イベント
chocoDrop.client.addEventListener('generation-complete', (event) => {
  console.log('Generated:', event.detail);
});

// オブジェクト追加イベント
chocoDrop.sceneManager.addEventListener('object-added', (event) => {
  console.log('Added object:', event.detail.objectId);
});
```

## 🔧 カスタマイズ

### カスタムレンダリング

```javascript
const chocoDrop = createChocoDrop(scene, {
  sceneOptions: {
    customRenderer: (imageUrl, position) => {
      // カスタム3Dオブジェクト生成ロジック
      const geometry = new THREE.PlaneGeometry(2, 2);
      const texture = new THREE.TextureLoader().load(imageUrl);
      const material = new THREE.MeshBasicMaterial({ map: texture });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(position.x, position.y, position.z);
      return mesh;
    }
  }
});
```

### カスタムUI

```javascript
const chocoDrop = createChocoDrop(scene, {
  uiOptions: {
    triggerKey: '@',           // トリガーキー変更
    theme: 'dark',             // テーマ
    position: 'bottom-right',  // 位置
    customStyles: {            // カスタムCSS
      backgroundColor: '#1a1a1a',
      borderRadius: '10px'
    }
  }
});
```

## 🚨 エラーハンドリング

```javascript
try {
  const result = await chocoDrop.client.generateImage('test prompt');
  if (!result.success) {
    console.error('Generation failed:', result.error);
  }
} catch (error) {
  console.error('Network error:', error);
}
```

## 🧪 開発・テスト

### デバッグモード

```javascript
// デバッグログ有効化
const chocoDrop = createChocoDrop(scene, {
  debug: true
});

// または環境変数
DEBUG=chocodrop:* npm run dev
```

### モックモード

```javascript
// AI生成をモックで置き換え
const chocoDrop = createChocoDrop(scene, {
  client: new MockChocoDropClient()
});
```

## 📝 TypeScript 型定義

```typescript
interface ChocoDropOptions {
  camera?: THREE.Camera;
  renderer?: THREE.WebGLRenderer;
  serverUrl?: string;
  client?: ChocoDropClient;
  onControlsToggle?: (disabled: boolean) => void;
  sceneOptions?: SceneManagerOptions;
  uiOptions?: CommandUIOptions;
}

interface GenerationResult {
  success: boolean;
  imageUrl?: string;
  videoUrl?: string;
  localPath?: string;
  error?: string;
  metadata?: Record<string, any>;
}
```