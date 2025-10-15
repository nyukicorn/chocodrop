# ChocoDrop

ちょこっとDrop。世界が咲く。

**テキストや音声からの指示だけで Three.js のシーンにオブジェクトを瞬時に追加できるブラウザツールです。**

ChocoDrop is a browser-based assistant for Three.js that lets you drop AI-generated or preset 3D objects into any scene with text or voice commands. Jump into the live demo, plug the SDK into your project, or enable the full AI workflow by running the local daemon described below. Documentation is primarily written in Japanese; English readers can follow the bilingual headings and quick links to get started.

<div align="center">

[![GitHub stars](https://img.shields.io/github/stars/nyukicorn/chocodrop?style=social)](https://github.com/nyukicorn/chocodrop)
[![npm version](https://img.shields.io/npm/v/chocodrop?color=4CAF50)](https://www.npmjs.com/package/chocodrop)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## [🎮 今すぐブラウザで試す →](https://nyukicorn.github.io/chocodrop/examples/basic/)

**インストール不要 | 30秒で体験**

[📖 公式サイト](https://nyukicorn.github.io/chocodrop/) · [🔖 ブックマークレット v2](https://nyukicorn.github.io/chocodrop/examples/bookmarklet-v2.html) · [📚 ドキュメント](./docs/SETUP.md) · [📦 npm](https://www.npmjs.com/package/chocodrop)

</div>

---

<h2 id="demo-worlds">🌈 Demo Worlds / デモギャラリー</h2>

デモ版は1ページで終わりません。気分に合わせて世界を切り替え、ChocoDropの使い方やUIアニメーションを短時間で横断できます。

<div align="center">

| | |
|---|---|
| [🍫 Basic Lounge](https://nyukicorn.github.io/chocodrop/examples/basic/)<br><sub>UI全体を通しで体験できるスタータールーム</sub> | [🌌 Space Dive](https://nyukicorn.github.io/chocodrop/examples/space/)<br><sub>無重力空間でライトとマテリアルの切り替えを試す</sub> |
| [🎶 Music Garden](https://nyukicorn.github.io/chocodrop/examples/music-garden/)<br><sub>音に合わせて揺らぐ植生とライティングをチェック</sub> | [🧘 Wabi-Sabi Studio](https://nyukicorn.github.io/chocodrop/examples/wabi-sabi/)<br><sub>和のマテリアルと静かな演出で質感調整を確認</sub> |
| [🧩 Toy City](https://nyukicorn.github.io/chocodrop/examples/toy-city/)<br><sub>プロシージャルに広がる街でカメラ切替をテスト</sub> | [🌊 Pixel Ocean](https://nyukicorn.github.io/chocodrop/examples/pixel-ocean/)<br><sub>ボクセルの海とパーティクル表現をミックス</sub> |

</div>

<p align="center">
⇨ <a href="https://github.com/nyukicorn/chocodrop/tree/main/examples">もっと見る（examples フォルダ一覧）</a>
</p>

---

<h2 id="contents">📑 Contents / 目次</h2>

- [Demo Worlds / デモギャラリー](#demo-worlds)
- [Quick Overview / 30秒でわかる](#quick-overview)
- [Get Started / 使い始める](#get-started)
- [What You Can Do / できること](#what-you-can-do)
- [Key Features / 主な機能](#key-features)
- [Technical Details / 技術詳細](#technical-details)
- [Troubleshooting / トラブルシューティング](#troubleshooting)
- [Links & Resources / リンク・リソース](#links-and-resources)


---

<h2 id="quick-overview">🎬 Quick Overview / 30秒でわかる</h2>

<div align="center">
  <video src="docs/media/demo-overview.mp4" controls width="100%" style="max-width: 800px; border-radius: 8px;">
    お使いのブラウザは動画タグをサポートしていません。<a href="docs/media/demo-overview.mp4">動画をダウンロード</a>してご覧ください。
  </video>
  <p><em>ChocoDrop の使い方を30秒で紹介 | <a href="https://nyukicorn.github.io/chocodrop/examples/basic/">今すぐ試す →</a></em></p>
</div>

**3つのポイント:**
- ✨ **AI生成**: "右上に桜の3Dモデル" → 瞬時に生成・配置（※ローカル環境設定が必要）
- 🎮 **すぐ試せる**: ブックマークレットで既存サイトに注入
- 🔧 **組み込み可能**: 自分のThree.jsプロジェクトに導入

> ⚠️ **注意:** AI生成機能は**ローカル環境でのKAMUI Code設定が必要**です。ブックマークレットや配布版daemonでは、UIの表示と操作のみ可能です。

---

<h2 id="get-started">🚀 Get Started / 使い始める</h2>

### Choose Your Path / あなたの目的に合わせて選ぶ

| 目的 | 方法 | 所要時間 | 次のステップ |
|------|------|----------|-------------|
| **まず雰囲気を体験したい** | デモ版 | 1分 | [→ A. Try the Demo](#guide-demo) |
| **既存サイトで試したい** | ブックマークレット | 2-3分 | [→ B. Bookmarklet](#guide-bookmarklet) |
| **プロジェクトに組み込む** | SDK + daemon | 5-10分 | [→ C. SDK Integration](#guide-sdk) |
| **AI生成を含む全機能** | ローカル環境 | 10分〜 | [→ D. Full Local Setup](#guide-full) |

---

<h3 id="detailed-guides">Detailed Guides / 詳細ガイド</h3>

<h3 id="guide-demo">A. Try the Demo / デモで試す</h3>

<details>
<summary><strong>手順を表示</strong></summary>

<br>

**オンラインですぐ試す:**
- [Basic Demo](https://nyukicorn.github.io/chocodrop/examples/basic/) を開くだけでUIを体験できます

**ローカルで試す:**
```bash
npm run example:basic
```
ブラウザで `http://localhost:8000/basic/index.html` を開きます。

さらに世界観を試したい場合は `examples/` ディレクトリに複数のシーンが用意されています。

</details>

<h3 id="guide-bookmarklet">B. Bookmarklet / ブックマークレット</h3>

<details>
<summary><strong>手順を表示</strong></summary>

<br>

#### 1. daemon を起動（初回のみ）
```bash
# npm 推奨
npx --yes @chocodrop/daemon@alpha

# または pnpm
pnpm dlx @chocodrop/daemon@alpha
```
起動後は `http://127.0.0.1:43110` で SDK/UI が配信されます。

#### 2. ブックマークレットを登録
[Bookmarklet v2](https://nyukicorn.github.io/chocodrop/examples/bookmarklet-v2.html) を開き、「🍫 ChocoDrop v2」ボタンをブックマークバーへドラッグ＆ドロップします。

#### 3. 対象ページで実行
threejs.org など任意の Three.js ページで登録したブックマークをクリックすると、右下に ChocoDrop UI が表示されます。

daemon が停止している場合は Toast UI が起動コマンドを案内します。

#### 4. DevTools スニペット派のための代替
`bookmarklet-code.js` の内容を Chrome の Snippets に貼り付けて実行すれば、同じトースト UI を呼び出せます。

> ⚠️ **制限事項**: ブックマークレット版では**UIの表示と操作のみ**可能です。AI生成機能を使うには[フル環境構築](#guide-full)が必要です。

</details>

<h3 id="guide-sdk">C. SDK Integration / SDK組み込み</h3>

<details>
<summary><strong>手順を表示</strong></summary>

<br>

#### 前提条件
- Node.js 16+ / npm または pnpm
- Three.js r170 付近（推奨）

#### 1. daemon をローカルで起動
```bash
npx --yes @chocodrop/daemon@alpha
# 既存ポートと衝突する場合は --port 43111 などを付与
```

#### 2. SDK を読み込む（CDN 方式）
HTML の `<head>` などに以下を追加します。
```html
<script src="http://127.0.0.1:43110/sdk.js"></script>
```

Three.js/OrbitControls をすでに読み込んでいれば、そのまま `ready()` → `attach()` を呼べます。

#### 3. シーンにアタッチ
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

#### 4. npm で取り込む場合
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

</details>

<h3 id="guide-full">D. Full Local Setup / フル環境構築</h3>

<details>
<summary><strong>手順を表示</strong></summary>

<br>

#### 1. リポジトリをclone
```bash
git clone https://github.com/nyukicorn/chocodrop.git
cd chocodrop
npm install
```

#### 2. KAMUI Code設定
```bash
npm run setup:mcp
```
KAMUI Code の設定ファイルパスを登録します。

#### 3. 開発サーバー起動
```bash
npm run dev
```
`http://localhost:3011` でサーバーが起動し、生成 API が利用可能になります。

#### 4. 詳細設定
詳細な構成やモデル設定は [`docs/SETUP.md`](docs/SETUP.md) を参照してください。

> 🔍 **ヒント**: daemon や `sdk.js` のレスポンスヘッダーに `X-ChocoDrop-SDK-Source: dist` が表示されていれば、ビルド済みバンドルが正しく配信されています。ブラウザで `await window.chocodrop.ready()` を実行して接続状況をチェックできます。

</details>

---

<h2 id="what-you-can-do">✨ What You Can Do / できること</h2>

### 誰でもすぐ試せる

**デモで体験 → プリセットシーンを操作**

[Basic Demo](https://nyukicorn.github.io/chocodrop/examples/basic/) でUIを体験できます。

### KAMUI Code + daemon 設定で可能になる（開発者向け）

**「右上に桜の3Dモデルを置いて」→ 瞬時に生成・配置**

**「このオブジェクトをモノクロにして」→ すぐに変換**

---

<h2 id="key-features">💡 Key Features / 主な機能</h2>

### 🍬 Toast UI - Guided Launch / 優しい起動案内
デーモンが起動していない場合、右下にToast UIが表示されます:

- **起動コマンドのコピー**: ワンクリックでコマンドをクリップボードにコピー
- **自動ポーリング**: 2.5秒間隔でデーモンの起動を自動チェック
- **接続成功**: デーモンが起動すると自動的にSDKを読み込み

### 🔄 reload() API / 設定リロード
設定をリロードできる新しいAPI:

```javascript
const result = await window.chocodrop.reload();
console.log(result); // {ok: true, message: "Configuration reloaded"}
```

### 🌐 Full UI on External Sites / 外部サイト対応
Bookmarkletやコンソールスニペットで外部サイト（threejs.org、CodePen、Glitch等）に統合した場合も、**フル機能のUIが表示されます**（プレースホルダーUIではありません）。

**特徴:**
- ✅ 完全なChocoDrop UIが表示
- ✅ THREE.jsが未読み込みでも自動的にCDNから取得
- ✅ ローカルデーモン(127.0.0.1)との通信のみ（外部送信なし）
- ⚠️ 現在は読み取り専用モード（AI生成機能はローカル環境でのKAMUI Code設定が必要）

### 🏢 Enterprise-Friendly CDN Controls / 企業ポリシー配慮
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

<h2 id="technical-details">🏗️ Technical Details / 技術詳細</h2>

### 🌐 Recommended Browsers / 推奨ブラウザ

**Chrome（推奨・動作確認済み）**
- ✅ Private Network Access (PNA) 完全サポート
- ✅ localStorage persistence 実装
- ✅ すべての機能が安定動作

**⚠️ 他のブラウザについて:**
Safari/Firefox/Edgeは現在サポートしていません。Chromeの使用を強く推奨します。

### 🔒 Origin Allowlist / Origin許可設定

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

### 🔐 Security / セキュリティ

ChocoDrop は常駐 daemon + ブラウザ SDK の構成で動作します。

- **ローカル専用**: デフォルトで `127.0.0.1` のみアクセス可能
- **CORS制御**: allowlistで許可したOriginのみアクセス可能
- **読み取り専用モード**: ブックマークレット等では UI表示のみ（生成APIは無効）
- **生成機能**: KAMUI Code 設定時のみ有効（ローカル環境のみ）

---

<h2 id="troubleshooting">❓ Troubleshooting / トラブルシューティング</h2>

**Bookmarkletが動かない**
- ブラウザのコンソール（F12）でエラーを確認
- デーモンが起動しているか確認: `http://127.0.0.1:43110/v1/health` にアクセス

**Toast UIが表示されない**
- デーモンが既に起動している可能性（正常な動作）
- ページをリロードしてもう一度試す

**CORSエラー**
- allowlist設定が必要な場合があります
- `~/.config/chocodrop/allowlist.json` で設定可能

詳細は [トラブルシューティングガイド](docs/TROUBLESHOOTING.md) を参照してください。

---

<h2 id="links-and-resources">📚 Links & Resources / リンク・リソース</h2>

### Official Materials / 公式リソース
- 🌐 [公式サイト](https://nyukicorn.github.io/chocodrop/)
- 📚 [セットアップガイド](docs/SETUP.md)
- 📖 [API リファレンス](docs/API.md)
- 🔧 [統合ガイド](docs/INTEGRATION.md)

### Packages & Code / パッケージ・コード
- 📦 [npm パッケージ](https://www.npmjs.com/package/chocodrop)
- 💻 [GitHub リポジトリ](https://github.com/nyukicorn/chocodrop)
- 🎮 [サンプル集](examples/)

### Community / コミュニティ
- 💬 [GitHub Discussions](https://github.com/nyukicorn/chocodrop/discussions)
- 🐛 [Issue報告](https://github.com/nyukicorn/chocodrop/issues)

---

## 📄 License / ライセンス

このプロジェクトは MIT License の下で公開されています。詳細は [LICENSE](LICENSE) を参照してください。

---

<div align="center">

**© 2025 ChocoDrop. 🍫 と ✨ に感謝を込めて。**

[⬆ ページトップへ](#chocodrop)

</div>
