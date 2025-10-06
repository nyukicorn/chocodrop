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

##### 方法A: ブックマークレット（推奨 - ワンクリック統合）

1. [https://nyukicorn.github.io/chocodrop/examples/bookmarklet-v2.html](https://nyukicorn.github.io/chocodrop/examples/bookmarklet-v2.html) を開く（ローカルの場合は `examples/bookmarklet-v2.html` をブラウザで開いてください）
2. ページ内の「🍫 ChocoDrop v2」ボタンをブックマークバーへドラッグ
3. Three.jsのページ（例: https://threejs.org/examples/）でブックマークをクリック
   - デーモン起動中 → 即座にUIが表示
   - 停止中 → 右下のトーストが起動方法を案内

> ブックマークバーが見えない場合: Chrome の「表示」>「常にブックマークバーを表示」を有効化してください。

##### 方法B: DevToolsスニペット（開発者モード向け）

1. Chromeで F12（または Ctrl+Shift+I / Cmd+Opt+I）を押し、Sources → Snippets を開く
2. 新規スニペットを作成し、`bookmarklet-code.js` の内容を貼り付けて保存
3. 実行するとブックマークレットと同じトーストUIが表示され、デーモン状態に応じてSDKを読み込みます

> ソースはリポジトリ直下の [bookmarklet-code.js](bookmarklet-code.js)。このファイルが常に最新の本番コードです。

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
