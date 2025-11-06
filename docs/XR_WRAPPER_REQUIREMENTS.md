# ChocoDrop XR Wrapper 機能要件定義書

**作成日**: 2025年1月6日
**バージョン**: 1.0.0
**対象**: ユーザーシーンの自動XR化機能

---

## 1. 概要

### 1.1 目的
ユーザーが手持ちのThree.jsシーンをコード変更なしでVR/AR対応にする「XR Wrapper」機能を提供する。

### 1.2 背景
- 現在のChocoDropはWebXR機能を実装済み（`SceneManager/index.js`）
- ブックマークレットによる既存サイトへの注入機能がある
- PWA化が進行中で、Webアプリとしても提供可能
- ユーザーがコードを1行も追加せずにXR化したいというニーズ

### 1.3 スコープ
本要件定義書は以下の3つの主要機能をカバーする：

1. **ローカルシーンXR化**: ユーザーがローカルで開発中のThree.jsシーンをXR化
2. **GitHub Pages XR化**: GitHub PagesのURLを入力してXR化
3. **PWA/Webアプリ提供**: 上記機能をPWA/Webアプリとして提供

---

## 2. 機能要件

### 2.1 コアコンセプト: ゼロコード XR化

**要件ID**: XR-CORE-001
**優先度**: 最高
**説明**: ユーザーのThree.jsシーンに対して、コード変更を一切要求せずにXR機能を提供する。

**実現方法**:
- Three.jsのscene、camera、rendererを自動検出
- 検出したオブジェクトにChocoDropのXR機能をラップ
- ユーザーコードへの侵入を最小限に抑える

**技術的アプローチ**:
```javascript
// 既存のThree.jsオブジェクトを自動検出
const detection = {
  scene: window.scene || findThreeScene(),
  camera: window.camera || findThreeCamera(),
  renderer: window.renderer || findThreeRenderer()
};

// ChocoDropのXR Wrapperを適用
await window.chocodrop.wrapXR(detection);
```

---

### 2.2 ローカルシーンXR化

#### 2.2.1 ブックマークレット方式（既存機能拡張）

**要件ID**: XR-LOCAL-001
**優先度**: 高
**説明**: 既存のブックマークレット機能を拡張し、XR Wrapperを自動適用する。

**機能詳細**:

1. **自動検出**
   - `window.THREE` の存在チェック
   - グローバルスコープから `scene`, `camera`, `renderer` を探索
   - DOM内の `<canvas>` 要素から WebGLRenderer を逆引き

2. **XR有効化**
   - `renderer.xr.enabled = true` を自動設定
   - VR/ARボタンUIを動的に追加
   - 既存のアニメーションループを `setAnimationLoop` に変換

3. **UI要素**
   - 「VRモードに入る」ボタン
   - 「ARモードに入る」ボタン（対応デバイスのみ）
   - XRステータス表示
   - トーストUI（デーモン未起動時）

**実装例**:
```javascript
// bookmarklet-xr.js
(async function() {
  // ChocoDrop SDK読み込み
  await loadChocoDropSDK();

  // Three.jsシーン検出
  const detected = await window.chocodrop.detectScene();

  if (!detected.success) {
    showError('Three.jsシーンが検出できませんでした');
    return;
  }

  // XR Wrapper適用
  await window.chocodrop.wrapXR({
    scene: detected.scene,
    camera: detected.camera,
    renderer: detected.renderer,
    preserveOriginalLoop: true, // 既存のアニメーションループを保持
    uiPosition: 'bottom-right'  // UI配置位置
  });

  showSuccess('XR機能が有効になりました！');
})();
```

#### 2.2.2 Chrome拡張機能方式（新規）

**要件ID**: XR-LOCAL-002
**優先度**: 中
**説明**: ブックマークレットよりも強力な Chrome拡張機能として提供。

**機能詳細**:

1. **ページアクション**
   - Three.jsを使用しているページを自動検出
   - 拡張機能アイコンをクリックでXR化
   - コンテキストメニューから「XR化する」を選択可能

