# ChocoDrop セットアップガイド

> **まずは [ローカル起動・外部ツール連携](LOCAL_TOOLS.md) を参照してください。**
> ブラウザでのファイル配置と新しいstdio MCPには、カムイコードやAPIキーは不要です。
> 以下はChocoDrop内部から従来の生成サービスを呼ぶ場合の追加設定です。

## 🚀 クイックスタート（3ステップ）

```bash
# 1. プロジェクト取得
git clone https://github.com/nyukicorn/chocodrop.git
cd chocodrop

# 2. すぐに試す（依存関係なし）
npm run example:basic
# → http://localhost:8000 で basic/index.html を開く

# 3. 本格利用の場合（KAMUI Code設定）
npm install
npm run setup:mcp  # 対話的設定
npm run dev
```

## 📋 詳細セットアップ

### 1. 基本環境

**必要な環境**：
- Node.js 16+
- npm (Node.js付属)
- モダンブラウザ（Chrome, Firefox, Safari, Edge）

**確認コマンド**：
```bash
node --version  # v16.0.0 以上
npm --version   # 8.0.0 以上
```

### 2. KAMUI Code設定（AI生成機能）

#### 2.1 前提条件
- [KAMUI Code](https://kamui-code.dev/) のライセンス購入済み
- KAMUI Code設定ファイル (`KAMUI CODE.json`) の取得済み

#### 2.2 自動設定（推奨）
```bash
npm run setup:mcp
```

以下のプロンプトが表示されます：
```
MCP設定ファイル（例: KAMUI CODE.json）のパスを入力してください。
現在の設定: まだ設定されていません。
そのままEnterを押すと現在の設定を維持します。
>
```

**入力例**：
- `~/.claude/KAMUI CODE.json`
- `/Users/yourname/.claude/mcp-kamui-code.json`
- `./config/KAMUI CODE.json`

> ℹ️ KAMUI Code 設定が未入力のままでも ChocoDrop 自体は起動します。画像/動画生成を実行したタイミングで「AI生成サーバーを設定してください」という案内が表示されるため、生成機能を使いたい場合のみ設定してください。

#### 2.3 手動設定

1. `config.example.json` を `config.json` にコピー：
```bash
cp config.example.json config.json
```

2. `config.json` を編集：
```json
{
  "mcp": {
    "provider": "kamui-code",
    "configPath": "~/.claude/KAMUI CODE.json"
  }
}
```

#### 2.4 設定ファイル検索順序

ChocoDrop は以下の順序で設定ファイルを自動検索します：

1. **環境変数**: `MCP_CONFIG_PATH`
2. **config.json**: `mcp.configPath`
3. **デフォルト**: `~/.claude/mcp-kamui-code.json`

**検索候補ファイル名**：
- `KAMUI CODE.json`
- `KAMUI CODE.JSON`
- `mcp-kamui-code.json`
- `kamui-code.json`

> ✅ MCP設定ファイル内の `mcpServers` に登録されているサービスだけが利用可能になります。`config.json` の `models.image.default` / `models.video.default` は、登録済みサービスIDと一致している場合にのみ優先され、それ以外は最初に見つかったサービスが自動的に使用されます。

### 3. 利用可能なAIモデル

#### 画像生成モデル
- **Seedream V4** (デフォルト) - 高品質 (~10-15秒)
- **Flux Schnell** - 最高品質 (~15-20秒)
- **Qwen Image** - 高速生成 (~1-2秒)
- **Imagen4 Fast** - バランス型 (~8-12秒)
- **Gemini 2.5 Flash** - Google最新 (~8-12秒)

#### 動画生成モデル
- **KAMUI Wan v2.2.5B Fast** - 高速動画生成
- その他 KAMUI Code で利用可能な動画モデル

### 4. サーバー起動と設定

#### 4.1 開発サーバー起動
```bash
npm run dev
# → サーバー起動: http://localhost:3011
```

#### 4.2 設定カスタマイズ

`config.json` で詳細設定可能：

```json
{
  "mcp": {
    "provider": "kamui-code",
    "configPath": "~/.claude/KAMUI CODE.json"
  },
  "server": {
    "port": 3011,
    "host": "localhost",
    "outputDir": "./public/generated"
  },
  "client": {
    "serverUrl": "http://localhost:3011",
    "defaultWidth": 512,
    "defaultHeight": 512,
    "defaultDuration": 3
  },
  "models": {
    "image": {
      "default": "t2i-kamui-seedream-v4"
    },
    "video": {
      "default": "t2v-kamui-wan-v2-2-5b-fast"
    }
  }
}
```

## 🔧 統合方法

### Three.js プロジェクトへの統合

```javascript
import { createChocoDrop } from '@chocodrop/core';

// 基本的な Three.js セットアップ
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);

// ChocoDrop 統合
const chocoDrop = createChocoDrop(scene, {
  camera,
  renderer,
  serverUrl: 'http://localhost:3011',
  onControlsToggle: (disabled) => {
    controls.enabled = !disabled;
  }
});

// レンダーループ
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
```

### 基本操作

1. **@キー** でコマンドUI起動
2. 自然言語で指示：
   - `「ドラゴンを右上に作って」`
   - `「桜を中央に配置」`
   - `「背景に森を作成」`
3. **Enter** で実行

### プログラム制御

```javascript
// 画像生成
const result = await chocoDrop.client.generateImage('美しい桜の木', {
  width: 512,
  height: 512,
  service: 't2i-kamui-seedream-v4'
});

// 動画生成
const videoResult = await chocoDrop.client.generateVideo('flowing river in forest', {
  duration: 5,
  aspect_ratio: '16:9',
  resolution: '720p'
});

// 自然言語コマンド実行
const commandResult = await chocoDrop.client.executeCommand('右上に大きな山を配置');
```

## 🐛 トラブルシューティング

### よくある問題

#### 1. MCP接続エラー
```
Error: MCP connection failed
```

**解決方法**：
1. KAMUI Code設定ファイルの存在確認：
```bash
ls -la ~/.claude/KAMUI\ CODE.json
```

2. 設定ファイルの再設定：
```bash
npm run setup:mcp
```

3. 設定パスの確認：
```bash
cat config.json | grep configPath
```

#### 2. ポート使用中エラー
```
Error: Port 3011 already in use
```

**解決方法**：
```bash
# プロセス確認
lsof -ti:3011

# プロセス終了
kill $(lsof -ti:3011)

# または別ポート使用
# config.json の server.port を変更
```

#### 3. 生成されない・エラー
**チェック項目**：
1. サーバーログ確認
2. ブラウザコンソール確認（F12）
3. KAMUI Code クレジット残高
4. API制限状況

**デバッグコマンド**：
```bash
# サーバーログ詳細表示
DEBUG=chocodrop:* npm run dev

# 設定確認
node -e "console.log(require('./config.json'))"
```

#### 4. @キーが反応しない
**確認項目**：
1. ブラウザフォーカスがページ内にあるか
2. 他のキーボードショートカットと競合していないか
3. ブラウザコンソールでJavaScriptエラーが発生していないか

### 詳細ログ確認

```bash
# MCP接続ログ詳細
DEBUG=mcp:* npm run dev

# 全体ログ詳細
DEBUG=* npm run dev

# サーバーのみ
node src/server/server.js --debug
```

## 📚 次のステップ

- [API リファレンス](API.md) - 詳細なAPI仕様
- [統合例](examples/) - フレームワーク別の統合例
- [カスタマイズ](CUSTOMIZATION.md) - 高度なカスタマイズ
- [KAMUI Code 公式](https://kamui-code.dev/) - AIモデル詳細

## 💬 サポート

- [GitHub Issues](https://github.com/nyukicorn/chocodrop/issues)
- [Discussions](https://github.com/nyukicorn/chocodrop/discussions)
- Email: chocodrop.dev@gmail.com
