# ChocoDrop XR Wrapper 実装ガイド

**作成日**: 2025年1月6日
**バージョン**: 1.0.0
**対象**: 開発者向け実装手順

---

## 目次

1. [開発環境セットアップ](#1-開発環境セットアップ)
2. [XR Wrapper コア実装](#2-xr-wrapper-コア実装)
3. [Webアプリ実装](#3-webアプリ実装)
4. [PWA機能実装](#4-pwa機能実装)
5. [ブックマークレット実装](#5-ブックマークレット実装)
6. [Chrome拡張機能実装](#6-chrome拡張機能実装)
7. [テスト](#7-テスト)
8. [デプロイ](#8-デプロイ)

---

## 1. 開発環境セットアップ

### 1.1 前提条件

```bash
# Node.js 16以上
node --version  # v16.0.0+

# npm または pnpm
npm --version   # 8.0.0+
```

### 1.2 プロジェクトセットアップ

```bash
# リポジトリのクローン（既に完了している場合はスキップ）
cd /Users/nukuiyuki/Dev/ChocoDrop/.worktrees/task-1762429443838-38a777

# 依存関係のインストール
npm install

# 開発サーバーの起動（確認用）
npm run dev
```

### 1.3 新規ディレクトリの作成

```bash
# XR Wrapper関連ディレクトリを作成
mkdir -p src/pwa/xr-wrapper
mkdir -p src/web-app/components
mkdir -p src/web-app/services
mkdir -p src/web-app/styles
mkdir -p src/bookmarklet
mkdir -p src/extension/popup
mkdir -p src/extension/options
mkdir -p public/icons
mkdir -p public/assets/styles
mkdir -p public/assets/scripts
```

---

## 2. XR Wrapper コア実装

### 2.1 Three.js自動検出

**ファイル**: `src/pwa/xr-wrapper/detector.js`

```javascript
/**
 * Three.jsシーンの自動検出
 */

export class ThreeSceneDetector {
  constructor() {
    this.detectionMethods = [
      this.detectFromGlobals.bind(this),
      this.detectFromInstanceScan.bind(this),
      this.detectFromCanvas.bind(this),
      this.detectFromAnimationLoop.bind(this)
    ];
  }

  /**
   * メイン検出関数
   */
  async detect() {
    const result = {
      success: false,
      scene: null,
      camera: null,
      renderer: null,
      method: null,
      confidence: 0
    };

    // 各検出方法を試す
    for (const method of this.detectionMethods) {
      const detected = await method();
      if (detected.success) {
        Object.assign(result, detected);
        break;
      }
    }

    return result;
  }

  /**
   * 方法1: グローバル変数から検出
   */
  detectFromGlobals() {
    if (window.scene && window.camera && window.renderer) {
      return {
        success: true,
        scene: window.scene,
        camera: window.camera,
        renderer: window.renderer,
        method: 'globals',
        confidence: 0.9
      };
    }

    return { success: false };
  }

  /**
   * 方法2: THREE.Sceneインスタンスをスキャン
   */
  detectFromInstanceScan() {
    if (!window.THREE) {
      return { success: false };
    }

    let scene = null;
    let camera = null;
    let renderer = null;

    // グローバルスコープをスキャン
    for (const key in window) {
      try {
        if (window[key] instanceof window.THREE.Scene) {
          scene = window[key];
        }
        if (window[key] instanceof window.THREE.Camera) {
          camera = window[key];
        }
        if (window[key] instanceof window.THREE.WebGLRenderer) {
          renderer = window[key];
        }
      } catch (e) {
        // アクセスエラーは無視
      }
    }

    if (scene || camera || renderer) {
      return {
        success: !!(scene && camera && renderer),
        scene,
        camera,
        renderer,
        method: 'instance-scan',
        confidence: 0.7
      };
    }

    return { success: false };
  }

  /**
   * 方法3: Canvas要素から逆引き
   */
  detectFromCanvas() {
    const canvases = document.querySelectorAll('canvas');

    for (const canvas of canvases) {
      const ctx = canvas.getContext('webgl') || canvas.getContext('webgl2');
      if (ctx) {
        // WebGLContextからrendererを探す
        // これは高度な方法なので実装は省略
        // 実際にはデバッグ情報やメモリからrendererを特定する
      }
    }

    return { success: false };
  }

  /**
   * 方法4: アニメーションループからフック
   */
  async detectFromAnimationLoop() {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false });
      }, 3000);

      // requestAnimationFrameをフック
      const originalRAF = window.requestAnimationFrame;
      let detected = false;

      window.requestAnimationFrame = function(callback) {
        if (detected) {
          return originalRAF.call(this, callback);
        }

        const wrappedCallback = function(time) {
          // コールバック実行前にスタックトレースから検出を試みる
          // 実装は複雑なため省略

          callback(time);
        };

        return originalRAF.call(this, wrappedCallback);
      };

      // タイムアウト後に元に戻す
      setTimeout(() => {
        window.requestAnimationFrame = originalRAF;
        clearTimeout(timeout);
      }, 3100);
    });
  }
}

// エクスポート
export async function detectThreeScene() {
  const detector = new ThreeSceneDetector();
  return await detector.detect();
}
```

### 2.2 XR Wrapper本体

**ファイル**: `src/pwa/xr-wrapper/wrapper.js`

```javascript
/**
 * ChocoDrop XR Wrapper
 * ユーザーのThree.jsシーンをXR対応にラップする
 */

export class ChocoDropXRWrapper {
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
    this.uiElements = [];

    // イベントターゲット
    this.events = new EventTarget();
  }

  /**
   * XR機能を有効化
   */
  async enableXR() {
    if (this.isWrapped) {
      console.warn('[XR Wrapper] Already enabled');
      return false;
    }

    // renderer.xr が利用可能かチェック
    if (!this.renderer.xr) {
      console.error('[XR Wrapper] Renderer does not support XR');
      return false;
    }

    // 既存のアニメーションループを保存
    if (this.preserveOriginalLoop) {
      this.saveOriginalAnimationLoop();
    }

    // XRを有効化
    this.renderer.xr.enabled = true;

    // UIを作成
    this.createXRUI();

    // XRセッション終了時のリスナー
    if (this.renderer.xr.addEventListener) {
      this.renderer.xr.addEventListener('sessionend', () => {
        this.handleXRSessionEnd();
      });
    }

    this.isWrapped = true;
    this.emit('enabled');

    console.log('[XR Wrapper] Enabled successfully');
    return true;
  }

  /**
   * 既存のアニメーションループを保存
   */
  saveOriginalAnimationLoop() {
    // ユーザーのrequestAnimationFrame使用を検出
    // 実装は複雑なため、ここでは概念のみ
    console.log('[XR Wrapper] Attempting to preserve original animation loop');
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

    this.emit('xr:request', { mode: sessionMode });

    try {
      const sessionInit = {
        requiredFeatures: mode === 'ar' ?
          ['local-floor', 'hit-test'] :
          ['local-floor'],
        optionalFeatures: ['hand-tracking', 'layers']
      };

      const session = await navigator.xr.requestSession(sessionMode, sessionInit);
      await this.renderer.xr.setSession(session);

      this.xrSession = session;
      this.xrMode = mode;

      // アニメーションループを変換
      this.convertToXRLoop();

      this.emit('xr:entered', { session, mode: sessionMode });

      console.log(`[XR Wrapper] Entered ${sessionMode}`);
      return true;
    } catch (error) {
      console.error('[XR Wrapper] Failed to enter XR:', error);
      this.emit('xr:error', { error, mode: sessionMode });
      throw error;
    }
  }

  /**
   * XRセッション終了時の処理
   */
  handleXRSessionEnd() {
    console.log('[XR Wrapper] XR session ended');
    this.xrSession = null;
    this.xrMode = null;
    this.emit('xr:exit');
  }

  /**
   * 既存のアニメーションループをXRループに変換
   */
  convertToXRLoop() {
    if (this.originalAnimationLoop) {
      this.renderer.setAnimationLoop((time, frame) => {
        // ユーザーの元のループを実行
        this.originalAnimationLoop(time);

        // ChocoDropの追加機能
        this.updateChocoDropFeatures(time, frame);
      });
    } else {
      // ユーザーがsetAnimationLoopを使っている可能性
      console.log('[XR Wrapper] Using existing setAnimationLoop');
    }
  }

  /**
   * ChocoDrop機能の更新
   */
  updateChocoDropFeatures(time, frame) {
    // 画像配置などのChocoDrop機能をここで更新
    // （実装は省略）
  }

  /**
   * XR UI作成
   */
  createXRUI() {
    // コンテナ
    const container = document.createElement('div');
    container.id = 'chocodrop-xr-ui';
    container.className = `chocodrop-xr-ui chocodrop-xr-ui--${this.uiPosition}`;

    // VRボタン
    const vrButton = this.createButton('VRモード', async () => {
      await this.enterVR();
    });
    vrButton.id = 'chocodrop-vr-button';

    // ARボタン
    const arButton = this.createButton('ARモード', async () => {
      await this.enterAR();
    });
    arButton.id = 'chocodrop-ar-button';

    // ステータス
    const status = document.createElement('div');
    status.id = 'chocodrop-xr-status';
    status.className = 'chocodrop-xr-status';
    status.textContent = 'XR待機中';

    container.appendChild(vrButton);
    container.appendChild(arButton);
    container.appendChild(status);

    document.body.appendChild(container);

    this.uiElements.push(container);

    // AR対応チェック
    this.checkARSupport(arButton);

    // スタイルを注入
    this.injectStyles();
  }

  /**
   * ボタン作成ヘルパー
   */
  createButton(text, onClick) {
    const button = document.createElement('button');
    button.className = 'chocodrop-xr-button';
    button.textContent = text;
    button.addEventListener('click', onClick);
    return button;
  }

  /**
   * AR対応チェック
   */
  async checkARSupport(arButton) {
    if (!navigator.xr) {
      arButton.disabled = true;
      arButton.title = 'WebXRに対応していません';
      return;
    }

    try {
      const supported = await navigator.xr.isSessionSupported('immersive-ar');
      if (!supported) {
        arButton.disabled = true;
        arButton.title = 'ARモードに対応していません';
      }
    } catch (e) {
      console.warn('[XR Wrapper] AR support check failed:', e);
      arButton.disabled = true;
    }
  }

  /**
   * スタイル注入
   */
  injectStyles() {
    if (document.getElementById('chocodrop-xr-styles')) return;

    const style = document.createElement('style');
    style.id = 'chocodrop-xr-styles';
    style.textContent = `
      .chocodrop-xr-ui {
        position: fixed;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px;
        background: rgba(15, 23, 42, 0.95);
        border-radius: 8px;
        backdrop-filter: blur(10px);
        font-family: system-ui, -apple-system, sans-serif;
      }

      .chocodrop-xr-ui--bottom-right {
        bottom: 20px;
        right: 20px;
      }

      .chocodrop-xr-button {
        padding: 10px 16px;
        background: #60a5fa;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }

      .chocodrop-xr-button:hover:not(:disabled) {
        background: #3b82f6;
        transform: translateY(-1px);
      }

      .chocodrop-xr-button:active:not(:disabled) {
        transform: translateY(0);
      }

      .chocodrop-xr-button:disabled {
        background: #64748b;
        cursor: not-allowed;
        opacity: 0.5;
      }

      .chocodrop-xr-status {
        padding: 8px;
        text-align: center;
        font-size: 12px;
        color: #94a3b8;
        border-top: 1px solid rgba(148, 163, 184, 0.2);
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * イベント発火
   */
  emit(event, detail = {}) {
    const customEvent = new CustomEvent(`chocodrop-xr:${event}`, { detail });
    this.events.dispatchEvent(customEvent);
    window.dispatchEvent(customEvent);
  }

  /**
   * イベントリスナー
   */
  on(event, handler) {
    this.events.addEventListener(`chocodrop-xr:${event}`, handler);
  }

  /**
   * クリーンアップ
   */
  dispose() {
    // UIを削除
    this.uiElements.forEach(el => el.remove());
    this.uiElements = [];

    // XRセッションを終了
    if (this.xrSession) {
      this.xrSession.end();
    }

    this.isWrapped = false;
    this.emit('disposed');
  }
}

// グローバルAPIとして公開
window.chocodrop = window.chocodrop || {};
window.chocodrop.XRWrapper = ChocoDropXRWrapper;
```

### 2.3 ワンライナーAPI

**ファイル**: `src/pwa/xr-wrapper/index.js`

```javascript
import { detectThreeScene } from './detector.js';
import { ChocoDropXRWrapper } from './wrapper.js';

/**
 * ワンライナーAPI: 自動検出 + XR有効化
 */
export async function enableXR(options = {}) {
  // 既に検出済みの場合
  if (options.scene && options.camera && options.renderer) {
    const wrapper = new ChocoDropXRWrapper(options);
    await wrapper.enableXR();
    return wrapper;
  }

  // 自動検出
  console.log('[ChocoDrop] Detecting Three.js scene...');
  const detected = await detectThreeScene();

  if (!detected.success) {
    throw new Error('Failed to detect Three.js scene');
  }

  console.log(`[ChocoDrop] Detected via ${detected.method} (confidence: ${detected.confidence})`);

  // XR Wrapper適用
  const wrapper = new ChocoDropXRWrapper({
    scene: detected.scene,
    camera: detected.camera,
    renderer: detected.renderer,
    ...options
  });

  await wrapper.enableXR();
  return wrapper;
}

// グローバルAPIとして公開
window.chocodrop = window.chocodrop || {};
window.chocodrop.enableXR = enableXR;
window.chocodrop.detectScene = detectThreeScene;

export { detectThreeScene, ChocoDropXRWrapper };
```

---

## 3. Webアプリ実装

### 3.1 iframe通信サービス

**ファイル**: `src/web-app/services/iframe-bridge.js`

```javascript
/**
 * iframe通信ブリッジ
 */

const TIMEOUT = 10000; // 10秒

export async function loadScene(iframe, url) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for scene to load'));
    }, TIMEOUT);

    // メッセージリスナー
    const handleMessage = (event) => {
      if (event.source !== iframe.contentWindow) return;

      if (event.data.type === 'CHOCODROP_SCENE_LOADED') {
        clearTimeout(timeout);
        window.removeEventListener('message', handleMessage);
        resolve();
      }

      if (event.data.type === 'CHOCODROP_SCENE_ERROR') {
        clearTimeout(timeout);
        window.removeEventListener('message', handleMessage);
        reject(new Error(event.data.error));
      }
    };

    window.addEventListener('message', handleMessage);

    // iframeにURLを設定
    iframe.src = url;

    // 注入スクリプトをiframe内で実行
    iframe.addEventListener('load', () => {
      injectXRScript(iframe);
    }, { once: true });
  });
}

/**
 * XRスクリプトをiframe内に注入
 */
function injectXRScript(iframe) {
  try {
    const doc = iframe.contentDocument || iframe.contentWindow.document;

    // スクリプト作成
    const script = doc.createElement('script');
    script.type = 'module';
    script.textContent = `
      (async function() {
        try {
          // ChocoDrop XR Wrapperを読み込み
          const module = await import('${getXRWrapperURL()}');

          // 自動検出 + XR有効化
          await module.enableXR();

          // 親ウィンドウに通知
          window.parent.postMessage({
            type: 'CHOCODROP_SCENE_LOADED'
          }, '*');
        } catch (error) {
          console.error('Failed to enable XR:', error);
          window.parent.postMessage({
            type: 'CHOCODROP_SCENE_ERROR',
            error: error.message
          }, '*');
        }
      })();
    `;

    doc.head.appendChild(script);
  } catch (error) {
    console.error('Failed to inject XR script:', error);
    // CORS制限などでアクセスできない場合
    // 代替方法を試みる
  }
}

/**
 * XRコマンドを送信
 */
export async function sendXRCommand(iframe, command) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for XR command response'));
    }, TIMEOUT);

    const handleMessage = (event) => {
      if (event.source !== iframe.contentWindow) return;

      if (event.data.type === 'CHOCODROP_XR_RESPONSE') {
        clearTimeout(timeout);
        window.removeEventListener('message', handleMessage);
        resolve(event.data.result);
      }
    };

    window.addEventListener('message', handleMessage);

    // コマンドを送信
    iframe.contentWindow.postMessage({
      type: 'CHOCODROP_XR_COMMAND',
      command
    }, '*');
  });
}

