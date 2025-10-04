# ChocoDrop
ちょこっとDrop。
世界が咲く。

Drop a little, bloom a lot.

- 🌐 HP: https://nyukicorn.github.io/chocodrop/
- 🎮 Demo: https://nyukicorn.github.io/chocodrop/examples/basic/
- 📚 Docs: ./docs/GETTING_STARTED.md

## 🆕 新アーキテクチャ（v1.0.2-alpha.0）

ChocoDrop は常駐 daemon + ブラウザ SDK の新アーキテクチャに移行しました！

### 🚀 クイックスタート

#### Step 1: デーモンを起動
```bash
npx --yes @chocodrop/daemon@alpha
```

デーモンが起動すると、`http://127.0.0.1:43110` でSDKが配信されます。

#### Step 2: Three.jsページで統合（2つの方法）

##### 方法A: Bookmarklet（推奨 - ワンクリック統合）

このリンクをブックマークバーにドラッグ＆ドロップ:

**[🍫 ChocoDrop v2](javascript:(async()=>{const b='http://127.0.0.1:43110';async function check(){try{const r=await fetch(b+'/v1/health');return r.ok}catch{return false}}async function showToast(){if(document.getElementById('__cd_toast__'))return;const t=document.createElement('div');t.id='__cd_toast__';Object.assign(t.style,{position:'fixed',right:'16px',bottom:'16px',zIndex:'2147483647',width:'min(380px,calc(100vw-32px))',fontFamily:'ui-sans-serif,system-ui,-apple-system,sans-serif'});t.innerHTML=`<div style='background:#18181c;color:#fff;padding:14px 16px;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.35)'><div style='font-weight:700;display:flex;gap:8px;align-items:center'><span>🍫 ChocoDrop が起動していません</span><span id='cd-dot' style='margin-left:auto;width:8px;height:8px;border-radius:50%;background:#f43'></span></div><div style='font-size:12px;opacity:.85;margin-top:6px'>ローカル(127.0.0.1)のみで動作・外部送信なし。起動すると自動で接続します。</div><div style='display:grid;gap:8px;margin-top:12px'><button id='cd-guide' style='padding:10px 12px;border:0;border-radius:10px;cursor:pointer;background:#fff;color:#111;font-weight:600'>起動ガイドを開く</button><button id='cd-retry' style='padding:10px 12px;border:1px solid #444;border-radius:10px;cursor:pointer;background:transparent;color:#fff'>再試行</button></div></div>`;document.body.appendChild(t);const d=t.querySelector('#cd-dot'),g=document.createElement('dialog');g.style.border='0';g.style.borderRadius='14px';g.style.padding='0';g.style.maxWidth='560px';g.style.width='calc(100vw-40px)';g.innerHTML=`<div style='background:#161618;color:#fff;padding:16px;border-radius:14px'><div style='font-weight:700;margin-bottom:8px'>起動ガイド</div><pre id='cd-code' style='background:#0e0e10;color:#eaeaea;padding:12px;border-radius:10px;overflow:auto;margin:0;font-size:13px'>npx --yes @chocodrop/daemon@alpha</pre><div style='display:flex;gap:8px;justify-content:flex-end;margin-top:12px'><button id='cd-copy' style='padding:8px 10px;border-radius:8px;border:0;cursor:pointer;background:#444;color:#fff'>コピー</button><button id='cd-done' style='padding:8px 10px;border-radius:8px;border:0;cursor:pointer;background:#fff;color:#111'>OK</button></div></div>`;document.body.appendChild(g);t.querySelector('#cd-guide').onclick=()=>g.showModal();g.querySelector('#cd-done').onclick=()=>g.close();g.querySelector('#cd-copy').onclick=async()=>{try{await navigator.clipboard.writeText('npx --yes @chocodrop/daemon@alpha');const btn=g.querySelector('#cd-copy');btn.textContent='コピー完了！';setTimeout(()=>{btn.textContent='コピー'},1000)}catch{}};t.querySelector('#cd-retry').onclick=poll;async function poll(){const ok=await check();d.style.background=ok?'#0f6':'#f43';if(ok){t.querySelector('span').textContent='🍫 接続できました';setTimeout(()=>{t.remove();loadSDK()},700)}else{setTimeout(poll,2500)}}poll()}function loadSDK(){if(document.getElementById('__chocodrop_sdk'))return;const s=document.createElement('script');s.id='__chocodrop_sdk';s.src=b+'/sdk.js';s.onload=()=>window.chocodrop?.ready?.().then(()=>window.chocodrop.attach(window.scene||null,{camera:window.camera,renderer:window.renderer})).catch(e=>console.warn('ChocoDrop:',e));document.head.appendChild(s)}const isRunning=await check();if(isRunning){loadSDK()}else{showToast()}})();)**

