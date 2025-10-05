# ChocoDrop
ちょこっとDrop。
世界が咲く。

Drop a little, bloom a lot.

- 🌐 HP: https://nyukicorn.github.io/chocodrop/
- 🎮 Demo: https://nyukicorn.github.io/chocodrop/examples/basic/
- 📚 Docs: ./docs/GETTING_STARTED.md

## 🆕 新アーキテクチャ（v1.0.2-alpha.0）

ChocoDrop は常駐 daemon + ブラウザ SDK の新アーキテクチャに移行しました！

### 🌐 推奨ブラウザ

**Chrome（推奨・動作確認済み）**
- ✅ Private Network Access (PNA) 完全サポート
- ✅ localStorage persistence 実装
- ✅ すべての機能が安定動作

**⚠️ 他のブラウザについて:**
Safari/Firefox/Edgeは現在サポートしていません。Chromeの使用を強く推奨します。

### 🔒 Origin許可設定

ChocoDrop は CORS allowlist でアクセスを制御しています。

**デフォルトで許可されているOrigin:**
- `http://localhost:*`（全ポート）- 開発環境
- `http://127.0.0.1:*`（全ポート）- 開発環境
- `https://threejs.org` - ブックマークレット用

**自分のサイトで使う場合:**

`~/.config/chocodrop/allowlist.json` を作成・編集:

```json
{
  "origins": [
    "http://localhost:*",
    "http://127.0.0.1:*",
    "https://threejs.org",
    "https://your-site.com"
  ]
}
```

Daemon を再起動すると反映されます。

⚠️ **信頼できるサイトのみ追加してください**

### 🚀 クイックスタート

#### Step 1: デーモンを起動

**npm（推奨・標準）:**
```bash
npx --yes @chocodrop/daemon@alpha
```

**pnpm（高速・開発者向け）:**
```bash
pnpm dlx @chocodrop/daemon@alpha
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

---

## 📚 詳細ドキュメント

v1.0.2-alpha.0 で新アーキテクチャに移行しました。旧API（v1.x）をお探しの方は [docs/OLD_API.md](docs/OLD_API.md) をご覧ください。

### 新機能・トラブルシューティング
- [トラブルシューティング](docs/TROUBLESHOOTING.md)
- [API リファレンス](docs/API.md)
- [セットアップガイド](docs/SETUP.md)

---

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🔗 Links

- **GitHub:** https://github.com/nyukicorn/chocodrop
- **Examples:** [examples/](examples/)

---