/**
 * XR Wrapper URLを取得
 */
function getXRWrapperURL() {
  // 本番環境ではCDN URLを使用
  if (window.location.hostname !== 'localhost') {
    return 'https://cdn.jsdelivr.net/npm/chocodrop@latest/dist/xr-wrapper.js';
  }

  // 開発環境ではローカルを使用
  return '/assets/scripts/xr-wrapper.js';
}
```

### 3.2 ストレージサービス

**ファイル**: `src/web-app/services/storage.js`

```javascript
/**
 * ローカルストレージ管理
 */

const STORAGE_KEY = 'chocodrop-history';
const MAX_HISTORY = 20;

export function saveHistory(url) {
  const history = getHistory();

  // 既存の同じURLを削除
  const filtered = history.filter(item => item.url !== url);

  // 新しいエントリを先頭に追加
  filtered.unshift({
    url,
    timestamp: Date.now(),
    title: extractTitle(url)
  });

  // 最大数を超えたら古いものを削除
  if (filtered.length > MAX_HISTORY) {
    filtered.splice(MAX_HISTORY);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

export function getHistory() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Failed to load history:', e);
    return [];
  }
}

export function clearHistory() {
  localStorage.removeItem(STORAGE_KEY);
}

function extractTitle(url) {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    const parts = path.split('/').filter(Boolean);
    return parts[parts.length - 1] || urlObj.hostname;
  } catch (e) {
    return url;
  }
}
```

---

## 4. PWA機能実装

### 4.1 Service Worker登録

**ファイル**: `src/web-app/services/service-worker-registration.js`

```javascript
/**
 * Service Worker登録
 */

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.warn('[SW] Service Worker not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/service-worker.js', {
      scope: '/'
    });

    console.log('[SW] Registered:', registration);

    // 更新チェック
    setupUpdateCheck(registration);

    return registration;
  } catch (error) {
    console.error('[SW] Registration failed:', error);
    return null;
  }
}

