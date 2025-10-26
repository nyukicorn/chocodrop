# ChocoDrop

ちょこっとDrop。世界が咲く。
Drop a little, bloom a lot.

**テキストや音声で、Three.js シーンに瞬時にオブジェクトを追加できるブラウザツール**

A browser-based tool that enables instant 3D object creation and scene manipulation in Three.js using natural language commands.

<div align="center">

**[🌐 Website](https://nyukicorn.github.io/chocodrop/)** | **[🎮 Try Demo](https://nyukicorn.github.io/chocodrop/examples/basic/)** | **[📚 Docs](./docs/SETUP.md)**

</div>

---

## 🤖 AI開発者向けガイド

**このプロジェクトで作業を開始する前に、必ずこのセクションを読んでください。**

ユーザーから与えられた指示に応じて、適切なセクションを自動的に判断してください：

### 指示の振り分け

| ユーザーの指示に含まれるキーワード | 実行方法 |
|--------------------------------------|----------|
| **「GitHub Actions で」「GitHub Actions を使って」「Actions で実行」** | → **セクション E (GitHub Actions で並列実装)** を読んで実行 |
| **「ローカルで」「worktree で」「直接実装」** | → **セクション F (ローカル worktree で並列実装)** を読んで実行 |
| **「評価して」「比較して」** （実装指示なし） | → **セクション F の評価部分** のコマンドを実行 |
| **キーワードなし（デフォルト）** | → **セクション F (ローカル実装)** を読んで実行 |

### 振り分け例

✅ **例1: GitHub Actions で実装**
```
ユーザー: GitHub Actions で キラキラと光る3Dオブジェクトを作成して
AI の動作: セクション E を読む → ./scripts/run-ai-implementation.sh を実行
```

✅ **例2: ローカルで実装（デフォルト）**
```
ユーザー: キラキラと光る3Dオブジェクトを作成して
AI の動作: セクション F を読む → worktree 内で直接実装
```

✅ **例3: ローカルで明示的に実装**
```
ユーザー: ローカルで VR機能を追加して
AI の動作: セクション F を読む → worktree 内で直接実装
```

✅ **例4: 評価のみ**
```
ユーザー: ブランチ feature/a, feature/b, feature/c を評価して
AI の動作: セクション F の評価コマンドを実行
```

### 重要な注意事項

- **README のパスやセクション番号は指示に含まれません**（ユーザーは「GitHub Actions で」と言うだけ）
- このガイドを読んだら、**該当するセクション（E または F）に移動して詳細な指示に従ってください**
- わからない場合は**デフォルトでセクション F（ローカル実装）**を選択してください

---

## ✨ できること / What You Can Do

### XR (Meta Quest 3 / visionOS) に向けた準備

- [ChocoDrop XR リサーチブリーフ](./public/research/xr-strategy-2025.html)で 2025年10月時点の市場・機能要件を追跡し、タスク化しています。
- Quest 3 から `https://192.168.1.15/xr-demo/`（`public/xr-demo/index.html`）へアクセスすると、WebXR / Shared Spaces フラグの確認や HUD オーバーレイの挙動をそのまま試せます。
- `WebXRBridge` を `createChocoDrop` の `xr` オプション経由で有効化すれば、Three.js 側のコード改変を最小限にしたまま XR セッションを制御できます。

```js
import { createChocoDrop } from 'chocodrop';

const { sceneManager } = createChocoDrop(scene, {
  camera,
  renderer,
  serverUrl: 'https://192.168.1.15',
  xr: {
    enabled: true,
    preferredMode: 'immersive-vr',
    autoEnter: false,
    bridgeOptions: {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['hand-tracking', 'layers']
    }
  }
});

document.getElementById('enter-xr').addEventListener('click', async () => {
  await sceneManager.enterXR('immersive-vr', {
    domOverlay: document.getElementById('hud')
  });
});
```

### 誰でもすぐ試せる

**1. 多彩なデモで雰囲気を体験**

ChocoDrop には複数の世界観のデモが用意されています：
- [Basic (基本)](https://nyukicorn.github.io/chocodrop/examples/basic/) - シンプルな操作体験
- [Music Garden (音楽の庭)](https://nyukicorn.github.io/chocodrop/examples/music-garden/) - 夜桜と音楽
- [Space (宇宙)](https://nyukicorn.github.io/chocodrop/examples/space/) - 宇宙空間
- [Toy City (おもちゃの街)](https://nyukicorn.github.io/chocodrop/examples/toy-city/) - カラフルな街
- その他多数 → [examples/](examples/)

**2. ブックマークから Three.js サイトにも導入可能**

threejs.org など、Three.js を使っている既存サイトにも ChocoDrop UI を表示できます。
※技術的には「ブックマークレット (bookmarklet)」と呼ばれる機能です

詳細: [B. Three.js サイトにワンクリック注入](#b-threejs-サイトにワンクリック注入)

### 開発者向け: AI生成機能も使える

**daemon (配布版) を起動すると:**
- ✅ ChocoDrop UI が使える
- ✅ シーンの操作やスクリーンショットが可能
- ❌ AI生成機能は使えない（KAMUI Code 設定が必要）

**さらに KAMUI Code を設定すると:**
- ✅ "右上に桜の3Dモデルを置いて" → AI が生成・配置
- ✅ "このオブジェクトをモノクロにして" → AI が変換

⚠️ **AI生成機能を使うには**: リポジトリをcloneし、KAMUI Code設定が必要です。
詳細: [D. 生成機能まで有効化する](#d-生成機能まで有効化するkamui-code--ローカルサーバー)

---

## 🚀 クイックスタート

### 1. まずは目的に合わせてルートを選ぶ

| 目的 | 推奨ルート | 所要時間 | 主な手順 |
| --- | --- | --- | --- |
| **雰囲気をすぐ体験したい** | デモ版（ホスト済み） | 1 分 | ブラウザでサンプルを開くだけ |
| **threejs.org 等の Three.js サイトで試したい** | ブックマークから注入 + daemon | 2–3 分 | daemon 起動 → ブックマーク登録 → 対象ページで実行 |
| **自分のプロジェクトに組み込みたい** | daemon + SDK | 5–10 分 | daemon 起動 → SDK 読み込み → `ready()` `attach()` |
| **AI生成機能も使いたい** | リポジトリ clone + KAMUI Code 設定 | 10 分〜 | clone → `npm run setup:mcp` → `npm run dev` |

気になる行をクリック（またはスクロール）して、下記の詳細セクションから該当手順をたどってください。

### 2. シナリオ別ガイド

#### A. ブラウザで今すぐ試す（デモ版）

- **オンラインですぐ試す:** [Basic Demo](https://nyukicorn.github.io/chocodrop/examples/basic/) を開くだけで UI を体験できます。
- **ローカルで試す:**
  ```bash
  npm run example:basic
  ```
  ブラウザで `http://localhost:8000/basic/index.html` を開きます。ネットワークが制限されている環境でも動作確認できます。
- さらに世界観を試したい場合は `examples/` ディレクトリに複数のシーンが用意されています。

#### B. Three.js サイトにワンクリック注入

ブックマークバーに登録したボタンをクリックするだけで、Three.js を使っている既存サイトに ChocoDrop を導入できます。
※技術的には「ブックマークレット (bookmarklet)」と呼ばれる機能です

1. **daemon を起動**（初回のみ）
   ```bash
   # npm 推奨
   npx --yes @chocodrop/daemon@alpha

   # または pnpm
   pnpm dlx @chocodrop/daemon@alpha
   ```
   起動後は `http://127.0.0.1:43110` で SDK/UI が配信されます。
2. **ブックマークを登録**
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
     serverUrl: 'http://127.0.0.1:43110'
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

#### E. GitHub Actions で並列実装（AI 実行用）

**🤖 このセクションを読んでいる AI へ：**

**重要：あなたが worktree ディレクトリにいても、ローカルで実装しないでください。**

あなたの役割は、以下のスクリプトを実行することだけです。
実装作業は GitHub Actions 上の別の AI が行います。

**実行するコマンド：**

```bash
./scripts/run-ai-implementation.sh -p "指示されたタスクの内容をここに書く"
```

**説明：**
- このスクリプトは GitHub Actions ワークフローを起動します
- 同じタスクを実行する複数の AI は自動的にグループ化されます（セッションID）
- ワークフロー内で別の AI が実装を行い、ブランチに push します
- あなたはスクリプトを実行するだけで、実装作業は行いません

**やってはいけないこと：**
- ディレクトリを作成しない
- ファイルを作成しない
- コードを書かない
- ローカルで実装しない

**実行例：**

```bash
# 例1: Hello World を表示
./scripts/run-ai-implementation.sh -p "Three.js を使って Hello World の 3D テキストを表示する"

# 例2: パフォーマンス改善
./scripts/run-ai-implementation.sh -p "シーンのパフォーマンスを改善する"

# STDIN から実行する場合
echo "タスクはキラキラと光る3Dオブジェクトを作成すること" | ./scripts/run-ai-implementation.sh
```

---

**人間向け参考情報:**

<details>
<summary>実装結果の確認方法</summary>

```bash
gh run list --workflow=ai-parallel-implementation.yml --limit 5
gh run view [RUN_ID] --web
```
</details>

<details>
<summary>評価方法（任意・完成後のみ）</summary>

ワークフロー Summary に表示されたコマンドを実行：
```bash
gh workflow run worktree-parallel.yml \
  -f branches="ai/approach-1-XXXXX,..." \
  -f run_build=true \
  -f run_tests=true \
  -f compare_results=true
```
</details>

#### F. ローカル worktree で並列実装

ローカル環境で複数のアプローチを並列実装し、完成後に評価できます。

---

##### 実装方法

**1. Worktree を作成**

```bash
# タスク用のブランチを複数作成
git worktree add .worktrees/approach-1 -b feature/approach-1
git worktree add .worktrees/approach-2 -b feature/approach-2
git worktree add .worktrees/approach-3 -b feature/approach-3
```

**2. 各 worktree で並列実装**

```bash
# ターミナルを複数開いて並列作業
cd .worktrees/approach-1  # アプローチ1を実装
cd .worktrees/approach-2  # アプローチ2を実装
cd .worktrees/approach-3  # アプローチ3を実装
```

**3. コミット & Push**

```bash
# 各 worktree で
git add .
git commit -m "実装内容"
git push origin feature/approach-1  # ブランチ名に合わせて変更
```

---

##### 評価（任意・完成後のみ）

実装が完成し、評価したい場合のみ以下を実行：

```bash
# 比較したいブランチを指定
gh workflow run worktree-parallel.yml \
  -f branches="feature/approach-1,feature/approach-2,feature/approach-3" \
  -f run_build=true \
  -f run_tests=true \
  -f compare_results=true

# 実行状況を確認
gh run list --workflow=worktree-parallel.yml --limit 5

# 結果を監視
gh run watch [RUN_ID]
```

**比較レポート:**
- Actions タブで `Worktree Parallel Testing` ワークフローを開く
- Artifacts から `comparison-report` をダウンロード
- `ai-analysis.html` を開いて詳細な比較分析を確認

> 💡 **ヒント**: 評価は任意です。実装途中や未完成の状態では実行しないでください。

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

### 🌐 Three.js サイト対応 - Full UI表示
ブックマークから Three.js を使っている外部サイト（threejs.org、CodePen、Glitch等）に統合した場合も、**フル機能のUIが表示されます**（プレースホルダーUIではありません）。

**特徴:**
- ✅ 完全なChocoDrop UIが表示
- ✅ THREE.jsが未読み込みでも自動的にCDNから取得
- ✅ ローカルデーモン(127.0.0.1)との通信のみ（外部送信なし）
- ⚠️ 現在は読み取り専用モード（AI生成機能はローカル環境でのKAMUI Code設定が必要）

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

**ブックマークから注入できない**
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
- [トラブルシューティング](docs/TROUBLESHOOTING.md)
- [API リファレンス](docs/API.md)
- [セットアップガイド](docs/SETUP.md)

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🔗 Links

- **GitHub:** https://github.com/nyukicorn/chocodrop
- **Examples:** [examples/](examples/)