> **HTMLファイルで試す場合**: [examples/bookmarklet-v2.html](examples/bookmarklet-v2.html) を開いてブックマークバーに追加

**使い方:**
1. Three.jsのページ（例: https://threejs.org/examples/）を開く
2. ブックマークレットをクリック
3. デーモン起動中なら即座にChocoDrop UI表示
4. デーモン停止中なら右下にToast UIが表示され、起動を案内

##### 方法B: DevToolsスニペット（コンソールから実行）

ブラウザのコンソール（F12）を開いて、以下のコードを貼り付け:

```javascript
(async () => {
  const b = 'http://127.0.0.1:43110';

  async function check() {
    try {
      const r = await fetch(b + '/v1/health');
      return r.ok;
    } catch {
      return false;
    }
  }

  async function showToast() {
    if (document.getElementById('__cd_toast__')) return;

    const t = document.createElement('div');
    t.id = '__cd_toast__';
    Object.assign(t.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      zIndex: '2147483647',
      width: 'min(380px, calc(100vw - 32px))',
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif'
    });

    t.innerHTML = `
      <div style="background:#18181c; color:#fff; padding:14px 16px; border-radius:14px; box-shadow:0 10px 30px rgba(0,0,0,.35)">
        <div style="font-weight:700; display:flex; gap:8px; align-items:center">
          <span>🍫 ChocoDrop が起動していません</span>
          <span id="cd-dot" style="margin-left:auto;width:8px;height:8px;border-radius:50%;background:#f43"></span>
        </div>
        <div style="font-size:12px; opacity:.85; margin-top:6px">ローカル(127.0.0.1)のみで動作・外部送信なし。起動すると自動で接続します。</div>
        <div style="display:grid; gap:8px; margin-top:12px">
          <button id="cd-guide" style="padding:10px 12px; border:0; border-radius:10px; cursor:pointer; background:#fff; color:#111; font-weight:600;">起動ガイドを開く</button>
          <button id="cd-retry" style="padding:10px 12px; border:1px solid #444; border-radius:10px; cursor:pointer; background:transparent; color:#fff;">再試行</button>
        </div>
      </div>`;

    document.body.appendChild(t);

    const d = t.querySelector('#cd-dot');
    const g = document.createElement('dialog');
    g.style.border = '0';
    g.style.borderRadius = '14px';
    g.style.padding = '0';
    g.style.maxWidth = '560px';
    g.style.width = 'calc(100vw - 40px)';
    g.innerHTML = `
      <div style="background:#161618; color:#fff; padding:16px; border-radius:14px">
        <div style="font-weight:700; margin-bottom:8px">起動ガイド</div>
        <pre id="cd-code" style="background:#0e0e10; color:#eaeaea; padding:12px; border-radius:10px; overflow:auto; margin:0; font-size:13px">npx --yes @chocodrop/daemon@alpha</pre>
        <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:12px">
          <button id="cd-copy" style="padding:8px 10px; border-radius:8px; border:0; cursor:pointer; background:#444; color:#fff">コピー</button>
          <button id="cd-done" style="padding:8px 10px; border-radius:8px; border:0; cursor:pointer; background:#fff; color:#111">OK</button>
        </div>
      </div>`;

    document.body.appendChild(g);

    t.querySelector('#cd-guide').onclick = () => g.showModal();
    g.querySelector('#cd-done').onclick = () => g.close();
    g.querySelector('#cd-copy').onclick = async () => {
      try {
        await navigator.clipboard.writeText('npx --yes @chocodrop/daemon@alpha');
        const btn = g.querySelector('#cd-copy');
        btn.textContent = 'コピー完了！';
        setTimeout(() => { btn.textContent = 'コピー'; }, 1000);
      } catch (e) {
        console.error('Clipboard error:', e);
      }
    };

    t.querySelector('#cd-retry').onclick = poll;

    async function poll() {
      const ok = await check();
      d.style.background = ok ? '#0f6' : '#f43';
      if (ok) {
        t.querySelector('span').textContent = '🍫 接続できました';
        setTimeout(() => {
          t.remove();
          loadSDK();
        }, 700);
      } else {
        setTimeout(poll, 2500);
      }
    }

    poll();
  }

  function loadSDK() {
    if (document.getElementById('__chocodrop_sdk')) return;

    const s = document.createElement('script');
    s.id = '__chocodrop_sdk';
    s.src = b + '/sdk.js';
    s.onload = () => {
      console.log('✅ SDK loaded');
      window.chocodrop?.ready?.()
        .then(() => window.chocodrop.attach(window.scene || null, {
          camera: window.camera,
          renderer: window.renderer
        }))
        .catch(e => console.warn('ChocoDrop:', e));
    };
    s.onerror = () => console.error('❌ SDK load failed');
    document.head.appendChild(s);
  }

  console.log('🍫 ChocoDrop Bookmarklet v2');
  const isRunning = await check();
  console.log('Daemon status:', isRunning ? '✅ Running' : '❌ Stopped');

  if (isRunning) {
    loadSDK();
  } else {
    showToast();
  }
})();
```