function setupUpdateCheck(registration) {
  registration.addEventListener('updatefound', () => {
    const newWorker = registration.installing;

    newWorker.addEventListener('statechange', () => {
      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
        // 新バージョンが利用可能
        showUpdateNotification(newWorker);
      }
    });
  });
}

function showUpdateNotification(newWorker) {
  if (confirm('新しいバージョンが利用可能です。今すぐ更新しますか？')) {
    newWorker.postMessage({ type: 'SKIP_WAITING' });
    window.location.reload();
  }
}
```

---

## 5. ブックマークレット実装

**ファイル**: `src/bookmarklet/generator.js`

```javascript
/**
 * ブックマークレット生成
 */

export function generateBookmarklet(options = {}) {
  const {
    autoDetect = true,
    showUI = true,
    defaultMode = 'vr'
  } = options;

  // ブックマークレットコード
  const code = `
javascript:(function(){
  ${autoDetect ? 'const autoDetect=true;' : 'const autoDetect=false;'}
  ${showUI ? 'const showUI=true;' : 'const showUI=false;'}
  const defaultMode='${defaultMode}';

  const script=document.createElement('script');
  script.type='module';
  script.src='https://cdn.jsdelivr.net/npm/chocodrop@latest/dist/xr-wrapper.js';
  script.onload=async()=>{
    try{
      await window.chocodrop.enableXR({autoDetect,showUI,defaultMode});
      console.log('ChocoDrop XR enabled!');
    }catch(e){
      alert('Failed to enable XR: '+e.message);
    }
  };
  document.head.appendChild(script);
})();
`.trim().replace(/\s+/g, ' ');

  return code;
}
```

---

## 6. Chrome拡張機能実装

### 6.1 manifest.json

**ファイル**: `src/extension/manifest.json`

```json
{
  "manifest_version": 3,
  "name": "ChocoDrop XR Wrapper",
  "version": "1.0.0",
  "description": "任意のThree.jsシーンをVR/AR対応にする",

  "permissions": [
    "activeTab",
    "storage"
  ],

  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },

  "background": {
    "service_worker": "background.js"
  },

  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content.js"],
    "run_at": "document_end"
  }],

  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },

  "options_page": "options/options.html"
}
```

### 6.2 コンテンツスクリプト

**ファイル**: `src/extension/content.js`

```javascript
/**
 * Three.js検出とXR有効化
 */

