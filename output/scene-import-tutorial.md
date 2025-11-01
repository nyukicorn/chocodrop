# シーン取り込みチュートリアル（初版）

このドキュメントは、任意の Three.js シーンを ChocoDrop PWA ランチャーへ取り込み、WebXR で動作させるための最小手順を示します。

## 1. 前提条件
- Node.js 18 以上
- ChocoDrop リポジトリ最新版（PWA ブランチ）
- 取り込みたい Three.js シーン（`scene.json` あるいは任意の GLTF/GLB）
- Quest 3 など WebXR 対応デバイス、または Chrome の WebXR Emulator

## 2. シーンアセットの配置
1. アセットを `public/imported-scenes/` 以下に配置します。
2. GLTF の場合、関連テクスチャも同ディレクトリに置き、`import-map.json` などを利用する場合はパスを相対に整えます。

```
public/
  imported-scenes/
    sample-room.glb
    textures/
      wall_albedo.png
```

## 3. 設定ファイルの作成
- `public/imported-scenes/configs.json`（例）を作成し、シーンごとのメタデータを記載します。

```json
[
  {
    "id": "sample-room",
    "label": "サンプルルーム",
    "type": "gltf",
    "path": "/imported-scenes/sample-room.glb",
    "initialCamera": {
      "position": [0, 1.6, 3.5],
      "lookAt": [0, 1.4, 0]
    }
  }
]
```

## 4. immersive-launcher で読み込む
```js
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

async function loadImportedScene(sceneId) {
  const response = await fetch('/imported-scenes/configs.json', { cache: 'no-store' });
  const configs = await response.json();
  const target = configs.find(item => item.id === sceneId);
  if (!target) throw new Error('scene not found');

  if (target.type === 'gltf') {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(target.path);
    return gltf.scene;
  }

  throw new Error('unsupported scene type');
}
```

`createChocoDrop` 呼び出し前に、既存の `scene` を `await loadImportedScene(sceneId)` の戻り値で差し替え、カメラ位置を `initialCamera` で更新します。

## 5. XR セッションで確認
1. `HOST=0.0.0.0 PORT=3011 CLIENT_SERVER_URL=http://<IP>:3011 npm run dev`
2. ブラウザで `http://127.0.0.1:3011/immersive.html?scene=sample-room`
3. XR セッションを起動し、シーンが正しく表示されることを確認します。

## 6. ブックマークレットとの連携（将来設計）
- ブックマークレットから現在の URL・シーン設定を JSON として PWA に送信し、`configs.json` に追記する API を用意する。
- 取り込み後は XR 内で UI を表示し、生成結果をそのシーンに配置できるようにする。

---
改訂予定: UI からのシーン選択、OPFS への設定保存、クラウド同期など。
