# ChocoDrop XR Wrapper PWA/Webアプリ 開発ロードマップ

**作成日**: 2025年1月6日
**バージョン**: 1.0.0
**対象**: PWA/Webアプリとしての開発計画

---

## 1. 概要

### 1.1 目的
ChocoDrop XR Wrapperを、インストール可能なPWAおよびWebアプリとして提供し、ユーザーがブラウザから直接Three.jsシーンをXR化できるようにする。

### 1.2 主要機能
1. **XR Wrapper Webアプリ**: ブラウザからURL入力でシーンをXR化
2. **PWA対応**: オフラインでも動作、インストール可能
3. **ブックマークレット生成**: カスタマイズ可能なブックマークレット
4. **Chrome拡張機能**: より強力な自動XR化

---

## 2. アーキテクチャ設計

### 2.1 全体構成

```
┌──────────────────────────────────────────────────────┐
│                   ChocoDrop XR Wrapper               │
│                                                      │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐  │
│  │ Web App    │  │ PWA        │  │ Bookmarklet  │  │
│  │ (Browser)  │  │ (Installed)│  │ Generator    │  │
│  └────────────┘  └────────────┘  └──────────────┘  │
│         │                │                │         │
│         └────────────────┴────────────────┘         │
│                        │                            │
│              ┌─────────▼─────────┐                  │
│              │  ChocoDrop Core   │                  │
│              │  - XR Detection   │                  │
│              │  - XR Wrapper     │                  │
│              │  - Scene Manager  │                  │
│              └───────────────────┘                  │
└──────────────────────────────────────────────────────┘
```

### 2.2 ディレクトリ構成

```
chocodrop/
├── public/
│   ├── index.html                # Webアプリエントリーポイント
│   ├── manifest.json             # PWA manifest
│   ├── service-worker.js         # Service Worker
│   ├── icons/                    # アプリアイコン
│   │   ├── icon-192.png
│   │   ├── icon-512.png
│   │   └── maskable-icon.png
│   └── assets/
│       ├── styles/
│       │   └── app.css
│       └── images/
│
├── src/
│   ├── pwa/
│   │   ├── app-shell.js          # 既存: PWAアプリシェル
│   │   ├── immersive.js          # 既存: XR機能
│   │   ├── importer.js           # 既存: シーンインポート
│   │   └── xr-wrapper/           # 新規: XR Wrapper機能
│   │       ├── index.js          # メインエントリー
│   │       ├── detector.js       # Three.js検出
│   │       ├── wrapper.js        # XR Wrapper本体
│   │       ├── ui.js             # UI コンポーネント
│   │       └── utils.js
│   │
│   ├── web-app/                  # 新規: Webアプリ
│   │   ├── index.js              # Webアプリメイン
│   │   ├── components/
│   │   │   ├── URLInput.js       # URL入力コンポーネント
│   │   │   ├── PreviewFrame.js   # プレビューiframe
│   │   │   ├── XRControls.js     # XR制御UI
│   │   │   └── HistoryList.js    # 履歴表示
│   │   ├── services/
│   │   │   ├── storage.js        # localStorage管理
│   │   │   ├── iframe-bridge.js  # iframe通信
│   │   │   └── xr-injector.js    # XRスクリプト注入
│   │   └── styles/
│   │       └── web-app.css
│   │
│   ├── bookmarklet/              # 新規: ブックマークレット
│   │   ├── generator.js          # ブックマークレット生成
│   │   ├── template.js           # ブックマークレットテンプレート
│   │   └── customizer.js         # カスタマイズUI
│   │
│   └── extension/                # 新規: Chrome拡張機能
│       ├── manifest.json
│       ├── background.js
│       ├── content.js
│       ├── popup/
│       │   ├── popup.html
│       │   └── popup.js
│       └── options/
│           ├── options.html
│           └── options.js
│
├── SceneManager/                 # 既存: シーン管理
│   └── index.js
│
└── docs/
    ├── XR_WRAPPER_REQUIREMENTS.md  # 既存: 要件定義
    └── XR_PWA_ROADMAP.md           # 本ファイル
```

---

## 3. PWA実装詳細

### 3.1 manifest.json