2. **パーミッション**
   - `activeTab`: 現在のタブにアクセス
   - `storage`: 設定保存
   - `webRequest`: Three.jsライブラリ検出

3. **設定画面**
   - 自動XR化のオン/オフ
   - デフォルトXRモード（VR/AR）
   - UIテーマ設定

**manifest.json 例**:
```json
{
  "manifest_version": 3,
  "name": "ChocoDrop XR Wrapper",
  "version": "1.0.0",
  "description": "任意のThree.jsシーンを自動的にVR/AR対応にする",
  "permissions": ["activeTab", "storage"],
  "action": {
    "default_popup": "popup.html",
    "default_icon": "icon.png"
  },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["detector.js", "wrapper.js"],
    "run_at": "document_end"
  }]
}
```

---

### 2.3 GitHub Pages XR化

**要件ID**: XR-GHPAGES-001
**優先度**: 高
**説明**: GitHub PagesのURLを入力すると、そのシーンをiframe内で読み込み、XR化して表示する。

#### 2.3.1 Webアプリケーション UI

**機能詳細**:

1. **URL入力画面**
   ```
   ┌─────────────────────────────────────┐
   │  ChocoDrop XR Wrapper              │
   │                                     │
   │  Three.js シーンのURLを入力:       │
   │  ┌───────────────────────────────┐ │
   │  │ https://example.github.io/... │ │
   │  └───────────────────────────────┘ │
   │                                     │
   │  [ XR化して表示 ]                   │
   └─────────────────────────────────────┘
   ```

2. **プレビュー画面**
   ```
   ┌─────────────────────────────────────┐
   │  ← 戻る  [VRモード] [ARモード]      │
   ├─────────────────────────────────────┤
   │                                     │
   │     ┌─────────────────────────┐     │
   │     │                         │     │
   │     │   Three.jsシーン表示    │     │
   │     │    (iframe内)           │     │
   │     │                         │     │
   │     └─────────────────────────┘     │
   │                                     │
   │  ChocoDropコントロール              │
   │  [@] コマンド入力...                │
   └─────────────────────────────────────┘
   ```

3. **セキュリティ対策**
   - CORS対策: iframe内でのpostMessage通信
   - Content Security Policy対応
   - HTTPS必須（Mixed Content対策）

#### 2.3.2 技術実装

**アーキテクチャ**:
```
┌──────────────────────────────────────┐
│  ChocoDrop XR Wrapper (親ページ)     │
│  - URL入力UI                          │
│  - XR制御UI                           │
│  - postMessage送受信                  │
└──────────┬───────────────────────────┘
           │
           ▼ postMessage
┌──────────────────────────────────────┐
│  ユーザーのThree.jsシーン (iframe)    │
│  - 自動注入スクリプト                 │
│  - Three.js検出                       │
│  - XR Wrapper適用                     │
└──────────────────────────────────────┘
```

**実装手順**:

1. **iframe読み込み**
   ```javascript
   const iframe = document.createElement('iframe');
   iframe.src = userProvidedURL;
   iframe.sandbox = 'allow-scripts allow-same-origin allow-webxr';
   container.appendChild(iframe);
   ```

2. **注入スクリプト**
   ```javascript
   // iframe内で実行
   const script = iframe.contentDocument.createElement('script');
   script.src = 'https://chocodrop-cdn.example.com/xr-injector.js';
   iframe.contentDocument.head.appendChild(script);
   ```

3. **通信プロトコル**
   ```javascript
   // 親ページ → iframe
   iframe.contentWindow.postMessage({
     type: 'CHOCODROP_ENTER_XR',
     mode: 'vr'
   }, '*');

   // iframe → 親ページ
   window.parent.postMessage({
     type: 'CHOCODROP_XR_READY',
     capabilities: { vr: true, ar: false }
   }, '*');
   ```

#### 2.3.3 CORS対策

**課題**:
- GitHub PagesはCORS制限がある
- iframe内のスクリプト注入が制限される可能性

