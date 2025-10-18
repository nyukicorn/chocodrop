# ChocoDrop

ちょこっとDrop。世界が咲く。
Drop a little, bloom a lot.

**Three.js シーンに UI とインタラクション機能を追加できるブラウザツール**

A browser-based tool for adding UI and interaction features to Three.js scenes.

<div align="center">

**[🌐 Website](https://nyukicorn.github.io/chocodrop/)** | **[🎮 Try Demo](https://nyukicorn.github.io/chocodrop/examples/basic/)** | **[📚 Docs](./docs/INTEGRATION.md)**

</div>

---

## 🚀 使い方（目的に合わせて選べます）

### ブラウザで雰囲気を感じたい

複数の世界観を用意しています：
- [Basic](https://nyukicorn.github.io/chocodrop/examples/basic/) - 雲の上でふわふわと浮かぶ、創造の種を落とす場所
- [Music Garden](https://nyukicorn.github.io/chocodrop/examples/music-garden/) - 散らばった硝子のかけらたちが集まり寄り添い、新たな花をそっと咲かせる世界
- [Wabi-Sabi](https://nyukicorn.github.io/chocodrop/examples/wabi-sabi/) - 音楽に共鳴する、墨が紡ぐ不完全な美の世界
- [Toy City](https://nyukicorn.github.io/chocodrop/examples/toy-city/) - 観覧車やメリーゴーランド、そして可愛いAIたちが回ってます！
- [Space](https://nyukicorn.github.io/chocodrop/examples/space/) - 銀河が広がり、3つの星雲が煌めく無限の宇宙
- その他 → [examples/](examples/)

---

### 既存サイトで使いたい（ブックマークレット）

daemon を起動してブックマークレット経由で統合：

```bash
npx --yes @chocodrop/daemon@alpha
```

[ブックマークレット登録ページ](https://nyukicorn.github.io/chocodrop/examples/bookmarklet-v2.html) → threejs.org 等で実行

詳細: [セクション B](#b-外部サイトにワンクリック注入ブックマークレット)

---

### 自分のプロジェクトに組み込みたい

daemon を起動して SDK を読み込む：

```bash
npx --yes @chocodrop/daemon@alpha
```

```html
<script src="http://127.0.0.1:43110/sdk.js"></script>
```

詳細: [統合ガイド](docs/INTEGRATION.md) / [セクション C](#c-自分の-threejs-プロジェクトに組み込む配布版)

---

### AI生成機能も使いたい

リポジトリをクローンしてフル機能を利用できます：

```bash
git clone https://github.com/nyukicorn/chocodrop.git
cd chocodrop
npm install
npm run setup:mcp  # KAMUI Code 設定
npm run dev        # サーバー起動
```

**できること**:
- ✅ "右上に桜の画像を置いて" → AI が生成・配置
- ✅ "このオブジェクトをモノクロにして" → AI が変換

⚠️ **注意**: AI生成には KAMUI Code の設定が必要です。
詳細: [AI生成セットアップ](docs/SETUP.md)

詳細な手順は下の「シナリオ別ガイド」を参照してください。

---

## 📖 シナリオ別ガイド

まずは目的に合わせてルートを選びましょう：

| 目的 | 方法 | 所要時間 | 主な手順 |
| --- | --- | --- | --- |
| **雰囲気をすぐ体験したい** | オンライン体験 | 1 分 | ブラウザでサンプルを開くだけ |
| **threejs.org 等の既存サイトで試したい** | ブックマークレット + daemon | 2–3 分 | daemon 起動 → ブックマークレット登録 → 対象ページで実行 |
| **自分のプロジェクトに組み込みたい** | daemon + SDK | 5–10 分 | daemon 起動 → SDK 読み込み → `ready()` `attach()` |
| **AI生成機能も使いたい** | リポジトリ clone + KAMUI Code 設定 | 10 分〜 | clone → `npm run setup:mcp` → `npm run dev` |

気になる行をクリック（またはスクロール）して、下記の手順をたどってください。

---

### A. ブラウザで体験

複数の世界観を用意しています：
- [Basic](https://nyukicorn.github.io/chocodrop/examples/basic/) - 雲の上でふわふわと浮かぶ、創造の種を落とす場所
- [Music Garden](https://nyukicorn.github.io/chocodrop/examples/music-garden/) - 散らばった硝子のかけらたちが集まり寄り添い、新たな花をそっと咲かせる世界
- [Wabi-Sabi](https://nyukicorn.github.io/chocodrop/examples/wabi-sabi/) - 音楽に共鳴する、墨が紡ぐ不完全な美の世界
- [Toy City](https://nyukicorn.github.io/chocodrop/examples/toy-city/) - 観覧車やメリーゴーランド、そして可愛いAIたちが回ってます！
- [Space](https://nyukicorn.github.io/chocodrop/examples/space/) - 銀河が広がり、3つの星雲が煌めく無限の宇宙
- その他 → [examples/](examples/)

**ローカルで体験:**
```bash
npm run example:basic  # または他の例
```

#### B. 外部サイトにワンクリック注入（ブックマークレット）

1. **daemon を起動**（初回のみ）
   ```bash
   # npm 推奨
   npx --yes @chocodrop/daemon@alpha

   # または pnpm
   pnpm dlx @chocodrop/daemon@alpha
   ```
   起動すると、ブラウザから ChocoDrop が使えるようになります（`http://127.0.0.1:43110` で ChocoDrop の機能（SDK）が配信されます）。
2. **ブックマークレットを登録**
   [Bookmarklet v2](https://nyukicorn.github.io/chocodrop/examples/bookmarklet-v2.html) を開き、「🍫 ChocoDrop v2」ボタンをブックマークバーへドラッグ＆ドロップします。
3. **対象ページで実行**
   threejs.org など任意の Three.js ページで登録したブックマークをクリックすると、右下に ChocoDrop UI が表示されます。daemon が停止している場合は Toast UI が起動コマンドを案内します。
4. **DevTools スニペット派のための代替**
   `bookmarklet-code.js` の内容を Chrome の Snippets に貼り付けて実行すれば、同じトースト UI を呼び出せます。

#### C. 自分の Three.js プロジェクトに組み込む（配布版）

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
     serverUrl: null  // サーバーレスモード（UIのみ）
   });
   ```
   bundler 向けの詳細手順は [`docs/INTEGRATION.md`](docs/INTEGRATION.md) を参照してください。

#### D. 生成機能まで有効化する（KAMUI Code + ローカルサーバー）

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

## 💡 主な機能

### 🍬 Toast UI - 優しい起動案内
デーモンが起動していない場合、右下にToast UIが表示されます:

- **起動コマンドのコピー**: ワンクリックでコマンドをクリップボードにコピー
- **自動ポーリング**: 2.5秒間隔でデーモンの起動を自動チェック
- **接続成功**: デーモンが起動すると自動的にSDKを読み込み

### 🔄 reload() API
設定をリロードできる新しいAPI:

```javascript
const result = await window.chocodrop.reload();
console.log(result); // {ok: true, message: "Configuration reloaded"}
```

### 🌐 外部サイト対応 - Full UI表示
Bookmarkletやコンソールスニペットで外部サイト（threejs.org、CodePen、Glitch等）に統合した場合も、**フル機能のUIが表示されます**（プレースホルダーUIではありません）。

**特徴:**
- ✅ 完全なChocoDrop UIが表示
- ✅ THREE.jsが未読み込みでも自動的にCDNから取得
- ✅ ローカルデーモン(127.0.0.1)との通信のみ（外部送信なし）
- ⚠️ UI表示と操作のみ（AI生成は daemon では使えません。リポジトリ clone + KAMUI Code 設定が必要）

### 🏢 企業ポリシー配慮 - CDN制御
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
4. ローカルフォールバック（`/vendor/three-0.170.0.min.js`）

**セキュリティ機能:**
- THREE.js v0.170.0 に固定（バージョン固定で安全性向上）
- SRI（Subresource Integrity）による改ざん検知
- CDN失敗時のローカルフォールバック

---

## 🏗️ アーキテクチャ・技術詳細

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

### 🔐 セキュリティ

ChocoDrop は常駐 daemon + ブラウザ SDK の構成で動作します。

- **ローカル専用**: デフォルトで `127.0.0.1` のみアクセス可能
- **CORS制御**: allowlistで許可したOriginのみアクセス可能
- **読み取り専用モード**: ブックマークレット等では UI表示のみ（生成APIは無効）
- **生成機能**: KAMUI Code 設定時のみ有効（ローカル環境のみ）

---

## ❓ トラブルシューティング

**Bookmarkletが動かない**
- ブラウザのコンソール（F12）でエラーを確認
- デーモンが起動しているか確認: `http://127.0.0.1:43110/v1/health` にアクセス

**Toast UIが表示されない**
- デーモンが既に起動している可能性（正常な動作）
- ページをリロードしてもう一度試す

**CORSエラー**
- allowlist設定が必要な場合があります
- `~/.config/chocodrop/allowlist.json` で設定可能
- 詳細: [トラブルシューティング](docs/TROUBLESHOOTING.md#0-daemon-関連98の人向け)

---

## 📚 詳細ドキュメント
- [トラブルシューティング](docs/TROUBLESHOOTING.md)
- [API リファレンス](docs/API.md)
- [セットアップガイド](docs/SETUP.md)

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🔗 Links

- **GitHub:** https://github.com/nyukicorn/chocodrop
- **Examples:** [examples/](examples/)