```json
{
  "name": "ChocoDrop XR Wrapper",
  "short_name": "ChocoDrop XR",
  "description": "任意のThree.jsシーンをVR/AR対応に変換するWebアプリ",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#0f172a",
  "theme_color": "#60a5fa",
  "lang": "ja",
  "dir": "ltr",

  "icons": [
    {
      "src": "/icons/icon-72.png",
      "sizes": "72x72",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-96.png",
      "sizes": "96x96",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-128.png",
      "sizes": "128x128",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-144.png",
      "sizes": "144x144",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-152.png",
      "sizes": "152x152",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-384.png",
      "sizes": "384x384",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/maskable-icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ],

  "screenshots": [
    {
      "src": "/screenshots/desktop-1.png",
      "sizes": "1280x720",
      "type": "image/png",
      "form_factor": "wide"
    },
    {
      "src": "/screenshots/mobile-1.png",
      "sizes": "750x1334",
      "type": "image/png",
      "form_factor": "narrow"
    }
  ],

  "categories": ["utilities", "productivity", "entertainment"],

  "shortcuts": [
    {
      "name": "新しいXRシーン",
      "short_name": "新規",
      "description": "新しいシーンをXR化",
      "url": "/new",
      "icons": [
        {
          "src": "/icons/new-96.png",
          "sizes": "96x96"
        }
      ]
    },
    {
      "name": "履歴",
      "short_name": "履歴",
      "description": "最近使ったシーン",
      "url": "/history",
      "icons": [
        {
          "src": "/icons/history-96.png",
          "sizes": "96x96"
        }
      ]
    }
  ],

  "prefer_related_applications": false
}
```

### 3.2 Service Worker

```javascript
// public/service-worker.js

const CACHE_VERSION = 'chocodrop-xr-v1.0.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const THREE_CACHE = `${CACHE_VERSION}-three`;

// キャッシュするリソース
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/styles/app.css',
  '/assets/scripts/app.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Three.js CDNリソース
const THREE_CDN_RESOURCES = [
  'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js',
  'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/controls/OrbitControls.js',
  'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js'
];

// インストール
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    Promise.all([
      // 静的アセットをキャッシュ
      caches.open(STATIC_CACHE).then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      }),

      // Three.js CDNリソースをキャッシュ
      caches.open(THREE_CACHE).then((cache) => {
        console.log('[SW] Caching Three.js resources');
        return cache.addAll(THREE_CDN_RESOURCES).catch((error) => {
          console.warn('[SW] Failed to cache some Three.js resources', error);
        });
      })
    ]).then(() => {
      // 新しいSWを即座にアクティブ化
      return self.skipWaiting();
    })
  );
});

// アクティベーション
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    // 古いキャッシュを削除
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => {
            return cacheName.startsWith('chocodrop-xr-') &&
                   cacheName !== STATIC_CACHE &&
                   cacheName !== DYNAMIC_CACHE &&
                   cacheName !== THREE_CACHE;
          })
          .map((cacheName) => {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          })
      );
    }).then(() => {
      // 新しいSWで全てのクライアントを制御
      return self.clients.claim();
    })
  );
});

// フェッチ
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Three.js CDNリソース: Cache First
  if (isThreeCDNResource(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return cached || fetch(request).then((response) => {
          return caches.open(THREE_CACHE).then((cache) => {
            cache.put(request, response.clone());
            return response;
          });
        });
      })
    );
    return;
  }

  // 静的アセット: Cache First
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return cached || fetch(request);
      })
    );
    return;
  }

  // その他: Network First
  event.respondWith(
    fetch(request)
      .then((response) => {
        // 成功したレスポンスを動的キャッシュに保存
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // ネットワーク失敗時はキャッシュから
        return caches.match(request);
      })
  );
});

// メッセージ
self.addEventListener('message', (event) => {
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
});

// ヘルパー関数
function isThreeCDNResource(url) {
  return url.hostname === 'cdn.jsdelivr.net' &&
         url.pathname.includes('three@');
}

function isStaticAsset(url) {
  return url.origin === self.location.origin &&
         STATIC_ASSETS.some((asset) => url.pathname === asset);
}
```

### 3.3 インストールプロンプト