**解決策**:

1. **プロキシサーバー方式**
   ```
   ユーザー → ChocoDrop Proxy → GitHub Pages
   ↓
   Proxy側でスクリプト注入
   ↓
   XR化されたコンテンツを返す
   ```

2. **ブックマークレット併用方式**
   - iframeで開くのではなく、新しいタブで開く
   - ブックマークレットを自動実行するよう案内
   - より安全でシンプル

3. **Service Worker方式**
   ```javascript
   // Service WorkerでリクエストをインターセプトしてXRスクリプトを注入
   self.addEventListener('fetch', event => {
     if (isThreeJsPage(event.request)) {
       event.respondWith(injectXRScript(event.request));
     }
   });
   ```

---

### 2.4 PWA/Webアプリ対応

**要件ID**: XR-PWA-001
**優先度**: 高
**説明**: 上記機能をPWAとして提供し、インストール可能なWebアプリとする。

#### 2.4.1 PWA要件

1. **manifest.json**
   ```json
   {
     "name": "ChocoDrop XR Wrapper",
     "short_name": "ChocoDrop XR",
     "description": "任意のThree.jsシーンをVR/AR対応に",
     "start_url": "/",
     "display": "standalone",
     "background_color": "#0f172a",
     "theme_color": "#60a5fa",
     "icons": [
       {
         "src": "/icons/icon-192.png",
         "sizes": "192x192",
         "type": "image/png"
       },
       {
         "src": "/icons/icon-512.png",
         "sizes": "512x512",
         "type": "image/png"
       }
     ]
   }
   ```

2. **Service Worker**
   - オフラインキャッシュ
   - Three.js CDNリソースのキャッシュ
   - 更新通知

3. **インストールプロンプト**
   ```javascript
   let deferredPrompt;

   window.addEventListener('beforeinstallprompt', (e) => {
     e.preventDefault();
     deferredPrompt = e;
     showInstallButton();
   });
   ```

#### 2.4.2 Webアプリ機能

1. **URL履歴**
   - 過去にXR化したURLを保存
   - ブックマーク機能
   - お気に入り管理

2. **設定**
   - デフォルトXRモード（VR/AR）
   - UI配置
   - キーボードショートカット

3. **共有機能**
   - XR化したシーンのURLを共有
   - QRコード生成
   - ソーシャル共有

---

## 3. 技術仕様

### 3.1 Three.js シーン自動検出

**要件ID**: XR-TECH-001
**優先度**: 最高

#### 検出アルゴリズム

```javascript
/**
 * Three.jsシーンを自動検出する
 */
async function detectThreeJsScene() {
  const detection = {
    success: false,
    scene: null,
    camera: null,
    renderer: null,
    method: null
  };

  // 方法1: グローバル変数から検出
  if (window.scene && window.camera && window.renderer) {
    detection.scene = window.scene;
    detection.camera = window.camera;
    detection.renderer = window.renderer;
    detection.method = 'global';
    detection.success = true;
    return detection;
  }

  // 方法2: THREE.Scene インスタンスを探索
  if (window.THREE) {
    for (const key in window) {
      if (window[key] instanceof window.THREE.Scene) {
        detection.scene = window[key];
        detection.method = 'instance-scan';
        break;
      }
    }
  }

  // 方法3: Canvas要素からWebGLRendererを逆引き
  const canvases = document.querySelectorAll('canvas');
  for (const canvas of canvases) {
    const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
    if (gl) {
      // WebGLRenderingContextから renderer を探す
      const renderer = findRendererByCanvas(canvas);
      if (renderer) {
        detection.renderer = renderer;
        detection.method = 'canvas-reverse';
      }
    }
  }

  // 方法4: アニメーションループからフック
  const originalRAF = window.requestAnimationFrame;
  window.requestAnimationFrame = function(callback) {
    const wrappedCallback = function(time) {
      // コールバック実行前にスタックトレースを解析
      try {
        callback(time);
        // 実行後にThree.jsオブジェクトを探索
        detectFromCallbackScope();
      } catch (e) {
        console.error(e);
      }
    };
    return originalRAF.call(this, wrappedCallback);
  };

  // カメラ検出
  if (!detection.camera && detection.renderer) {
    // renderer.render が呼ばれる際にカメラを検出
    const originalRender = detection.renderer.render;
    detection.renderer.render = function(scene, camera) {
      if (!detection.scene) detection.scene = scene;
      if (!detection.camera) detection.camera = camera;
      return originalRender.call(this, scene, camera);
    };
  }

  detection.success = !!(detection.scene && detection.camera && detection.renderer);
  return detection;
}
```

