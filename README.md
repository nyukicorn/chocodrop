# ChocoDrop

ちょこっとDrop。世界が咲く。
Drop a little, bloom a lot.

**テキストや音声で、Three.js シーンに瞬時にオブジェクトを追加できるブラウザツール**

A browser-based tool that enables instant 3D object creation and scene manipulation in Three.js using natural language commands.

<div align="center">

[![Website](https://img.shields.io/badge/🌐_Website-ChocoDrop-00d9ff?style=for-the-badge)](https://nyukicorn.github.io/chocodrop/)
[![Demo](https://img.shields.io/badge/🎮_Try_Demo-Live-ff69b4?style=for-the-badge)](https://nyukicorn.github.io/chocodrop/examples/basic/)
[![Docs](https://img.shields.io/badge/📚_Docs-Setup-4CAF50?style=for-the-badge)](./docs/SETUP.md)

</div>

---

## ✨ できること / What You Can Do

### 誰でもすぐ試せる

**デモで体験 → プリセットシーンを操作**
_Try the demo → Interact with preset scenes_

[Basic Demo](https://nyukicorn.github.io/chocodrop/examples/basic/) でUIを体験できます。

### KAMUI Code + daemon 設定で可能になる（開発者向け）

**"右上に桜の3Dモデルを置いて" → 瞬時に生成・配置**
_"Put a cherry blossom 3D model on the upper right" → Instantly generates and places_

**"このオブジェクトをモノクロにして" → すぐに変換**
_"Make this object monochrome" → Immediately transforms_

⚠️ **注意:** AI生成機能は **ローカル環境でのKAMUI Code設定が必要**です。
ブックマークレットや配布版daemonでは、UIの表示のみ可能です。

詳細: [D. 生成機能まで有効化する](#d-生成機能まで有効化するkamui-code--ローカルサーバー)

---

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

#### 1. まずは目的に合わせてルートを選ぶ

| 目的 | 推奨ルート | 所要時間 | 主な手順 |
| --- | --- | --- | --- |
| **雰囲気をすぐ体験したい** | デモ版（ホスト済み or ローカル） | 1 分 | ブラウザでサンプルを開くだけ |
| **threejs.org 等の既存サイトで試したい** | ブックマークレット | 2–3 分 | daemon を起動 → ブックマークを登録 → 対象ページで実行 |
| **自分の Three.js/Vite/Webpack プロジェクトに組み込みたい** | SDK + ローカル daemon（配布版） | 5–10 分 | daemon 起動 → SDK を読み込み → `ready()` `attach()` を呼ぶ |
| **生成系機能を含めたフル構成を整えたい** | ローカル daemon + KAMUI Code 設定 | 10 分〜 | `config.json` を設定 → `npm run dev` → docs/SETUP.md 参照 |

気になる行をクリック（またはスクロール）して、下記の詳細セクションから該当手順をたどってください。

#### 2. シナリオ別ガイド

##### A. ブラウザで今すぐ試す（デモ版）

- **オンラインですぐ試す:** [Basic Demo](https://nyukicorn.github.io/chocodrop/examples/basic/) を開くだけで UI を体験できます。
- **ローカルで試す:**
  ```bash
  npm run example:basic
  ```
  ブラウザで `http://localhost:8000/basic/index.html` を開きます。ネットワークが制限されている環境でも動作確認できます。
- さらに世界観を試したい場合は `examples/` ディレクトリに複数のシーンが用意されています。

##### B. 外部サイトにワンクリック注入（ブックマークレット）

1. **daemon を起動**（初回のみ）
   ```bash
   # npm 推奨
   npx --yes @chocodrop/daemon@alpha

   # または pnpm
   pnpm dlx @chocodrop/daemon@alpha
   ```
   起動後は `http://127.0.0.1:43110` で SDK/UI が配信されます。
2. **ブックマークレットを登録**
   [Bookmarklet v2](https://nyukicorn.github.io/chocodrop/examples/bookmarklet-v2.html) を開き、「🍫 ChocoDrop v2」ボタンをブックマークバーへドラッグ＆ドロップします。
3. **対象ページで実行**
   threejs.org など任意の Three.js ページで登録したブックマークをクリックすると、右下に ChocoDrop UI が表示されます。daemon が停止している場合は Toast UI が起動コマンドを案内します。
4. **DevTools スニペット派のための代替**
   `bookmarklet-code.js` の内容を Chrome の Snippets に貼り付けて実行すれば、同じトースト UI を呼び出せます。

##### C. 自分の Three.js プロジェクトに組み込む（配布版）

1. **前提**
   - Node.js 16+ / npm または pnpm
   - Three.js r170 付近（推奨）
2. **daemon をローカルで起動**
   ```bash
   npx --yes @chocodrop/daemon@alpha
   # 既存ポートと衝突する場合は --port 43111 などを付与
   ```
3. **SDK を読み込む（CDN 方式）**
   HTML の `<head>` などに以下を追加します。
   ```html
   <script src="http://127.0.0.1:43110/sdk.js"></script>
   ```
   Three.js/OrbitControls をすでに読み込んでいれば、そのまま `ready()` → `attach()` を呼べます。
4. **シーンにアタッチ**
   ```javascript
   await window.chocodrop.ready();
   await window.chocodrop.attach(scene, {
     camera,
     renderer,
     onControlsToggle: (disabled) => {
       controls.enabled = !disabled;
     }
   });
   ```
   UI が表示され、`@` キーから操作できれば成功です。
5. **npm で取り込む場合**
   ```bash
   npm install chocodrop three
   ```
   ```javascript
   import { createChocoDrop } from 'chocodrop';

   const choco = createChocoDrop(scene, {
     camera,
     renderer,
     serverUrl: 'http://127.0.0.1:43110'
   });
   ```
   bundler 向けの詳細手順は [`docs/INTEGRATION.md`](docs/INTEGRATION.md) を参照してください。

##### D. 生成機能まで有効化する（KAMUI Code + ローカルサーバー）

1. リポジトリを clone し、依存関係をインストールします。
   ```bash
   git clone https://github.com/nyukicorn/chocodrop.git
   cd chocodrop
   npm install
   ```
2. `npm run setup:mcp` で KAMUI Code の設定ファイルパスを登録します。
3. `npm run dev` を実行すると `http://localhost:3011` でサーバーが起動し、生成 API が利用可能になります。
4. 詳細な構成やモデル設定は [`docs/SETUP.md`](docs/SETUP.md) を参照してください。

> 🔍 **ヒント**: daemon や `sdk.js` のレスポンスヘッダーに `X-ChocoDrop-SDK-Source: dist` が表示されていれば、ビルド済みバンドルが正しく配信されています。ブラウザで `await window.chocodrop.ready()` を実行して接続状況をチェックできます。

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

## ❓ トラブルシューティング

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

## 📚 詳細ドキュメント

v1.0.2-alpha.0 で新アーキテクチャに移行しました。旧API（v1.x）をお探しの方は [docs/OLD_API.md](docs/OLD_API.md) をご覧ください。

### 新機能・トラブルシューティング
- [トラブルシューティング](docs/TROUBLESHOOTING.md)
- [API リファレンス](docs/API.md)
- [セットアップガイド](docs/SETUP.md)

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🔗 Links

- **GitHub:** https://github.com/nyukicorn/chocodrop
- **Examples:** [examples/](examples/)
