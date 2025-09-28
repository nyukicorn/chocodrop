# Vanilla Three.js + ChocoDrop

標準的な Three.js プロジェクトに ChocoDrop を統合する例です。

## 📁 ファイル構成

```
vanilla-threejs/
├── README.md              # このファイル
├── advanced-example.html  # 高度な統合例
└── minimal-example.html   # 最小限の統合例
```

## 🚀 最小限の統合例

### minimal-example.html

```html
<!DOCTYPE html>
<html>
<head>
    <title>ChocoDrop - Minimal Three.js Example</title>
    <style>
        body { margin: 0; padding: 0; overflow: hidden; }
        canvas { display: block; }
    </style>
</head>
<body>
    <script type="importmap">
    {
        "imports": {
            "three": "https://unpkg.com/three@0.170.0/build/three.module.js",
            "three/addons/": "https://unpkg.com/three@0.170.0/examples/jsm/",
            "chocodrop": "./src/index.js"
        }
    }
    </script>

    <script type="module">
        import * as THREE from 'three';
        import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
        import { createChocoDrop } from 'chocodrop';

        // 基本的な Three.js セットアップ
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer();

        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        camera.position.z = 5;

        // 照明
        const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(1, 1, 1);
        scene.add(directionalLight);

        // ChocoDrop 統合
        const chocoDrop = createChocoDrop(scene, {
            camera,
            renderer,
            serverUrl: 'http://localhost:3011',
            onControlsToggle: (disabled) => {
                controls.enabled = !disabled;
            }
        });

        // レンダーループ
        function animate() {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }
        animate();

        // ウィンドウリサイズ対応
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // 使用例
        console.log('ChocoDrop ready! Press @ key to start');

        // プログラムからの操作例
        window.demo = {
            generateDragon: () => chocoDrop.client.generateImage('dragon in fantasy style'),
            generateVideo: () => chocoDrop.client.generateVideo('flowing water'),
            executeCommand: (cmd) => chocoDrop.client.executeCommand(cmd),
            clearAll: () => chocoDrop.sceneManager.clearAll()
        };
    </script>

    <!-- 使用ガイド -->
    <div style="position: fixed; top: 10px; left: 10px; color: white; background: rgba(0,0,0,0.7); padding: 10px; border-radius: 5px; font-family: Arial;">
        <h3>ChocoDrop + Three.js</h3>
        <p><strong>@キー</strong> - コマンドUI起動</p>
        <p><strong>コンソール例:</strong></p>
        <ul>
            <li>demo.generateDragon()</li>
            <li>demo.executeCommand('桜を中央に')</li>
            <li>demo.clearAll()</li>
        </ul>
    </div>
</body>
</html>
```

## 🎮 基本的な使い方

### 1. 初期化パターン

```javascript
// パターン1: 基本初期化
const chocoDrop = createChocoDrop(scene, {
    camera,
    renderer
});

// パターン2: カスタムサーバーURL
const chocoDrop = createChocoDrop(scene, {
    camera,
    renderer,
    serverUrl: 'http://localhost:3011'
});

// パターン3: 詳細オプション
const chocoDrop = createChocoDrop(scene, {
    camera,
    renderer,
    serverUrl: 'http://localhost:3011',
    onControlsToggle: (disabled) => {
        controls.enabled = !disabled;
    },
    sceneOptions: {
        defaultScale: 2.0,
        positionOffset: { y: 1 }
    },
    uiOptions: {
        theme: 'dark',
        position: 'bottom-right'
    }
});
```

### 2. プログラム制御

```javascript
// 画像生成
const result = await chocoDrop.client.generateImage('beautiful landscape', {
    width: 1024,
    height: 1024,
    service: 't2i-kamui-seedream-v4'
});

if (result.success) {
    console.log('Generated:', result.imageUrl);
}

// 動画生成
const videoResult = await chocoDrop.client.generateVideo('flowing river', {
    duration: 5,
    aspect_ratio: '16:9',
    resolution: '720p'
});

// 自然言語コマンド
await chocoDrop.client.executeCommand('ドラゴンを右上に大きく配置');

// シーン管理
chocoDrop.sceneManager.clearAll(); // 全削除
const objects = chocoDrop.sceneManager.getObjects(); // オブジェクト一覧
```

## 🎨 カスタマイズ例

### カスタムマテリアル

