# ChocoDrop 🍫

> **自然言語で3D空間にAIコンテンツをドロップ**  
> あらゆる3D空間に、AIコンテンツをちょこんとドロップ

**🌐 [ホームページ](https://nyukicorn.github.io/chocodrop/) | 🎮 [デモを試す](https://nyukicorn.github.io/chocodrop/examples/basic/index.html)**

---

## ChocoDrop って何？

どんなThree.jsシーンも、AI搭載のコンテンツスタジオに変身：

```javascript
// 自然言語で話しかけるだけ
"猫の置物を右上に作って" → AIが猫を生成して右上に配置
"桜を中央に配置" → 桜が瞬時に現れる
"青いボールを大きくして" → 青いボールが拡大
```

**対応環境:** Three.js、React Three Fiber、A-Frame、Next.js、HTML

---

## 🚀 始め方は簡単

### 1. HTMLを使っている場合（分からない場合はこちらをお試しください）
```bash
git clone https://github.com/nyukicorn/chocodrop.git
```

```html
<script src="https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.min.js"></script>
<script src="./chocodrop/dist/chocodrop.umd.min.js"></script>
<script>
  // あなたの既存のThree.jsシーン
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(/* ... */);
  const renderer = new THREE.WebGLRenderer();

  // ChocoDrop追加（1行だけ！）
  ChocoDrop.createChocoDrop(scene, { camera, renderer });
</script>
```

### 2. npm/Vite/Reactを使っている場合
```bash
npm install chocodrop
```

```javascript
import { createChocoDrop } from 'chocodrop';

// あなたの既存のThree.jsシーン
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(/* ... */);
const renderer = new THREE.WebGLRenderer();

// ChocoDrop追加（1行だけ！）
createChocoDrop(scene, { camera, renderer });
```

**それだけ！** 3D空間に向かって自然に話しかけるだけで、AIで画像や動画を生成して「ちょこっと」配置、インポートして「ちょこんと」設置できます。

---

## ✨ 特徴

| Feature | Description |
|---------|-------------|
| 🎯 **自然言語で3D配置** | 「右上」「中央」「カメラの後ろ」など日本語で指定 |
| 🎨 **複数のAIモデル対応** | Flux、DALL-E、Stable Diffusion、動画生成 |
| 🔄 **リアルタイム編集** | 配置後もサイズ、位置、エフェクトを変更可能 |
| 📦 **フレームワーク自由** | どんなThree.js環境でも動作 |
| 🌐 **MCP統合** | 拡張可能なAIモデルサポート |
| 🎮 **直感的UI** | @キー起動、学習コスト不要 |

---

## 🌟 ChocoDrop の安心設計

### 💫 自由に実験、安心して創作
ChocoDrop は**クリエイティブな実験を自由に楽しめる**ように設計されています：

✨ **シーン内編集のみ** - 元のファイルは一切変更されません  
✨ **リアルタイム実験** - 「もしピンクだったら？」「オーロラエフェクトは？」気軽に試せます  
✨ **元データ保護** - インポートした画像・動画は絶対に変更されません  
✨ **クリーンスレート** - ページリロードで元の状態に戻ります  

### 🎬 作品は保存、編集は実験
- **🎥 AIで生成した画像・動画** → しっかり保存されます
- **🎨 色変更・エフェクト・レイアウト** → シーン内でのみ有効
- **📁 インポートしたファイル** → 元ファイルは完全に保護

**つまり：** 作品制作はしっかり、編集実験は自由に！

「ちょっと試してみたい」「どんな感じになるかな？」という好奇心を、何の心配もなく満たせるツールです。

---

## 📖 完全なサンプル

### 基本のHTMLサンプル
```html
<!DOCTYPE html>
<html>
<head>
    <style>
        body { margin: 0; background: #000; overflow: hidden; }
        #container { width: 100vw; height: 100vh; }
    </style>
</head>
<body>
    <div id="container"></div>

    <!-- Three.js -->
    <script src="https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.170.0/examples/js/controls/OrbitControls.js"></script>

    <!-- ChocoDrop -->
    <script src="https://cdn.jsdelivr.net/npm/chocodrop@latest/dist/chocodrop.umd.min.js"></script>

    <script>
        // Scene setup
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a2e);

        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 2, 5);

        const renderer = new THREE.WebGLRenderer();
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.getElementById('container').appendChild(renderer.domElement);

        // Controls
        const controls = new THREE.OrbitControls(camera, renderer.domElement);

        // ChocoDrop initialization
        const chocoDrop = ChocoDrop.createChocoDrop(scene, {
            camera: camera,
            renderer: renderer,
            onControlsToggle: (disabled) => {
                controls.enabled = !disabled;
            }
        });

        // Render loop
        function animate() {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }
        animate();

        console.log('✅ ChocoDrop ready! Press @ key to start.');
    </script>
</body>
</html>
```

### React Three Fiberサンプル
```jsx
import React, { useRef, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Box, Sphere } from '@react-three/drei';
import { createChocoDrop } from 'chocodrop';

/**
 * ChocoDrop統合コンポーネント
 */
function ChocoDropIntegration() {
  const { scene, camera, gl } = useThree();
  const chocoDropRef = useRef(null);
  const controlsRef = useRef(null);

  useEffect(() => {
    // ChocoDrop初期化
    const chocoDrop = createChocoDrop(scene, {
      camera,
      renderer: gl,
      onControlsToggle: (disabled) => {
        // UI開閉時にOrbitControlsを制御
        if (controlsRef.current) {
          controlsRef.current.enabled = !disabled;
        }
      }
    });

    chocoDropRef.current = chocoDrop;

    // クリーンアップ
    return () => {
      chocoDrop.dispose();
    };
  }, [scene, camera, gl]);

  return (
    <>
      <OrbitControls ref={controlsRef} />
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} />
      
      <Box position={[-2, 0, 0]}>
        <meshStandardMaterial color="orange" />
      </Box>
      
      <Sphere position={[2, 0, 0]}>
        <meshStandardMaterial color="hotpink" />
      </Sphere>
    </>
  );
}

/**
 * メインアプリケーション
 */
function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas camera={{ position: [0, 0, 5] }}>
        <ChocoDropIntegration />
      </Canvas>
    </div>
  );
}

export default App;
```

---

## 🎯 自然言語でコマンド

### 日本語コマンド（メイン）
```javascript
"ドラゴンを右上に作って"              // → AIがドラゴンを生成して右上に配置
"桜を中央に配置"                    // → 桜が中央に現れる
"大きくして"                       // → 選択オブジェクトを拡大
"全て削除"                         // → 生成したコンテンツを全消去
"青い猫を左下に"                    // → 青い猫を左下に配置
"キラキラエフェクトを追加"            // → 選択オブジェクトにエフェクト
```

### 英語コマンドも対応
```javascript
"右上にドラゴンを追加"                 // → AIがドラゴンを生成＋右上配置
"中央に桜を配置"                      // → 桜が中央に現れる
"それを大きくして"                    // → 選択オブジェクトを拡大
"全部削除"                          // → 全コンテンツを消去
```

---

## 🎮 詳細機能ガイド

### 1. 新規作成機能
自然言語で3Dオブジェクトや動画を生成します。

**画像/3Dオブジェクト生成:**
```
猫を作って
青い球体を右に配置
魔法の森の背景画像
```

**動画生成:**
```
流れる川の動画
踊る猫のアニメーション
雲が流れる映像を作って
```

### 2. インポート機能
ローカルファイルをシーンに読み込みます。

**使用方法:**
```
画像をインポート
動画を読み込み
ファイルを選択して配置
```

**対応ファイル形式:**
- 画像: JPG, PNG, GIF, WebP
- 動画: MP4, WebM, MOV

### 3. Modify機能（オブジェクト編集）

**⚠️ 重要:** Modify機能を使用する前に、必ずオブジェクトを選択してください！

#### オブジェクト選択方法
1. シーン内の編集したいオブジェクトをクリック
2. オブジェクトが青い枠線で囲まれることを確認
3. この状態でModifyコマンドを実行

#### 基本的な編集コマンド

**色の変更:**
```
赤に変更
青色にして
緑に塗って
```

**サイズ調整:**
```
大きくして
2倍に拡大
小さく縮小
```

**移動・配置:**
```
左に移動
右上に配置
中央に寄せて
```

**向きの変更（隠れた便利機能！）:**
```
左右反転
上下反転
回転させて
45度回転
```

**特殊効果:**
```
透明にして
半透明に変更
光らせて
ネオン風に
```

#### リサイズハンドル機能
**平面オブジェクト（PlaneGeometry）の場合:**
- オブジェクト選択時に四隅にリサイズハンドル（青い小さな四角）が表示
- ハンドルをドラッグしてリアルタイムでサイズ変更可能
- Shiftキー不要で直感的な操作

#### 方向変更ボタン
選択したオブジェクトに対して、以下の操作が可能：
- **左右反転:** オブジェクトを水平方向に反転
- **上下反転:** オブジェクトを垂直方向に反転
- **回転:** 指定角度での回転（デフォルト45度）

### 4. 削除機能

**個別削除:**
```
[削除] オブジェクト名
選択したオブジェクトを削除
```

**一括削除:**
```
全て削除
シーンをクリア
```

### 5. 音声・動画コントロール機能

**動画オブジェクトの場合:**
- 自動的に音声コントロールボタン（🔊）が表示
- ボタンクリックで音量スライダーが出現
- ミュート/ミュート解除の切り替え
- 音量レベルの細かい調整（0-100%）

**操作方法:**
1. 動画オブジェクトにマウスオーバーで音声ボタン表示
2. ボタンクリックで音量スライダー表示
3. スライダーで音量調整
4. 外側クリックで非表示

### 6. 選択システム詳細

**視覚的フィードバック:**
- 選択時: 青い枠線表示
- ホバー時: 薄い青のハイライト
- リサイズハンドル: 青い四角マーカー

**選択解除方法:**
- 空白部分をクリック
- Escキーで選択解除
- 別のオブジェクトを選択

---

## 🔧 API リファレンス（開発者向け）

### createChocoDrop(scene, options) - メイン関数

**パラメータ:**
```typescript
scene: THREE.Scene              // あなたのThree.jsシーン
options: {
  camera?: THREE.Camera         // カメラ（位置計算用）
  renderer?: THREE.Renderer     // レンダラー（マウス操作用）
  serverUrl?: string           // ChocoDrop サーバーURL（省略可）
  onControlsToggle?: Function  // カメラ制御の切り替えコールバック
  sceneOptions?: Object        // SceneManager の追加オプション
  uiOptions?: Object          // CommandUI の追加オプション
}
```

**戻り値:**
```typescript
{
  client: ChocoDropClient       // AI生成用のHTTPクライアント
  sceneManager: SceneManager    // 3Dシーン管理オブジェクト
  ui: CommandUI                // コマンドUI
}
```

### ChocoDropClient メソッド（AI生成関連）

```javascript
// AI画像生成
await chocoDrop.client.generateImage('魔法の森', {
  width: 1024,
  height: 1024,
  service: 't2i-service'
});

// 自然言語コマンド実行
await chocoDrop.client.executeCommand('青い猫を左に作って');

// 動画生成
await chocoDrop.client.generateVideo('流れる川', {
  duration: 5,
  aspect_ratio: '16:9'
});
```

### SceneManager メソッド（3Dシーン管理）

```javascript
// シーン管理
chocoDrop.sceneManager.clearAll();                    // 全オブジェクトを削除
const objects = chocoDrop.sceneManager.getObjects();  // オブジェクト一覧を取得
chocoDrop.sceneManager.removeObject(objectId);        // 特定オブジェクトを削除
```

### CommandUI メソッド（ユーザーインターフェース）

```javascript
// UI制御
chocoDrop.ui.show();                    // コマンドインターフェースを表示
chocoDrop.ui.hide();                    // コマンドインターフェースを非表示
chocoDrop.ui.toggle();                  // 表示/非表示を切り替え
```

---

## 🛠️ サーバー設定（オプション）

独自のChocoDrop サーバーを動かしたい場合：

```bash
git clone https://github.com/nyukicorn/chocodrop.git
cd chocodrop
npm install
npm start
```

サーバーは `http://localhost:3011` で起動します

**必要環境:**
- Node.js 16以上
- AIモデル用のMCP設定

---



## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🔗 Links

- **GitHub:** https://github.com/nyukicorn/chocodrop
- **Examples:** [examples/](examples/)
- **Issues:** [GitHub Issues](https://github.com/nyukicorn/chocodrop/issues)

---