> **Tip**: Chromeでスニペットとして登録すると、毎回コピペせずに実行できます（DevTools > Sources > Snippets）

---

### 💡 新機能（v1.0.2-alpha.0）

#### 🍬 Toast UI - 優しい起動案内
デーモンが起動していない場合、右下にToast UIが表示されます:

- **起動コマンドのコピー**: ワンクリックでコマンドをクリップボードにコピー
- **自動ポーリング**: 2.5秒間隔でデーモンの起動を自動チェック
- **接続成功**: デーモンが起動すると自動的にSDKを読み込み

#### 🔄 reload() API
設定をリロードできる新しいAPI:

```javascript
const result = await window.chocodrop.reload();
console.log(result); // {ok: true, message: "Configuration reloaded"}
```

#### 🌐 外部サイト対応 - Full UI表示
Bookmarkletやコンソールスニペットで外部サイト（threejs.org、CodePen、Glitch等）に統合した場合も、**フル機能のUIが表示されます**（プレースホルダーUIではありません）。

**特徴:**
- ✅ 完全なChocoDrop UIが表示
- ✅ THREE.jsが未読み込みでも自動的にCDNから取得
- ✅ ローカルデーモン(127.0.0.1)との通信のみ（外部送信なし）
- ⚠️ 現在、読み取り専用モード（AI生成などの書き込みAPIは Phase 2b で対応予定）

**セキュリティ設定:**
- Phase 2a: 読み取り専用エンドポイント（/v1/health, /sdk.js, /ui/, /vendor/, /generated/）は全オリジンからアクセス可能
- Phase 2b: 書き込みエンドポイント（/v1/generate等）はペアリング承認 + CSRF保護で有効化予定

#### 🏢 企業ポリシー配慮 - CDN制御
企業ネットワークでCDNアクセスが制限されている環境向けに、THREE.js読み込み動作をカスタマイズできます:

```html
<script>
  // CDNからのTHREE.js読み込みを無効化（ローカルフォールバックのみ使用）
  window.chocodropConfig = {
    allowCdn: false  // デフォルト: true
  };
</script>
<script src="http://127.0.0.1:43110/sdk.js"></script>
```

**カスタムTHREE.jsソース指定:**
```html
<script>
  window.chocodropConfig = {
    threeSrc: '/path/to/your/three.module.js'  // カスタムTHREE.jsパスを指定
  };
</script>
```

**THREE.js読み込みの優先順位:**
1. 既存の `window.THREE`（既に読み込まれている場合）
2. `window.chocodropConfig.threeSrc`（カスタムソース指定時）
3. CDN（`allowCdn: true` の場合、SRI付き安全な読み込み）
4. ローカルフォールバック（`/vendor/three-0.158.0.min.js`）

**セキュリティ機能:**
- THREE.js v0.158.0 に固定（バージョン固定で安全性向上）
- SRI（Subresource Integrity）による改ざん検知
- CDN失敗時のローカルフォールバック

---

### 📖 API使用例

#### 基本的な使い方
```html
<script src="http://127.0.0.1:43110/sdk.js"></script>
<script type="module">
  // SDK初期化を待機
  await window.chocodrop.ready();

  // Three.jsシーンにアタッチ
  await window.chocodrop.attach(scene, {
    camera: camera,
    renderer: renderer
  });
</script>
```

#### 設定のリロード
```javascript
// 設定ファイルを編集した後、再起動せずにリロード
const result = await window.chocodrop.reload();
if (result.ok) {
  console.log('✅ 設定をリロードしました');
}
```