// Three.jsの存在をチェック
function checkThreeJS() {
  return !!(window.THREE || document.querySelector('script[src*="three"]'));
}

// 拡張機能からのメッセージを受信
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CHECK_THREEJS') {
    sendResponse({ hasThreeJS: checkThreeJS() });
  }

  if (message.type === 'ENABLE_XR') {
    enableXR()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // 非同期レスポンス
  }
});

async function enableXR() {
  // XR Wrapperスクリプトを注入
  const script = document.createElement('script');
  script.type = 'module';
  script.src = chrome.runtime.getURL('xr-wrapper.js');

  return new Promise((resolve, reject) => {
    script.onload = async () => {
      try {
        await window.chocodrop.enableXR();
        resolve();
      } catch (error) {
        reject(error);
      }
    };

    script.onerror = () => {
      reject(new Error('Failed to load XR wrapper'));
    };

    document.head.appendChild(script);
  });
}

// ページ読み込み時にThree.jsをチェック
if (checkThreeJS()) {
  chrome.runtime.sendMessage({ type: 'THREEJS_DETECTED' });
}
```

---

## 7. テスト

### 7.1 ユニットテスト

```bash
# テストフレームワークのインストール
npm install --save-dev vitest @vitest/ui

# テストファイル作成
mkdir -p tests/unit
```

**ファイル**: `tests/unit/detector.test.js`

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { detectThreeScene } from '../../src/pwa/xr-wrapper/detector.js';

describe('ThreeSceneDetector', () => {
  beforeEach(() => {
    // グローバル変数をクリア
    delete window.scene;
    delete window.camera;
    delete window.renderer;
    delete window.THREE;
  });

  it('should detect from globals', async () => {
    // モックオブジェクトを設定
    window.scene = { isScene: true };
    window.camera = { isCamera: true };
    window.renderer = { isWebGLRenderer: true };

    const result = await detectThreeScene();

    expect(result.success).toBe(true);
    expect(result.method).toBe('globals');
    expect(result.scene).toBe(window.scene);
  });

  it('should fail when Three.js not found', async () => {
    const result = await detectThreeScene();

    expect(result.success).toBe(false);
  });
});
```