```javascript
// src/web-app/services/install-prompt.js

let deferredPrompt = null;
let isInstalled = false;

/**
 * PWAインストールプロンプトを初期化
 */
export function initInstallPrompt() {
  // 既にインストール済みかチェック
  if (window.matchMedia('(display-mode: standalone)').matches) {
    isInstalled = true;
    console.log('[Install] Already installed');
    return;
  }

  // インストールプロンプトをキャッチ
  window.addEventListener('beforeinstallprompt', (e) => {
    console.log('[Install] Prompt available');
    e.preventDefault();
    deferredPrompt = e;

    // インストールボタンを表示
    showInstallButton();
  });

  // インストール成功時
  window.addEventListener('appinstalled', () => {
    console.log('[Install] App installed');
    isInstalled = true;
    hideInstallButton();
    showSuccessMessage();
  });
}

/**
 * インストールを実行
 */
export async function promptInstall() {
  if (!deferredPrompt) {
    console.warn('[Install] No prompt available');
    return false;
  }

  // プロンプトを表示
  deferredPrompt.prompt();

  // ユーザーの選択を待つ
  const { outcome } = await deferredPrompt.userChoice;
  console.log('[Install] User choice:', outcome);

  // プロンプトをクリア
  deferredPrompt = null;

  return outcome === 'accepted';
}

/**
 * インストール済みかチェック
 */
export function checkInstalled() {
  return isInstalled;
}

function showInstallButton() {
  const button = document.getElementById('install-button');
  if (button) {
    button.style.display = 'block';
    button.addEventListener('click', async () => {
      const installed = await promptInstall();
      if (installed) {
        button.style.display = 'none';
      }
    });
  }
}

function hideInstallButton() {
  const button = document.getElementById('install-button');
  if (button) {
    button.style.display = 'none';
  }
}

function showSuccessMessage() {
  // トースト通知などで成功を表示
  console.log('[Install] Installation successful!');
}
```

---

## 4. Webアプリ実装詳細

### 4.1 メインUI（index.html）

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="任意のThree.jsシーンをVR/AR対応に変換">
  <meta name="theme-color" content="#60a5fa">

  <title>ChocoDrop XR Wrapper</title>

  <!-- PWA -->
  <link rel="manifest" href="/manifest.json">
  <link rel="icon" href="/icons/icon-192.png">
  <link rel="apple-touch-icon" href="/icons/icon-192.png">

  <!-- Styles -->
  <link rel="stylesheet" href="/assets/styles/app.css">
