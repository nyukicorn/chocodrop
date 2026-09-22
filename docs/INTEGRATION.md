# ChocoDrop 統合ガイド

ChocoDrop を自分のプロジェクトに統合する方法を、ユースケース別に解説します。

## 📋 目次

- [統合方法の選び方](#統合方法の選び方)
- [Vanilla HTML で使う（daemon + SDK）](#vanilla-html-で使うdaemon--sdk)
- [npm プロジェクトで使う](#npm-プロジェクトで使う)
- [Three.js サイトで使う](#threejs-サイトで使う)
- [React Three Fiber で使う](#react-three-fiber-で使う)
- [トラブルシューティング](#トラブルシューティング)

---

## 統合方法の選び方

あなたのプロジェクトに最適な統合方法を選びましょう：

| 使い方 | 適している人 | API | daemon 必要？ |
|--------|------------|-----|--------------|
| [Vanilla HTML](#vanilla-html-で使うdaemon--sdk) | CDNから直接Three.jsを使いたい | `window.chocodrop` | ✅ 必要 |
| [npm プロジェクト](#npm-プロジェクトで使う) | Vite/Webpackでビルドしたい | `createChocoDrop()` | ❌ 不要 |
| [ブックマークから注入](#threejs-サイトで使う) | Three.js を使っている外部サイトに注入したい | `window.chocodrop` | ✅ 必要 |
| [React Three Fiber](#react-three-fiber-で使う) | Reactを使っている | `createChocoDrop()` | ❌ 不要 |

---

## Vanilla HTML で使う（daemon + SDK）

**こんな人におすすめ**:
- ビルドステップなしで使いたい
- CDNから直接Three.jsを読み込みたい
- すぐに試したい

### 前提条件

ChocoDrop daemon を起動します：

```bash
pnpm dlx @chocodrop/daemon@1.0.4-alpha.0
```

デーモンが起動すると `http://127.0.0.1:43110` で SDK が配信されます。

### 最小限のコード例

```html
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>ChocoDrop + Three.js</title>
</head>
<body>
    <!-- Step 1: THREE.js Import Map -->
    <script type="importmap">
    {
        "imports": {
            "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
            "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
        }
    }
    </script>

    <!-- Step 2: ChocoDrop SDK -->
    <script src="http://127.0.0.1:43110/sdk.js"></script>

    <!-- Step 3: Your Scene -->
    <script type="module">
        import * as THREE from 'three';
        import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

        // Three.js setup
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer();
        renderer.setSize(innerWidth, innerHeight);
        document.body.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        camera.position.z = 5;

        // ChocoDrop integration
        await window.chocodrop.ready();
        await window.chocodrop.attach(scene, {
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
    </script>
</body>
</html>
```

### API リファレンス

#### `window.chocodrop.ready()`

daemon との疎通を確認します。

```javascript
await window.chocodrop.ready();
// ✅ デーモンが起動している
// ❌ 起動していない場合は Toast UI が表示される
```

#### `window.chocodrop.attach(scene, options)`

Three.js シーンに ChocoDrop を統合します。

**パラメーター**:
- `scene` (THREE.Scene): 対象シーン（必須）
- `options.camera` (THREE.Camera): カメラ（必須）
- `options.renderer` (THREE.WebGLRenderer): レンダラー（必須）
- `options.onControlsToggle` (Function): UI開閉時のコールバック

**戻り値**:
```javascript
const result = await window.chocodrop.attach(scene, options);
// result.reload() - 設定のリロード
```

#### `window.chocodrop.reload()`

daemon の設定を再読み込みします。

```javascript
const result = await window.chocodrop.reload();
console.log(result); // { ok: true, message: "Configuration reloaded" }
```

### サンプルコード

- [最小限の例](../examples/vanilla-threejs/minimal-example.html)
- [完全な例（UI付き）](../examples/vanilla-threejs/basic-integration.html)

---

## npm プロジェクトで使う

**こんな人におすすめ**:
- Vite、Webpack、Parcel などを使っている
- npm でパッケージ管理したい
- TypeScript を使いたい

### インストール

```bash
npm install chocodrop three
```

### 基本的な使い方

```javascript
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createChocoDrop } from 'chocodrop';

// Three.js setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
camera.position.z = 5;

// ChocoDrop integration
const chocoDrop = createChocoDrop(scene, {
    camera: camera,
    renderer: renderer,
    serverUrl: null,  // サーバーレスモード
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
```

### API リファレンス

#### `createChocoDrop(scene, options)`

Three.js シーンに ChocoDrop を統合します。

**パラメーター**:
- `scene` (THREE.Scene): 対象シーン（必須）
- `options.camera` (THREE.Camera): カメラ（必須）
- `options.renderer` (THREE.WebGLRenderer): レンダラー（必須）
- `options.serverUrl` (string | null): サーバーURL（`null` でサーバーレス）
- `options.enableServerHealthCheck` (boolean): サーバーヘルスチェックを有効化
- `options.skipServiceDialog` (boolean): サービス設定ダイアログをスキップ
- `options.onControlsToggle` (Function): UI開閉時のコールバック
- `options.sceneOptions` (Object): SceneManager への追加オプション
- `options.uiOptions` (Object): CommandUI への追加オプション

**戻り値**:
```javascript
const chocoDrop = createChocoDrop(scene, options);
// chocoDrop.client - ChocoDropClient インスタンス
// chocoDrop.sceneManager - SceneManager インスタンス
// chocoDrop.ui - CommandUI インスタンス
// chocoDrop.dispose() - クリーンアップ
```

### Vite プロジェクトの例

**package.json**:
```json
{
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "three": "^0.170.0",
    "chocodrop": "^1.0.3-alpha.0"
  },
  "devDependencies": {
    "vite": "^5.0.0"
  }
}
```

**main.js**:
```javascript
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createChocoDrop } from 'chocodrop';

// Three.js setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
camera.position.z = 5;

// ChocoDrop integration
createChocoDrop(scene, {
    camera,
    renderer,
    serverUrl: null,
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
```

**index.html**:
```html
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>My ChocoDrop App</title>
</head>
<body>
    <script type="module" src="/main.js"></script>
</body>
</html>
```

### TypeScript サポート

ChocoDrop は TypeScript の型定義を含んでいます：

```typescript
import * as THREE from 'three';
import { createChocoDrop, type CreateChocoDropOptions } from 'chocodrop';

const options: CreateChocoDropOptions = {
    camera: camera,
    renderer: renderer,
    serverUrl: null,
    onControlsToggle: (disabled: boolean) => {
        controls.enabled = !disabled;
    }
};

const chocoDrop = createChocoDrop(scene, options);
```

---

## Three.js サイトで使う

**こんな人におすすめ**:
- グローバルにシーンを公開しているThree.jsページで試したい
- 自分のコードを変更する前に接続を確認したい

ブックマークバーに登録したボタンをクリックすると、対応するThree.jsページへChocoDrop UIを読み込みます。
※技術的には「ブックマークレット (bookmarklet)」と呼ばれる機能です

### セットアップ

1. ChocoDrop daemon を起動：
   ```bash
   pnpm dlx @chocodrop/daemon@1.0.4-alpha.0
   ```

2. ブックマークページを開く：
   - [Bookmarklet v2](https://nyukicorn.github.io/chocodrop/examples/bookmarklet-v2.html)

3. 「🍫 ChocoDropを登録」ボタンをブックマークバーへドラッグ

4. Three.js を使っているページでブックマークをクリック

> ページのグローバル変数として`scene` / `camera` / `renderer`を参照できる場合に接続します。シーンを検出できないページでは、その理由を表示して終了します。

### 対応サイト例

- `scene` / `camera` / `renderer`をグローバルに公開した自分のThree.jsサイト
- 同じ条件を満たす検証用ページ

### セキュリティ

- ✅ daemonとはローカル (127.0.0.1) で通信
- ✅ UI runtimeはChocoDropのGitHub Pagesから読込
- ✅ オープンソース

### 制限事項

- ⚠️ ES Modules内部に閉じたシーンは自動検出できない
- ⚠️ Content Security Policyで外部runtimeやローカル通信が制限される場合がある
- ⚠️ Three.js以外の3Dエンジンには接続しない

---

## React Three Fiber で使う

**こんな人におすすめ**:
- React Three Fiber (@react-three/fiber) を使っている
- React のエコシステムで開発したい

### インストール

```bash
npm install chocodrop three @react-three/fiber
```

### 基本的な使い方

```jsx
import React, { useRef, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { createChocoDrop } from 'chocodrop';

function Scene() {
    const sceneRef = useRef();
    const cameraRef = useRef();
    const rendererRef = useRef();

    useEffect(() => {
        if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;

        const chocoDrop = createChocoDrop(sceneRef.current, {
            camera: cameraRef.current,
            renderer: rendererRef.current,
            serverUrl: null,
            onControlsToggle: (disabled) => {
                // OrbitControls の有効/無効を切り替え
                console.log('Controls disabled:', disabled);
            }
        });

        return () => {
            chocoDrop.dispose?.();
        };
    }, []);

    return (
        <>
            <OrbitControls />
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 5]} />
            {/* あなたの3Dオブジェクト */}
        </>
    );
}

export default function App() {
    return (
        <Canvas>
            <Scene />
        </Canvas>
    );
}
```

### サンプルコード

- [React Three Fiber の例](../examples/react-three-fiber/)

---

## トラブルシューティング

### daemon が起動していない

**症状**: Toast UI が表示される「ChocoDrop が起動していません」

**解決策**:
```bash
pnpm dlx @chocodrop/daemon@1.0.4-alpha.0
```

### CORS エラー

**症状**: ブラウザコンソールに `Access-Control-Allow-Origin` エラー

**解決策**: `~/.config/chocodrop/allowlist.json` で許可リストを設定

```json
{
  "origins": [
    "http://localhost:*",
    "http://127.0.0.1:*",
    "https://your-site.com"
  ]
}
```

### THREE.js バージョン不一致

**症状**: `THREE is not defined` エラー

**解決策**:
```javascript
// バージョン確認
console.log(THREE.REVISION);
// 推奨: r170 (0.170.0)
```

### SDK 読み込みエラー

**症状**: `chocodrop is not defined`

**解決策**:
1. daemon が起動しているか確認: `http://127.0.0.1:43110/v1/health`
2. SDK 読み込みタイミングを確認（`<script type="module">` の前に配置）

### npm パッケージのインストールエラー

**症状**: `npm install chocodrop` が失敗する

**解決策**:
```bash
# Node.js バージョン確認（16.0.0 以上が必要）
node --version

# キャッシュクリア
npm cache clean --force
npm install chocodrop
```

---

## 関連ドキュメント

- [README](../README.md) - プロジェクト概要
- [API リファレンス](./API.md) - 詳細な API ドキュメント
- [セットアップガイド](./SETUP.md) - インストール手順
- [トラブルシューティング](./TROUBLESHOOTING.md) - 問題解決

---

## フィードバック

このドキュメントに関する質問や改善提案は、[GitHub Issues](https://github.com/nyukicorn/chocodrop/issues) でお気軽にお寄せください。