---

### ❓ トラブルシューティング

**Bookmarkletが動かない**
- ブラウザのコンソール（F12）でエラーを確認
- デーモンが起動しているか確認: `http://127.0.0.1:43110/v1/health` にアクセス

**Toast UIが表示されない**
- デーモンが既に起動している可能性（正常な動作）
- ページをリロードしてもう一度試す

**CORSエラー**
- allowlist設定が必要な場合があります（詳細なガイドは次バージョンで追加予定）
- `~/.config/chocodrop/allowlist.json` で設定可能

---

## ⚡ 旧API（v1.x - 非推奨）

```bash
# npm/yarn
npm i chocodrop
import { createChocoDrop } from 'chocodrop';
createChocoDrop(scene, { camera, renderer, enableMouseInteraction: true });

# HTML (ES Modules)
import { createChocoDrop } from './src/index.js';
createChocoDrop(scene, { camera, renderer, enableMouseInteraction: true });
```

**⚠️ 注意:** 旧APIは v3.0 で削除予定です。新アーキテクチャへの移行を推奨します。

**🎮 使い方:** `@`キー → 自然言語入力 → 完了
**🖱️ 重要:** `enableMouseInteraction: true` でオブジェクト選択・移動・編集が可能に！
**📋 [サンプル](#完全なサンプル) | 📚 [API](#api-リファレンス) | 🔧 [カスタマイズ](#aiと一緒に作るカスタマイズ版)**

---

---

## 🎨 ChocoDrop って何？

Three.jsシーンをAI搭載のコンテンツスタジオに：

```javascript
// 自然言語でコンテンツを作成
"猫の置物を右上に作って" → AIが猫を生成して右上に配置
"桜を中央に配置" → 桜が瞬時に現れる
"モノクロにして" → 選択したオブジェクトがモノクロに
```

**対応環境:** Three.js、React Three Fiber、A-Frame、Next.js、HTML

## 🚀 **最小動作サンプル**

Three.jsに不慣れな方向けに、コピペで動く最小限のサンプルです：

```html
<!-- このHTMLをそのまま保存して使えます -->
<!DOCTYPE html>
<html>
<head>
    <style>body { margin: 0; }</style>
    <script type="module">
        import * as THREE from 'https://unpkg.com/three@latest/build/three.module.js';
        import { createChocoDrop } from 'https://unpkg.com/chocodrop@latest/src/index.js';

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.1, 1000);
        camera.position.z = 5;
        const renderer = new THREE.WebGLRenderer();
        renderer.setSize(innerWidth, innerHeight);
        document.body.appendChild(renderer.domElement);

        createChocoDrop(scene, { camera, renderer, enableMouseInteraction: true });

        function animate() {
            requestAnimationFrame(animate);
            renderer.render(scene, camera);
        }
        animate();
    </script>
</head>
<body></body>
</html>
```

---

## 🎯 あなたの環境を確認

### 🤔 **どちらの環境ですか？**

#### 📦 **npm環境**の場合
✅ `package.json` ファイルがある  
✅ `npm install` や `yarn add` を使っている  
✅ React, Vue, Next.js, Vite, Webpack等を使用  
→ **[npm環境の導入方法](#-npyarn環境)** へ

#### 📄 **HTML環境**の場合  
✅ HTMLファイルを直接編集している  
✅ `<script>` タグでJavaScriptを書いている  
✅ CodePen, JSFiddle等のオンラインエディタ使用  
→ **[HTML環境の導入方法](#-html環境-es-modules)** へ

### 💡 **迷った場合**
HTMLファイルを直接書いているなら **HTML環境**、  
フレームワークを使っているなら **npm環境** です。

---

## 🛠️ 導入方法

### 🚀 npm/yarn環境
```bash
npm install chocodrop three
```
```javascript
import * as THREE from 'three';
import { createChocoDrop } from 'chocodrop';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();

createChocoDrop(scene, { camera, renderer, enableMouseInteraction: true });
```

> ⚠️ API を利用するには ChocoDrop のローカル Express サーバーを起動する必要があります。リポジトリ直下で `npm run dev`（本番構成なら `npm start`）を実行し、`http://localhost:3011` で応答することを確認してください。MCP サーバー設定（`config.json` の `mcp` セクションなど）は任意で、画像生成を使わない場合は省略できます。

### 🔧 HTML環境 (ES Modules)

#### 📋 **事前準備**
1. [リポジトリをダウンロード](https://github.com/nyukicorn/chocodrop/archive/refs/heads/main.zip)
2. `chocodrop-main` フォルダを展開
3. あなたのHTMLファイルを同じ階層に配置
4. ローカルサーバーで配信（必須）:
   - **Python使用時**: `python -m http.server 8000`
   - **Node.js使用時**: `npx http-server`
   - **VS Code使用時**: Live Server拡張機能をインストールし、HTMLファイルで右クリック→「Open with Live Server」

> ⚠️ `index.html` をダブルクリックして `file://` で開くと ES Modules や Import Map が読み込めず、`chocodrop.esm.js` などが 404 になります。必ずローカルサーバー経由でアクセスしてください。あわせて API を利用する場合は別ターミナルで `npm run dev` を実行し、ChocoDrop ローカルサーバーを起動してください（MCP サーバー接続は任意）。

#### 💻 **推奨: Import Map使用**

##### ブラウザ対応状況
Import Map機能は以下のブラウザで動作します：
- Chrome 89+
- Edge 89+
- Safari 16.4+
- Firefox 108+

古いブラウザを使用している場合は、下記の直接パス指定の方法をご利用ください。
```html
<!DOCTYPE html>
<html>
<head>
    <script type="importmap">
    {
      "imports": {
        "three": "https://unpkg.com/three@latest/build/three.module.js",
        "three/": "https://unpkg.com/three@latest/",
        "chocodrop": "./src/index.js"
      }
    }
    </script>
</head>
<body>
    <script type="module">
      import * as THREE from 'three';
      import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
      import { createChocoDrop } from 'chocodrop';

      // あなたのThree.jsシーン
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
      const renderer = new THREE.WebGLRenderer();

      // ChocoDrop追加
      const chocoDrop = createChocoDrop(scene, { camera, renderer, enableMouseInteraction: true });
    </script>
</body>
</html>
```

#### 🔄 **代替: 直接パス指定**
```html
<script type="module">
  import * as THREE from 'https://unpkg.com/three@latest/build/three.module.js';
  import { createChocoDrop } from './chocodrop-main/src/index.js';
  
  // ChocoDrop初期化
  createChocoDrop(scene, { camera, renderer, enableMouseInteraction: true });
</script>
```

---

## 🆘 困ったときは

### 📦 **npm環境のトラブル**
- **「chocodrop が見つからない」** → `npm install chocodrop` 実行済みか確認
- **「createChocoDrop is not a function」** → `import { createChocoDrop }` の波括弧を確認
- **「Three.js エラー」** → `npm install three` でThree.jsをインストール

### 📄 **HTML環境のトラブル**
- **「Failed to resolve module」** → ファイルパスが正しいか確認（`./src/index.js`）
- **「Uncaught TypeError: Failed to resolve module specifier」** → Import Mapが正しく設定されているか確認。`<script type="importmap">`がHTMLの最初にあるか確認
- **「Import map エラー」** → `<script type="importmap">` がHTMLの最初にあるか確認
- **「CORS エラー」** → ローカルサーバー（Live Server拡張等）で開く
- **「MIME type エラー」** → ローカルファイルを直接開いている可能性。必ずローカルサーバー経由でアクセス

### 🔧 **共通のトラブル**
- **「動かない！」** → ブラウザの開発者ツール（F12）でエラー確認
- **「@キーが反応しない」** → `createChocoDrop` の後に `console.log('ChocoDrop ready!')` 追加
- **「createChocoDrop is not defined」** → インポート文の波括弧を確認：`import { createChocoDrop }` (波括弧必須)
- **「オブジェクトが選択できない」** → `enableMouseInteraction: true` を追加
- **「api/config 404エラー」** → 正常です。AI生成にはMCPサーバー起動が必要（インポート機能は動作します）
- **「AIが応答しない」** → サーバー（`npm run dev`）が起動しているか確認

### 💬 **サポート**
- **詳細エラー** → エラー内容をコピーしてAIに相談

---

## ✨ 特徴

| Feature | Description |
|---------|-------------|
| 🎯 **自然言語で3D配置** | 「右上」「中央」など日本語で指定 |
| 🔄 **リアルタイム編集** | 配置後もサイズ、位置、エフェクトを変更可能 |
| 🖱️ **マウス操作** | `enableMouseInteraction: true`でクリック選択・ドラッグ移動 |
| 📦 **フレームワーク自由** | どんなThree.js環境でも動作 |
| 🌐 **MCP統合** | 拡張可能なAIモデルサポート |
| 🎮 **直感的UI** | @キー起動、学習コスト不要 |

---

## 🌟 ChocoDrop の安心設計

### 💫 自由に実験、安心して創作
ChocoDrop は**クリエイティブな実験を自由に楽しめる**ように設計されています：

✨ **シーン内編集のみ** - 元のファイルは一切変更されません
✨ **シーンには保存されない** - 編集結果はシーンにも保存されません（一時的な表示のみ）
✨ **リアルタイム実験** - 「もしピンクだったら？」「オーロラエフェクトは？」気軽に試せます
✨ **元データ保護** - インポートした画像・動画は絶対に変更されません
✨ **クリーンスレート** - ページリロードで元の状態に戻ります  

### 🎬 作品は保存、編集は実験
- **🎥 AIで生成した画像・動画** → しっかり保存されます
- **🎨 色変更・エフェクト・レイアウト** → シーンにも保存されない（一時的な表示のみ）
- **📁 インポートしたファイル** → 元ファイルは完全に保護

**つまり：** 作品制作はしっかり、編集実験は自由に！

「ちょっと試してみたい」「どんな感じになるかな？」という好奇心を安心して満たせるツールです。

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

    <script type="module">
        // ES Modules使用（Import Map対応）
        import * as THREE from 'three';
        import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
        import { createChocoDrop } from 'chocodrop';

        // Scene setup
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a2e);

        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 2, 5);

        const renderer = new THREE.WebGLRenderer();
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.getElementById('container').appendChild(renderer.domElement);

        // Controls
        const controls = new OrbitControls(camera, renderer.domElement);

        // ChocoDrop initialization
        const chocoDrop = createChocoDrop(scene, {
            camera: camera,
            renderer: renderer,
            enableMouseInteraction: true,  // マウス操作を有効化
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
Clear Allボタン                      // → 全コンテンツを消去
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

**特殊効果（実際に動作する機能）:**

**✨ 透明度・色変更系:**
```
透明に変更          // 完全透明
半透明に変更        // 50%透明
不透明に変更        // 完全不透明
赤色に変更          // 赤色に変更
青色に変更          // 青色に変更
緑色に変更          // 緑色に変更
モノクロに変更      // グレースケール化
白黒に変更          // 同じくモノクロ化
```

**🎬 グリーンバック透過対応:**
```
グリーンバック      // 緑色背景の透明化
背景の緑を透過      // 同じ機能
```

**💡 グリーンバック画像・動画の生成:**
```
緑色の背景で猫の画像を作って    // 後で透過処理可能
グリーンバックで踊る人の動画   // 後で背景を透過できる
白背景で花の写真              // 白背景透過に対応
```

**🌈 その他の色も対応:**
```
背景の白を透過      // 白背景の透明化
背景の黒を透過      // 黒背景の透明化
背景の青を透過      // 青背景の透明化
背景の赤を透過      // 赤背景の透明化
背景の黄を透過      // 黄背景の透明化
背景のピンクを透過  // ピンク背景の透明化
背景のオレンジを透過 // オレンジ背景の透明化
背景の#FF0000を透過 // 16進数での任意色指定
```

**⚠️ 重要:** 単色で均一な背景のみ対応（グラデーションや複雑な背景は不可）

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

## 🌐 開発環境でのCORS設定

ChocoDrop サーバーは以下のオリジンからのリクエストを許可しています：

- `http://localhost:3000` - React、Next.js等の標準開発サーバー
- `http://localhost:3001` - ポート3000が使用中の場合のフォールバック
- `http://localhost:5173` - Vite開発サーバー
- `http://localhost:8080` - 汎用開発ポート

**異なるポートを使用する場合:**
`src/server/server.js` のCORS設定を更新してください：

```javascript
this.app.use(cors({
  origin: ['http://localhost:YOUR_PORT', ...existing_origins],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
```

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
npm start  # または npm run dev
```

### サーバー起動コマンド
- `npm run dev` - 開発モード（デバッグ情報付き）
- `npm start` - 本番モード
※ 両コマンドは現在同じ動作をします（port 3011で起動）

サーバーは `http://localhost:3011` で起動します

**必要環境:**
- Node.js 16以上
- AIモデル用のMCP設定

---

</details>

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🔗 Links

- **GitHub:** https://github.com/nyukicorn/chocodrop
- **Examples:** [examples/](examples/)

---