</head>
<body>
  <div id="app">
    <!-- ヘッダー -->
    <header class="app-header">
      <div class="container">
        <h1 class="app-title">
          🍫 ChocoDrop XR Wrapper
        </h1>
        <button id="install-button" class="install-button" style="display: none;">
          📱 インストール
        </button>
      </div>
    </header>

    <!-- メインコンテンツ -->
    <main class="app-main">
      <div class="container">
        <!-- モード選択 -->
        <div class="mode-selector">
          <button class="mode-button active" data-mode="url">
            🌐 URLから
          </button>
          <button class="mode-button" data-mode="bookmarklet">
            🔖 ブックマークレット
          </button>
          <button class="mode-button" data-mode="extension">
            🧩 拡張機能
          </button>
        </div>

        <!-- URL入力モード -->
        <div id="url-mode" class="mode-content active">
          <div class="url-input-section">
            <h2>Three.js シーンのURLを入力</h2>
            <p class="hint">GitHub Pages、CodePen、Glitchなど、任意のURLに対応</p>

            <div class="input-group">
              <input
                type="url"
                id="scene-url"
                class="url-input"
                placeholder="https://example.github.io/three-scene/"
                autocomplete="url"
              />
              <button id="load-button" class="primary-button">
                XR化して表示
              </button>
            </div>

            <!-- 履歴 -->
            <div id="history-section" class="history-section">
              <h3>最近使ったシーン</h3>
              <ul id="history-list" class="history-list">
                <!-- 動的に追加 -->
              </ul>
            </div>
          </div>

          <!-- プレビュー -->
          <div id="preview-section" class="preview-section" style="display: none;">
            <div class="preview-header">
              <button id="back-button" class="back-button">
                ← 戻る
              </button>
              <div class="xr-controls">
                <button id="vr-button" class="xr-button">
                  🥽 VRモード
                </button>
                <button id="ar-button" class="xr-button">
                  📱 ARモード
                </button>
              </div>
            </div>

            <div class="preview-container">
              <iframe
                id="scene-iframe"
                class="scene-iframe"
                sandbox="allow-scripts allow-same-origin allow-webxr"
              ></iframe>
            </div>

            <div class="chocodrop-controls">
              <input
                type="text"
                id="command-input"
                class="command-input"
                placeholder="[@] コマンドを入力..."
              />
            </div>
          </div>
        </div>

        <!-- ブックマークレットモード -->
        <div id="bookmarklet-mode" class="mode-content">
          <div class="bookmarklet-section">
            <h2>ブックマークレットを作成</h2>
            <p class="hint">ドラッグ＆ドロップでブックマークバーに追加できます</p>

            <div class="bookmarklet-generator">
              <div class="bookmarklet-options">
                <label>
                  <input type="checkbox" id="auto-detect" checked />
                  自動検出を有効化
                </label>
                <label>
                  <input type="checkbox" id="show-ui" checked />
                  UIを表示
                </label>
                <label>
                  デフォルトモード:
                  <select id="default-mode">
                    <option value="vr">VR</option>
                    <option value="ar">AR</option>
                  </select>
                </label>
              </div>

              <div class="bookmarklet-result">
                <a
                  id="bookmarklet-link"
                  class="bookmarklet-link"
                  href="javascript:void(0);"
                  draggable="true"
                >
                  🍫 ChocoDrop XR
                </a>
                <button id="copy-bookmarklet" class="copy-button">
                  📋 コピー
                </button>
              </div>

              <div class="bookmarklet-usage">
                <h3>使い方</h3>
                <ol>
                  <li>上のボタンをブックマークバーにドラッグ</li>
                  <li>Three.jsを使っているページを開く</li>
                  <li>ブックマークをクリック</li>
                  <li>VR/ARモードボタンが表示されます！</li>
                </ol>
              </div>
            </div>
          </div>
        </div>

        <!-- 拡張機能モード -->
        <div id="extension-mode" class="mode-content">
          <div class="extension-section">
            <h2>Chrome拡張機能をインストール</h2>
            <p class="hint">より強力な自動XR化機能を利用できます</p>

            <div class="extension-features">
              <div class="feature">
                <h3>🔍 自動検出</h3>
                <p>Three.jsを使用しているページを自動検出</p>
              </div>
              <div class="feature">
                <h3>⚡ ワンクリックXR化</h3>
                <p>拡張機能アイコンをクリックするだけ</p>
              </div>
              <div class="feature">
                <h3>⚙️ カスタマイズ</h3>
                <p>デフォルト設定をカスタマイズ可能</p>
              </div>
            </div>

            <button id="install-extension" class="primary-button">
              Chrome ウェブストアで入手
            </button>
          </div>
        </div>
      </div>
    </main>

    <!-- フッター -->
    <footer class="app-footer">
      <div class="container">
        <p>&copy; 2025 ChocoDrop Project</p>
        <nav>
          <a href="/docs">ドキュメント</a>
          <a href="https://github.com/nyukicorn/chocodrop">GitHub</a>
          <a href="/privacy">プライバシー</a>
        </nav>
      </div>
    </footer>
  </div>

  <!-- Scripts -->
  <script type="module" src="/assets/scripts/app.js"></script>
</body>
</html>
```

### 4.2 WebアプリJavaScript

```javascript
// src/web-app/index.js

import { initInstallPrompt, promptInstall } from './services/install-prompt.js';
import { loadScene, sendXRCommand } from './services/iframe-bridge.js';
import { saveHistory, getHistory } from './services/storage.js';
import { generateBookmarklet } from '../bookmarklet/generator.js';

class ChocoDropWebApp {
  constructor() {
    this.currentMode = 'url';
    this.currentURL = null;
    this.iframe = null;

    this.init();
  }

  init() {
    // PWAインストールプロンプトを初期化
    initInstallPrompt();

    // モード切り替え
    this.setupModeSwitcher();

    // URL入力モード
    this.setupURLMode();

    // ブックマークレットモード
    this.setupBookmarkletMode();

    // 拡張機能モード
    this.setupExtensionMode();

    // 履歴を読み込み
    this.loadHistory();

    // Service Worker登録
    this.registerServiceWorker();
  }