### 3.2 XR Wrapper 実装

**要件ID**: XR-TECH-002
**優先度**: 最高

#### XR Wrapper API

```javascript
/**
 * ChocoDrop XR Wrapper クラス
 */
class ChocoDropXRWrapper {
  constructor(options = {}) {
    this.scene = options.scene;
    this.camera = options.camera;
    this.renderer = options.renderer;
    this.preserveOriginalLoop = options.preserveOriginalLoop ?? true;
    this.uiPosition = options.uiPosition || 'bottom-right';

    this.xrSession = null;
    this.xrMode = null;
    this.originalAnimationLoop = null;
    this.isWrapped = false;
  }

  /**
   * XR機能を有効化
   */
  async enableXR() {
    if (this.isWrapped) {
      console.warn('XR already enabled');
      return;
    }

    // 既存のアニメーションループを保存
    if (this.preserveOriginalLoop) {
      this.saveOriginalAnimationLoop();
    }

    // renderer.xr を有効化
    if (!this.renderer.xr) {
      console.error('Renderer does not support XR');
      return false;
    }

    this.renderer.xr.enabled = true;

    // UIを追加
    this.createXRUI();

    // XRセッション終了時の処理
    this.renderer.xr.addEventListener('sessionend', () => {
      this.xrSession = null;
      this.xrMode = null;
      this.emit('xr:exit');
    });

    this.isWrapped = true;
    return true;
  }

  /**
   * 既存のアニメーションループを保存
   */
  saveOriginalAnimationLoop() {
    // ユーザーが requestAnimationFrame を使っている場合
    const rafCalls = this.detectRAFCalls();
    if (rafCalls.length > 0) {
      this.originalAnimationLoop = rafCalls[0];
    }
  }

  /**
   * VRモードに入る
   */
  async enterVR() {
    return this.enterXR('vr');
  }

  /**
   * ARモードに入る
   */
  async enterAR() {
    return this.enterXR('ar');
  }

  /**
   * XRモードに入る
   */
  async enterXR(mode = 'vr') {
    if (!this.renderer.xr.enabled) {
      throw new Error('XR not enabled. Call enableXR() first.');
    }

    const sessionMode = mode === 'ar' ? 'immersive-ar' : 'immersive-vr';

    try {
      const session = await navigator.xr.requestSession(sessionMode, {
        requiredFeatures: mode === 'ar' ?
          ['local-floor', 'hit-test'] :
          ['local-floor'],
        optionalFeatures: ['hand-tracking', 'layers']
      });

      await this.renderer.xr.setSession(session);
      this.xrSession = session;
      this.xrMode = mode;

      // 既存のアニメーションループを XR アニメーションループに変換
      this.convertToXRLoop();

      this.emit('xr:entered', { session, mode: sessionMode });
      return true;
    } catch (error) {
      console.error('Failed to enter XR:', error);
      this.emit('xr:error', { error, mode: sessionMode });
      throw error;
    }
  }

  /**
   * 既存のアニメーションループをXRループに変換
   */
  convertToXRLoop() {
    if (this.originalAnimationLoop) {
      // setAnimationLoop を使用
      this.renderer.setAnimationLoop((time, frame) => {
        // ユーザーの元のループを実行
        this.originalAnimationLoop(time);

        // ChocoDropの追加機能（オブジェクト操作など）
        this.updateChocoDropObjects(time, frame);
      });
    }
  }

  /**
   * XR UI を作成
   */
  createXRUI() {
    const ui = document.createElement('div');
    ui.id = 'chocodrop-xr-ui';
    ui.className = `chocodrop-xr-ui chocodrop-xr-ui--${this.uiPosition}`;

    ui.innerHTML = `
      <div class="chocodrop-xr-controls">
        <button id="chocodrop-vr-button" class="chocodrop-xr-button">
          VRモード
        </button>
        <button id="chocodrop-ar-button" class="chocodrop-xr-button">
          ARモード
        </button>
        <div id="chocodrop-xr-status" class="chocodrop-xr-status">
          XR待機中
        </div>
      </div>
    `;

    document.body.appendChild(ui);

    // イベントリスナー
    document.getElementById('chocodrop-vr-button').addEventListener('click', () => {
      this.enterVR().catch(e => console.error(e));
    });

    document.getElementById('chocodrop-ar-button').addEventListener('click', () => {
      this.enterAR().catch(e => console.error(e));
    });

    // AR対応チェック
    this.checkARSupport();
  }

  /**
   * AR対応チェック
   */
  async checkARSupport() {
    if (!navigator.xr) return;

    try {
      const supported = await navigator.xr.isSessionSupported('immersive-ar');
      const arButton = document.getElementById('chocodrop-ar-button');
      if (!supported && arButton) {
        arButton.disabled = true;
        arButton.title = 'このデバイスはARをサポートしていません';
      }
    } catch (e) {
      console.warn('AR support check failed:', e);
    }
  }

  /**
   * イベント発火
   */
  emit(event, detail) {
    window.dispatchEvent(new CustomEvent(`chocodrop:${event}`, { detail }));
  }
}

// グローバルAPIとして公開
window.chocodrop = window.chocodrop || {};
window.chocodrop.XRWrapper = ChocoDropXRWrapper;

/**
 * ワンライナーAPI
 */
window.chocodrop.wrapXR = async function(options) {
  const wrapper = new ChocoDropXRWrapper(options);
  await wrapper.enableXR();
  return wrapper;
};
```

