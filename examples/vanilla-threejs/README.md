# Vanilla Three.js + ChocoDrop

純粋な Three.js プロジェクトに ChocoDrop を統合する例です。

**対応バージョン**: ChocoDrop v1.0.3-alpha.0（daemon + SDK アーキテクチャ）

## 📁 ファイル構成

```
vanilla-threejs/
├── README.md               # このファイル
├── minimal-example.html    # 最小限の統合例（60行）
└── basic-integration.html  # 完全な統合例（UI付き）
```

## 🚀 クイックスタート

### 前提条件

ChocoDrop daemon が起動している必要があります：

```bash
# ターミナルで実行
npx --yes @chocodrop/daemon@alpha
```

デーモンが起動すると `http://127.0.0.1:43110` でSDKが配信されます。

### 1. 最小限の統合例

`minimal-example.html` をブラウザで開くだけ：

```bash
# ローカルサーバー起動（任意の方法で）
npx serve .
# または
python -m http.server 8000
```

ブラウザで `http://localhost:8000/minimal-example.html` を開く

**特徴**:
- ✅ 60行未満のシンプルなコード
- ✅ CDNからThree.js読み込み
- ✅ daemon SDK経由で統合
- ✅ `@` キーで即座に操作可能

### 2. コードの核心部分

```html
<!DOCTYPE html>
<html>
<head>
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

## 🎮 SDK API リファレンス

### window.chocodrop.ready()

daemon との疎通を確認します。

```javascript
await window.chocodrop.ready();
// ✅ デーモンが起動している
// ❌ 起動していない場合は Toast UI が表示される
```

### window.chocodrop.attach(scene, options)

Three.js シーンに ChocoDrop を統合します。

#### パラメーター

```javascript
await window.chocodrop.attach(scene, {
    camera: THREE.Camera,           // カメラ（必須）
    renderer: THREE.WebGLRenderer,  // レンダラー（必須）
    onControlsToggle: (disabled) => void  // UI開閉時のコールバック
});
```

#### 戻り値

```javascript
const result = await window.chocodrop.attach(scene, options);
// result.reload() - 設定のリロード
```

### window.chocodrop.reload()

daemon の設定を再読み込みします。

```javascript
const result = await window.chocodrop.reload();
console.log(result); // { ok: true, message: "Configuration reloaded" }
```

## 🎨 使用方法

### 基本操作

1. **`@` キー**: コマンドUI起動
2. **自然言語入力**: 「ドラゴンを右上に」「桜を中央に」
3. **Enter**: コマンド実行
4. **Escape**: UI非表示

### 対応コマンド例

> ⚠️ **注意**: 自然言語でのAI生成コマンドは daemon のみでは使えません。
> 以下のコマンドは、リポジトリ clone + KAMUI Code 設定が必要です。

```javascript
// AI生成と配置（要KAMUI Code設定）
"ドラゴンを右上に作って"
"桜を中央に配置"
"青い猫を左下に小さく"

// 編集（daemon でも可能）
"大きくして"
"位置を変更"
"削除"
```

### 位置指定

| 日本語 | 英語 | 座標 |
|--------|------|------|
| 右上 | top-right | x:5, y:5, z:-10 |
| 左上 | top-left | x:-5, y:5, z:-10 |
| 右下 | bottom-right | x:5, y:-5, z:-10 |
| 左下 | bottom-left | x:-5, y:-5, z:-10 |
| 中央 | center | x:0, y:0, z:-10 |

## 🔧 カスタマイズ

### THREE.js の読み込み制御

企業ネットワークでCDNアクセスが制限されている場合:

```html
<script>
  // CDNを無効化（ローカルフォールバックのみ使用）
  window.chocodropConfig = {
    allowCdn: false  // default: true
  };
</script>
<script src="http://127.0.0.1:43110/sdk.js"></script>
```

### カスタムTHREE.jsソース指定

```html
<script>
  window.chocodropConfig = {
    threeSrc: '/path/to/your/three.module.js'
  };
</script>
<script src="http://127.0.0.1:43110/sdk.js"></script>
```

### THREE.js読み込みの優先順位

1. 既存の `window.THREE`（既に読み込まれている場合）
2. `window.chocodropConfig.threeSrc`（カスタムソース指定時）
3. CDN（`allowCdn: true` の場合、SRI付き安全な読み込み）
4. ローカルフォールバック（`http://127.0.0.1:43110/vendor/three-0.170.0.min.js`）

## 🏗️ プロジェクト統合

### npm プロジェクトで使用

```bash
# プロジェクト初期化
npm init -y

# Three.js インストール
npm install three

# 開発サーバー
npm install -D vite
```

**main.js**:
```javascript
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Three.js setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
// ... setup code

// ChocoDrop integration
// HTMLに <script src="http://127.0.0.1:43110/sdk.js"></script> を追加
await window.chocodrop.ready();
await window.chocodrop.attach(scene, { camera, renderer });
```

**index.html**:
```html
<!DOCTYPE html>
<html>
<head>
    <title>My Three.js Project</title>
</head>
<body>
    <!-- ChocoDrop SDK -->
    <script src="http://127.0.0.1:43110/sdk.js"></script>

    <!-- Your app -->
    <script type="module" src="/main.js"></script>
</body>
</html>
```

## 🚨 トラブルシューティング

### daemon が起動していない

**症状**: Toast UIが表示される「ChocoDrop が起動していません」

**解決策**:
```bash
npx --yes @chocodrop/daemon@alpha
```

### CORSエラー

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

### SDK読み込みエラー

**症状**: `chocodrop is not defined`

**解決策**:
1. daemon が起動しているか確認: `http://127.0.0.1:43110/v1/health`
2. SDK読み込みタイミングを確認（`<script type="module">` の前に配置）

## 🌐 外部サイトでの使用

### Bookmarklet

Three.js公式サイト（https://threejs.org/examples/）などの外部サイトでも動作します：

1. [https://nyukicorn.github.io/chocodrop/examples/bookmarklet-v2.html](https://nyukicorn.github.io/chocodrop/examples/bookmarklet-v2.html) を開く
2. 「🍫 ChocoDrop v2」ボタンをブックマークバーへドラッグ
3. Three.jsのページでブックマークをクリック

**セキュリティ**:
- ✅ ローカル(127.0.0.1)のみと通信
- ✅ 外部への送信なし
- ⚠️ UI表示と操作のみ（AI生成は daemon では使えません）

## 📚 関連ドキュメント

- [ChocoDrop README](../../README.md) - メインドキュメント
- [API リファレンス](../../docs/API.md) - API詳細
- [セットアップガイド](../../docs/SETUP.md) - インストール手順
- [トラブルシューティング](../../docs/TROUBLESHOOTING.md) - 問題解決

## 🔗 参考リンク

- [Three.js 公式ドキュメント](https://threejs.org/docs/)
- [Three.js Examples](https://threejs.org/examples/)
- [ChocoDrop GitHub](https://github.com/nyukicorn/chocodrop)

---

**重要**: このドキュメントは ChocoDrop v1.0.3-alpha.0 の新アーキテクチャ（daemon + SDK）に対応しています。旧バージョン（v1.x の `createChocoDrop()` API）をお探しの方は [docs/OLD_API.md](../../docs/OLD_API.md) をご覧ください。