  setupModeSwitcher() {
    const buttons = document.querySelectorAll('.mode-button');
    const contents = document.querySelectorAll('.mode-content');

    buttons.forEach(button => {
      button.addEventListener('click', () => {
        const mode = button.dataset.mode;

        // アクティブ状態を切り替え
        buttons.forEach(b => b.classList.remove('active'));
        button.classList.add('active');

        contents.forEach(c => c.classList.remove('active'));
        document.getElementById(`${mode}-mode`).classList.add('active');

        this.currentMode = mode;
      });
    });
  }

  setupURLMode() {
    const input = document.getElementById('scene-url');
    const loadButton = document.getElementById('load-button');
    const backButton = document.getElementById('back-button');
    const vrButton = document.getElementById('vr-button');
    const arButton = document.getElementById('ar-button');

    loadButton.addEventListener('click', async () => {
      const url = input.value.trim();
      if (!url) {
        alert('URLを入力してください');
        return;
      }

      try {
        await this.loadSceneURL(url);
      } catch (error) {
        console.error('Failed to load scene:', error);
        alert('シーンの読み込みに失敗しました');
      }
    });

    backButton.addEventListener('click', () => {
      this.closePreview();
    });

    vrButton.addEventListener('click', () => {
      this.enterXR('vr');
    });

    arButton.addEventListener('click', () => {
      this.enterXR('ar');
    });
  }

  async loadSceneURL(url) {
    console.log('Loading scene:', url);

    // 入力セクションを非表示
    document.querySelector('.url-input-section').style.display = 'none';

    // プレビューセクションを表示
    const previewSection = document.getElementById('preview-section');
    previewSection.style.display = 'block';

    // iframeに読み込み
    this.iframe = document.getElementById('scene-iframe');
    await loadScene(this.iframe, url);

    // 履歴に保存
    saveHistory(url);
    this.currentURL = url;

    // 履歴を更新
    this.loadHistory();
  }

  closePreview() {
    document.querySelector('.url-input-section').style.display = 'block';
    document.getElementById('preview-section').style.display = 'none';

    if (this.iframe) {
      this.iframe.src = 'about:blank';
      this.iframe = null;
    }

    this.currentURL = null;
  }

  async enterXR(mode) {
    if (!this.iframe) {
      console.error('No iframe loaded');
      return;
    }

    try {
      await sendXRCommand(this.iframe, { type: 'ENTER_XR', mode });
    } catch (error) {
      console.error('Failed to enter XR:', error);
      alert(`${mode.toUpperCase()}モードの開始に失敗しました`);
    }
  }

  setupBookmarkletMode() {
    const autoDetect = document.getElementById('auto-detect');
    const showUI = document.getElementById('show-ui');
    const defaultMode = document.getElementById('default-mode');
    const bookmarkletLink = document.getElementById('bookmarklet-link');
    const copyButton = document.getElementById('copy-bookmarklet');

    const updateBookmarklet = () => {
      const options = {
        autoDetect: autoDetect.checked,
        showUI: showUI.checked,
        defaultMode: defaultMode.value
      };

      const code = generateBookmarklet(options);
      bookmarkletLink.href = code;
    };

    autoDetect.addEventListener('change', updateBookmarklet);
    showUI.addEventListener('change', updateBookmarklet);
    defaultMode.addEventListener('change', updateBookmarklet);

    copyButton.addEventListener('click', () => {
      navigator.clipboard.writeText(bookmarkletLink.href);
      copyButton.textContent = '✅ コピーしました';
      setTimeout(() => {
        copyButton.textContent = '📋 コピー';
      }, 2000);
    });

    // 初期化
    updateBookmarklet();
  }

  setupExtensionMode() {
    const installButton = document.getElementById('install-extension');

    installButton.addEventListener('click', () => {
      // Chrome Web Storeへのリンク（実装時に設定）
      window.open('https://chrome.google.com/webstore/detail/chocodrop-xr', '_blank');
    });
  }