### 3.3 ChocoDropの既存機能との統合

**要件ID**: XR-TECH-003
**優先度**: 高

#### 画像配置機能の維持

```javascript
/**
 * XRモード中も画像配置機能を利用可能にする
 */
class ChocoDropXRWrapper {
  // ... 既存コード ...

  /**
   * ChocoDropオブジェクトを更新（XRループ内で実行）
   */
  updateChocoDropObjects(time, frame) {
    // 配置された画像やモデルの位置を更新
    this.chocoDropObjects.forEach(obj => {
      if (obj.userData.chocoDropType === 'image') {
        // 画像は常にカメラの方を向く
        obj.lookAt(this.camera.position);
      }

      if (obj.userData.chocoDropType === 'video') {
        // ビデオテクスチャを更新
        if (obj.material.map && obj.material.map.image instanceof HTMLVideoElement) {
          obj.material.map.needsUpdate = true;
        }
      }
    });

    // XRコントローラーによる操作
    if (frame) {
      this.updateXRControllers(frame);
    }
  }

  /**
   * XRコントローラーで画像/モデルを操作
   */
  updateXRControllers(frame) {
    const session = frame.session;
    const sources = session.inputSources;

    for (const source of sources) {
      if (source.gripSpace) {
        const pose = frame.getPose(source.gripSpace, this.xrReferenceSpace);
        if (pose) {
          // コントローラー位置でレイキャスト
          const raycaster = this.getControllerRaycaster(pose);
          const intersects = raycaster.intersectObjects(this.chocoDropObjects);

          if (intersects.length > 0) {
            const obj = intersects[0].object;
            // グラブボタンで選択
            if (source.gamepad.buttons[1].pressed) {
              this.selectObject(obj);
            }
          }
        }
      }
    }
  }
}
```

---

## 4. UI/UX 設計

### 4.1 ワークフロー

#### 4.1.1 ローカルシーンXR化フロー