### 7.2 E2Eテスト

```bash
# Playwrightのインストール
npm install --save-dev @playwright/test

# テストファイル作成
mkdir -p tests/e2e
```

**ファイル**: `tests/e2e/xr-wrapper.spec.js`

```javascript
import { test, expect } from '@playwright/test';

test.describe('XR Wrapper', () => {
  test('should enable XR on Three.js page', async ({ page }) => {
    // Three.jsサンプルページを開く
    await page.goto('http://localhost:3000/examples/basic/');

    // ブックマークレットを実行
    await page.evaluate(() => {
      window.chocodrop.enableXR();
    });

    // VRボタンが表示されるまで待つ
    const vrButton = page.locator('#chocodrop-vr-button');
    await expect(vrButton).toBeVisible();

    // ARボタンも表示される
    const arButton = page.locator('#chocodrop-ar-button');
    await expect(arButton).toBeVisible();
  });
});
```

---

## 8. デプロイ

### 8.1 ビルド

```bash
# PWAビルド
npm run build:pwa

# ブックマークレットビルド
npm run build:bookmarklet

# Chrome拡張機能ビルド
npm run build:extension
```

### 8.2 GitHub Pagesへのデプロイ

```bash
# GitHub Pagesブランチにデプロイ
npm run deploy:gh-pages
```

### 8.3 Chrome Web Storeへの公開

1. Chrome Web Store Developer Dashboardにアクセス
2. "New Item"をクリック
3. `dist/extension.zip`をアップロード
4. 説明、スクリーンショット等を追加
5. "Submit for Review"をクリック

---

## 9. 次のステップ

実装が完了したら、以下のドキュメントを参照してください：

- [XR_WRAPPER_REQUIREMENTS.md](./XR_WRAPPER_REQUIREMENTS.md) - 詳細な要件
- [XR_PWA_ROADMAP.md](./XR_PWA_ROADMAP.md) - PWA/Webアプリロードマップ
- [API.md](./API.md) - API リファレンス

---

**文書終わり**