  loadHistory() {
    const historyList = document.getElementById('history-list');
    const history = getHistory();

    historyList.innerHTML = '';

    if (history.length === 0) {
      historyList.innerHTML = '<li class="empty">履歴はまだありません</li>';
      return;
    }

    history.forEach((item, index) => {
      const li = document.createElement('li');
      li.className = 'history-item';

      const link = document.createElement('a');
      link.href = '#';
      link.textContent = item.url;
      link.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('scene-url').value = item.url;
        this.loadSceneURL(item.url);
      });

      const deleteButton = document.createElement('button');
      deleteButton.className = 'delete-button';
      deleteButton.textContent = '×';
      deleteButton.addEventListener('click', () => {
        this.deleteHistory(index);
      });

      li.appendChild(link);
      li.appendChild(deleteButton);
      historyList.appendChild(li);
    });
  }

  deleteHistory(index) {
    const history = getHistory();
    history.splice(index, 1);
    localStorage.setItem('chocodrop-history', JSON.stringify(history));
    this.loadHistory();
  }

  async registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      console.warn('Service Worker not supported');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      console.log('Service Worker registered:', registration);

      // 更新チェック
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // 新しいバージョンが利用可能
            if (confirm('新しいバージョンが利用可能です。更新しますか？')) {
              newWorker.postMessage({ type: 'SKIP_WAITING' });
              window.location.reload();
            }
          }
        });
      });
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  }
}

// アプリ初期化
document.addEventListener('DOMContentLoaded', () => {
  new ChocoDropWebApp();
});
```

---

## 5. 実装ロードマップ

### 5.1 フェーズ1: 基盤構築（Week 1-2）

#### Week 1: PWA基本実装
- [ ] manifest.json作成
- [ ] Service Worker実装（基本キャッシュ）
- [ ] インストールプロンプト実装
- [ ] アイコン/スクリーンショット作成

#### Week 2: WebアプリUI実装
- [ ] HTML/CSS実装
- [ ] モード切り替え機能
- [ ] URL入力UI
- [ ] 履歴管理機能

### 5.2 フェーズ2: コア機能（Week 3-4）

#### Week 3: XR Wrapper実装
- [ ] Three.js自動検出アルゴリズム
- [ ] XR Wrapper クラス実装
- [ ] アニメーションループ変換
- [ ] XR UI作成

#### Week 4: iframe統合
- [ ] iframe読み込み機能
- [ ] postMessage通信プロトコル
- [ ] XRスクリプト注入
- [ ] CORS対策実装

### 5.3 フェーズ3: 追加機能（Week 5-6）

#### Week 5: ブックマークレット
- [ ] ブックマークレット生成機能
- [ ] カスタマイズUI
- [ ] 使い方ガイド

#### Week 6: Chrome拡張機能
- [ ] manifest.json作成
- [ ] コンテンツスクリプト
- [ ] ポップアップUI
- [ ] オプション画面

### 5.4 フェーズ4: テスト・最適化（Week 7-8）

#### Week 7: テスト
- [ ] ユニットテスト
- [ ] E2Eテスト
- [ ] XRデバイステスト
- [ ] パフォーマンステスト

#### Week 8: 最適化・リリース
- [ ] パフォーマンス最適化
- [ ] バンドルサイズ削減
- [ ] ドキュメント作成
- [ ] デプロイ準備

---

## 6. デプロイ計画

### 6.1 ホスティング

#### GitHub Pages（推奨）
- 無料
- HTTPS対応
- カスタムドメイン可能
- CI/CD統合

#### Vercel/Netlify
- PWA最適化
- 自動デプロイ
- プレビュー環境
- エッジ配信

### 6.2 CI/CD

```yaml
# .github/workflows/deploy.yml
name: Deploy PWA

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build:pwa

      - name: Test
        run: npm test

      - name: Deploy to GitHub Pages
        if: github.ref == 'refs/heads/main'
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

---

## 7. 運用・保守

### 7.1 監視

- **Lighthouse CI**: PWAスコア監視
- **Sentry**: エラートラッキング
- **Google Analytics**: 利用状況分析

### 7.2 更新戦略

- **バージョニング**: セマンティックバージョニング
- **リリースノート**: 各バージョンの変更を記録
- **後方互換性**: 古いバージョンとの互換性維持

---

## 8. まとめ

ChocoDrop XR Wrapperは、PWA技術を活用することで：

✅ **インストール可能**: ホーム画面に追加してネイティブアプリのように使用
✅ **オフライン対応**: Service Workerによるキャッシュ
✅ **高速**: 静的アセットの事前キャッシュ
✅ **クロスプラットフォーム**: デスクトップ/モバイル両対応
✅ **更新容易**: Web技術なので即座に更新可能

8週間の開発期間で、完全なPWA/Webアプリとしてリリース可能です。

---

**文書終わり**