```
1. ユーザーがThree.jsシーンを開発中
   ↓
2. ブックマークレットをクリック または Chrome拡張機能を起動
   ↓
3. ChocoDrop SDK自動読み込み
   ↓
4. Three.jsシーン自動検出
   ↓
5. XR Wrapper自動適用
   ↓
6. VR/ARボタン表示
   ↓
7. ボタンクリックでXRモード開始
```

#### 4.1.2 GitHub Pages XR化フロー

```
1. ChocoDrop XR Wrapper Webアプリを開く
   ↓
2. GitHub Pages URLを入力
   ↓
3. 「XR化して表示」ボタンをクリック
   ↓
4. iframe内でシーンを読み込み
   ↓
5. 自動的にXR化スクリプトを注入
   ↓
6. VR/ARボタン表示
   ↓
7. ボタンクリックでXRモード開始
```

### 4.2 エラーハンドリング

#### 4.2.1 検出失敗

**シナリオ**: Three.jsシーンが検出できない

**対応**:
```javascript
if (!detected.success) {
  showErrorDialog({
    title: 'Three.jsシーンが検出できませんでした',
    message: `
      以下を確認してください：
      - Three.jsが読み込まれているか
      - scene, camera, rendererがグローバル変数として定義されているか

      手動設定も可能です：
    `,
    actions: [
      {
        label: '手動設定',
        action: () => showManualSetupDialog()
      },
      {
        label: 'キャンセル',
        action: () => closeDialog()
      }
    ]
  });
}
```

#### 4.2.2 XR非対応

**シナリオ**: デバイスがWebXRをサポートしていない

**対応**:
```javascript
if (!navigator.xr) {
  showInfoDialog({
    title: 'WebXR非対応',
    message: `
      このブラウザ/デバイスはWebXRをサポートしていません。

      対応ブラウザ:
      - Chrome 79+
      - Edge 79+
      - Oculus Browser

      対応デバイス:
      - Meta Quest 1/2/3/Pro
      - HTC Vive
      - Windows Mixed Reality
      - ARCore対応Androidデバイス
    `
  });
}
```

#### 4.2.3 CORS エラー

**シナリオ**: GitHub PagesのCORS制限でスクリプト注入失敗

**対応**:
```javascript
if (corsError) {
  showErrorDialog({
    title: 'CORS制限により注入できませんでした',
    message: `
      セキュリティ制限により、このサイトにスクリプトを注入できません。

      代替方法:
      1. ブックマークレットを使用（推奨）
      2. Chrome拡張機能を使用
      3. プロキシ経由でアクセス（開発中）
    `,
    actions: [
      {
        label: 'ブックマークレットをコピー',
        action: () => copyBookmarklet()
      },
      {
        label: '拡張機能をインストール',
        action: () => openExtensionPage()
      }
    ]
  });
}
```

---

## 5. 非機能要件

### 5.1 パフォーマンス

**要件ID**: XR-PERF-001
**優先度**: 高

- **目標FPS**: 72fps（VR）、60fps（AR）
- **初期化時間**: < 2秒
- **検出時間**: < 500ms
- **メモリ使用量**: < 50MB追加

### 5.2 互換性

**要件ID**: XR-COMPAT-001
**優先度**: 最高

- **Three.js バージョン**: r140 - r170
- **ブラウザ**: Chrome 79+, Edge 79+, Oculus Browser
- **デバイス**: Meta Quest 1/2/3/Pro, HTC Vive, ARCore対応Android

### 5.3 セキュリティ

**要件ID**: XR-SEC-001
**優先度**: 最高

- **CORS対策**: 適切なOrigin制限
- **CSP対応**: nonce/hash方式
- **HTTPS必須**: Mixed Content防止
- **XSS対策**: サニタイゼーション

### 5.4 アクセシビリティ

**要件ID**: XR-A11Y-001
**優先度**: 中

- **キーボード操作**: VR/ARボタンにTab/Enterでアクセス
- **スクリーンリーダー**: ARIA属性対応
- **色覚多様性**: コントラスト比 4.5:1 以上