```javascript
const chocoDrop = createChocoDrop(scene, {
    camera,
    renderer,
    sceneOptions: {
        customRenderer: (imageUrl, position, metadata) => {
            const geometry = new THREE.PlaneGeometry(2, 2);
            const texture = new THREE.TextureLoader().load(imageUrl);

            // カスタムシェーダーマテリアル
            const material = new THREE.ShaderMaterial({
                uniforms: {
                    map: { value: texture },
                    time: { value: 0 }
                },
                vertexShader: `
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform sampler2D map;
                    uniform float time;
                    varying vec2 vUv;
                    void main() {
                        vec2 uv = vUv + sin(time + vUv.y * 10.0) * 0.01;
                        gl_FragColor = texture2D(map, uv);
                    }
                `
            });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(position.x, position.y, position.z);
            return mesh;
        }
    }
});

// アニメーションループでシェーダー更新
function animate() {
    const time = Date.now() * 0.001;
    scene.traverse((child) => {
        if (child.material && child.material.uniforms && child.material.uniforms.time) {
            child.material.uniforms.time.value = time;
        }
    });
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}
```

### イベント処理

```javascript
// カスタムイベントリスナー
chocoDrop.client.addEventListener('generation-start', (event) => {
    console.log('Generation started:', event.detail);
    showLoadingIndicator();
});

chocoDrop.client.addEventListener('generation-complete', (event) => {
    console.log('Generation completed:', event.detail);
    hideLoadingIndicator();
});

chocoDrop.sceneManager.addEventListener('object-added', (event) => {
    console.log('Object added:', event.detail.objectId);
    // カスタム処理
});

// UI状態監視
chocoDrop.ui.addEventListener('show', () => {
    console.log('UI opened');
    pauseBackgroundAnimation();
});

chocoDrop.ui.addEventListener('hide', () => {
    console.log('UI closed');
    resumeBackgroundAnimation();
});
```

## 🔧 高度な統合

### マルチシーン対応

```javascript
const scenes = [
    new THREE.Scene(), // メインシーン
    new THREE.Scene(), // UIシーン
    new THREE.Scene()  // エフェクトシーン
];

const chocoDrops = scenes.map(scene =>
    createChocoDrop(scene, {
        camera,
        renderer,
        sceneOptions: { sceneId: scene.uuid }
    })
);

function render() {
    // マルチパスレンダリング
    scenes.forEach((scene, index) => {
        renderer.render(scene, cameras[index]);
    });
}
```

### WebXR統合

```javascript
import { VRButton } from 'three/addons/webxr/VRButton.js';

// WebXR対応
renderer.xr.enabled = true;
document.body.appendChild(VRButton.createButton(renderer));

const chocoDrop = createChocoDrop(scene, {
    camera,
    renderer,
    sceneOptions: {
        vrMode: true,
        handTracking: true
    }
});

// VRコントローラー対応
function setupVRControls() {
    const controller1 = renderer.xr.getController(0);
    const controller2 = renderer.xr.getController(1);

    controller1.addEventListener('selectstart', (event) => {
        chocoDrop.ui.show(); // VRで手動UI表示
    });
}
```

## 📦 パッケージマネージャー統合

### npm/yarn プロジェクト

```bash
# プロジェクト初期化
npm init -y

# 依存関係追加
npm install three chocodrop

# 開発依存関係
npm install -D vite

# package.json scripts
{
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  }
}
```

### ES Modules

```javascript
// main.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createChocoDrop } from 'chocodrop';

// Three.js セットアップ
const scene = new THREE.Scene();
// ... 初期化コード

// ChocoDrop 統合
const chocoDrop = createChocoDrop(scene, {
    camera,
    renderer
});

export { chocoDrop };
```

## 🚨 トラブルシューティング

### 一般的な問題

1. **モジュール読み込みエラー**
```html
<!-- importmap が正しく設定されているか確認 -->
<script type="importmap">
{
    "imports": {
        "three": "https://unpkg.com/three@0.170.0/build/three.module.js",
        "chocodrop": "./src/index.js"
    }
}
</script>
```

2. **CORS エラー**
```javascript
// ローカルサーバーを使用
python -m http.server 8000
# または
npx serve .
```

3. **Three.js バージョン不一致**
```javascript
// バージョン確認
console.log(THREE.REVISION);
// 推奨: r160 以上
```

### デバッグ方法

```javascript
// デバッグモード有効化
const chocoDrop = createChocoDrop(scene, {
    camera,
    renderer,
    debug: true
});

// コンソールログ確認
window.chocoDrop = chocoDrop; // グローバル変数化
console.log('ChocoDrop instance:', chocoDrop);

// 3D オブジェクト確認
scene.traverse((child) => {
    console.log('Scene child:', child);
});
```

## 📚 参考リンク

- [Three.js 公式ドキュメント](https://threejs.org/docs/)
- [Three.js Examples](https://threejs.org/examples/)
- [ChocoDrop API リファレンス](../docs/API.md)