---

## 6. 実装計画

### 6.1 フェーズ1: コア機能（2週間）

- [ ] Three.js自動検出アルゴリズム実装
- [ ] XR Wrapper基本実装
- [ ] ブックマークレット拡張
- [ ] 基本UI実装

### 6.2 フェーズ2: GitHub Pages対応（2週間）

- [ ] Webアプリ UI実装
- [ ] iframe読み込み機能
- [ ] CORS対策実装
- [ ] postMessage通信プロトコル

### 6.3 フェーズ3: PWA化（1週間）

- [ ] manifest.json作成
- [ ] Service Worker実装
- [ ] オフラインキャッシュ
- [ ] インストールプロンプト

### 6.4 フェーズ4: Chrome拡張機能（2週間）

- [ ] manifest.json作成
- [ ] コンテンツスクリプト
- [ ] ページアクション
- [ ] 設定画面

### 6.5 フェーズ5: テスト・最適化（1週間）

- [ ] ユニットテスト
- [ ] E2Eテスト
- [ ] パフォーマンス最適化
- [ ] ドキュメント作成

---

## 7. 追加機能提案

### 7.1 シーンエディタ統合

**説明**: XRモード中にChocoDrop UIでオブジェクトを追加・編集

**機能**:
- VRコントローラーでAI画像生成
- 音声コマンドで3Dモデル配置
- ジェスチャー操作

### 7.2 マルチプレイヤー対応

**説明**: 複数ユーザーで同じXRシーンを共有

**機能**:
- WebRTC/WebSocketによる同期
- アバター表示
- ボイスチャット

### 7.3 シーンテンプレート

**説明**: よく使うXRシーンをテンプレート化

**機能**:
- ギャラリービュー
- 美術館シーン
- 製品展示シーン

### 7.4 アナリティクス

**説明**: XR利用状況の分析

**機能**:
- セッション時間計測
- 使用デバイス統計
- エラー追跡

### 7.5 QRコード自動生成

**説明**: モバイルARアクセス用QRコード

**機能**:
- URL→QRコード変換
- WebXR Viewer アプリ対応
- ARCore/ARKit対応

---

## 8. 参考資料

### 8.1 技術資料

- [Three.js WebXRManager](https://threejs.org/docs/api/en/renderers/webxr/WebXRManager.html)
- [WebXR Device API](https://www.w3.org/TR/webxr/)
- [Immersive Web Working Group](https://github.com/immersive-web)
- [Three.js Examples - WebXR](https://threejs.org/examples/?q=webxr)

### 8.2 事例

- [Mozilla Hubs](https://hubs.mozilla.com/) - ソーシャルVR
- [Frame](https://framevr.io/) - バーチャルスペース
- [Spatial](https://spatial.io/) - コラボレーションVR

### 8.3 類似プロジェクト

- [A-Frame](https://aframe.io/) - WebVRフレームワーク
- [Babylon.js](https://www.babylonjs.com/) - WebXR対応3Dエンジン
- [PlayCanvas](https://playcanvas.com/) - WebGL/WebXRエンジン

---

## 9. 用語集

- **XR**: eXtended Reality（拡張現実）の略。VR、AR、MRの総称
- **VR**: Virtual Reality（仮想現実）
- **AR**: Augmented Reality（拡張現実）
- **WebXR**: ブラウザ上でVR/AR体験を提供するAPI
- **Three.js**: JavaScript製3Dライブラリ
- **ブックマークレット**: ブックマークから実行できるJavaScriptコード
- **PWA**: Progressive Web App（プログレッシブウェブアプリ）
- **CORS**: Cross-Origin Resource Sharing（オリジン間リソース共有）

---

## 10. 改訂履歴

| バージョン | 日付 | 変更内容 | 作成者 |
|-----------|------|----------|--------|
| 1.0.0 | 2025-01-06 | 初版作成 | ChocoDrop Development Team |

---

**文書終わり**
