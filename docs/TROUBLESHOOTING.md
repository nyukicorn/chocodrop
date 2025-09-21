# ChocoDrop トラブルシューティングガイド

## 🚨 よくある問題と解決方法

### 1. KAMUI Code / MCP 関連

#### ❌ MCP接続エラー
```
Error: MCP connection failed
Error: MCP config file not found
```

**原因と解決方法**:

1. **設定ファイルが見つからない**
   ```bash
   # 設定ファイルの存在確認
   ls -la ~/.claude/KAMUI\ CODE.json
   ls -la ~/.claude/mcp-kamui-code.json

   # 自動設定スクリプト実行
   npm run setup:mcp
   ```

2. **設定パスが正しくない**
   ```bash
   # 現在の設定確認
   cat config.json | grep configPath

   # 手動設定
   cp config.example.json config.json
   # config.json を編集して正しいパスを設定
   ```

3. **KAMUI Code設定ファイルの権限問題**
   ```bash
   # ファイル権限確認
   ls -la ~/.claude/KAMUI\ CODE.json

   # 権限修正（必要に応じて）
   chmod 644 ~/.claude/KAMUI\ CODE.json
   ```

#### ❌ AI生成が動作しない
```
Generation failed
No models available
```

**解決方法**:

1. **KAMUI Codeクレジット確認**
   - [KAMUI Code管理画面](https://kamui-code.dev/) でクレジット残高を確認
   - API制限に達していないか確認

2. **サービス一覧取得テスト**
   ```bash
   # サーバー起動
   npm run dev

   # 別ターミナルでAPI確認
   curl http://localhost:3011/api/services
   ```

3. **設定ファイル構文確認**
   ```bash
   # JSON構文チェック
   python -m json.tool ~/.claude/KAMUI\ CODE.json
   # または
   node -e "console.log(JSON.parse(require('fs').readFileSync(process.env.HOME + '/.claude/KAMUI CODE.json')))"
   ```

### 2. サーバー関連

#### ❌ ポート使用中エラー
```
Error: Port 3011 already in use
EADDRINUSE: address already in use :::3011
```

**解決方法**:

1. **使用中プロセス確認・終了**
   ```bash
   # ポート使用プロセス確認
   lsof -ti:3011

   # プロセス終了
   kill $(lsof -ti:3011)

   # 強制終了（必要に応じて）
   kill -9 $(lsof -ti:3011)
   ```

2. **別ポート使用**
   ```json
   // config.json
   {
     "server": {
       "port": 3012,
       "host": "localhost"
     },
     "client": {
       "serverUrl": "http://localhost:3012"
     }
   }
   ```

#### ❌ サーバー起動失敗
```
Cannot find module
TypeError: fetch is not defined
```

**解決方法**:

1. **Node.js バージョン確認**
   ```bash
   node --version  # v16.0.0 以上必要

   # Node.js更新（必要に応じて）
   # macOS: brew upgrade node
   # Windows: 公式サイトからダウンロード
   ```

2. **依存関係再インストール**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **ES Modules設定確認**
   ```json
   // package.json
   {
     "type": "module"
   }
   ```

### 3. フロントエンド関連

#### ❌ @キーが反応しない
```
UI not showing
KeyboardEvent not detected
```

**解決方法**:

1. **ブラウザフォーカス確認**
   - ページ内をクリックしてフォーカスを確保
   - 他のアプリケーションでフォーカスが奪われていないか確認

2. **ブラウザコンソールエラー確認**
   ```javascript
   // F12 でコンソール開いて確認
   console.log('ChocoDrop status:', window.chocoDrop);

   // イベントリスナー確認
   document.addEventListener('keydown', (e) => {
     console.log('Key pressed:', e.key, e.code);
   });
   ```

3. **キーボードショートカット競合**
   - ブラウザ拡張機能を一時無効化
   - 他のアプリケーションのショートカットと競合していないか確認

#### ❌ Three.js 統合エラー
```
TypeError: Cannot read property 'scene' of undefined
Three.js version mismatch
```

**解決方法**:

1. **Three.js バージョン確認**
   ```bash
   npm ls three
   # r160 以上推奨
   ```

2. **インポート方法確認**
   ```javascript
   // ✅ 正しい
   import * as THREE from 'three';
   import { createChocoDrop } from '@chocodrop/core';

   // ❌ 間違い
   const THREE = require('three'); // CommonJS混在
   ```

3. **初期化順序確認**
   ```javascript
   // ✅ 正しい順序
   const scene = new THREE.Scene();
   const camera = new THREE.PerspectiveCamera();
   const renderer = new THREE.WebGLRenderer();

   // Three.js が完全に初期化された後
   const chocoDrop = createChocoDrop(scene, { camera, renderer });
   ```

### 4. ネットワーク関連

#### ❌ CORS エラー
```
Access-Control-Allow-Origin
CORS policy error
```

**解決方法**:

1. **ローカルサーバー使用**
   ```bash
   # Python
   python -m http.server 8000

   # Node.js
   npx serve .

   # Live Server (VSCode拡張)
   # Right-click → "Open with Live Server"
   ```

2. **サーバー CORS 設定確認**
   ```javascript
   // server.js で CORS 設定が有効か確認
   app.use(cors({
     origin: ['http://localhost:8000', 'http://127.0.0.1:8000']
   }));
   ```

#### ❌ API 接続失敗
```
fetch failed
NetworkError
```

**解決方法**:

1. **サーバー稼働確認**
   ```bash
   # サーバーログ確認
   npm run dev

   # API接続テスト
   curl http://localhost:3011/api/config
   ```

2. **URL設定確認**
   ```javascript
   // 自動検出の場合
   const chocoDrop = createChocoDrop(scene, { camera, renderer });

   // 手動指定の場合
   const chocoDrop = createChocoDrop(scene, {
     camera,
     renderer,
     serverUrl: 'http://localhost:3011'
   });
   ```

### 5. 生成関連

#### ❌ 画像生成に時間がかかる
```
Generation timeout
Request timeout
```

**解決方法**:

1. **モデル選択の最適化**
   ```javascript
   // 高速モデル使用
   await chocoDrop.client.generateImage('prompt', {
     service: 't2i-kamui-qwen-image' // 1-2秒
   });

   // 高品質だが時間がかかる
   await chocoDrop.client.generateImage('prompt', {
     service: 't2i-kamui-flux-schnell' // 15-20秒
   });
   ```

2. **プロンプト最適化**
   ```javascript
   // ❌ 複雑すぎるプロンプト
   "extremely detailed ultra high resolution photorealistic masterpiece..."

   // ✅ シンプルで効果的
   "beautiful dragon in fantasy forest"
   ```

#### ❌ 動画生成の最小ファイルサイズエラー
```
file size is too small, minimum 1MB required
```

**解決方法**:

1. **プロンプト拡張**
   ```javascript
   // 自動リトライで解決されるが、手動でも可能
   await chocoDrop.client.generateVideo(
     'flowing water with complex movements, detailed background, dynamic camera work',
     {
       duration: 5, // 長めの時間
       resolution: '720p' // 高解像度
     }
   );
   ```

### 6. パフォーマンス問題

#### ❌ メモリリーク
```
Heap out of memory
Performance degradation
```

**解決方法**:

1. **リソース適切な解放**
   ```javascript
   // コンポーネント終了時
   chocoDrop.dispose();

   // 手動でのテクスチャ解放
   chocoDrop.sceneManager.clearAll();
   ```

2. **テクスチャサイズ最適化**
   ```javascript
   // 大きすぎる画像サイズを避ける
   await chocoDrop.client.generateImage('prompt', {
     width: 512,  // 1024以下推奨
     height: 512
   });
   ```

### 7. React Three Fiber 固有の問題

#### ❌ useThree フック関連エラー
```
useThree must be called within Canvas
Invalid hook call
```

**解決方法**:

```jsx
// ✅ 正しい
function Scene() {
  const { scene, camera, gl } = useThree(); // Canvas内で呼び出し

  useEffect(() => {
    const chocoDrop = createChocoDrop(scene, { camera, renderer: gl });
    return () => chocoDrop.dispose();
  }, [scene, camera, gl]);

  return null;
}

function App() {
  return (
    <Canvas>
      <Scene />
    </Canvas>
  );
}
```

## 🔧 デバッグ方法

### 詳細ログ有効化

```bash
# 全体デバッグ
DEBUG=* npm run dev

# ChocoDrop特化
DEBUG=chocodrop:* npm run dev

# MCP通信のみ
DEBUG=mcp:* npm run dev
```

### ブラウザデバッグ

```javascript
// コンソールでの確認
window.chocoDrop = chocoDrop; // グローバル変数化

// 状態確認
console.log('Client status:', chocoDrop.client);
console.log('Scene objects:', chocoDrop.sceneManager.getObjects());
console.log('UI state:', chocoDrop.ui);

// API直接テスト
await chocoDrop.client.generateImage('test');
```

### ネットワークデバッグ

```bash
# サーバーAPI直接テスト
curl -X POST http://localhost:3011/api/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test","width":512,"height":512}'

# 利用可能サービス確認
curl http://localhost:3011/api/services
```

## 📞 サポートチャネル

### 1. 自己解決

1. ブラウザコンソール (F12) でエラー確認
2. サーバーログでエラー詳細確認
3. このガイドで類似問題を検索

### 2. コミュニティサポート

- [GitHub Issues](https://github.com/nyukicorn/chocodrop/issues)
- [GitHub Discussions](https://github.com/nyukicorn/chocodrop/discussions)

### 3. 問題報告時の情報

**必須情報**:
- OS・ブラウザバージョン
- Node.js バージョン
- ChocoDrop バージョン
- エラーメッセージ全文
- 再現手順

**推奨情報**:
- `config.json` の内容（機密情報除く）
- ブラウザコンソールのエラー
- サーバーログ
- 最小再現コード

## 🔄 アップデート時の注意

### バージョンアップ手順

```bash
# 現在のバージョン確認
npm list @chocodrop/core

# アップデート
npm update @chocodrop/core

# 互換性確認
npm run example:basic
```

### 設定移行

新バージョンで設定ファイル形式が変更された場合:

```bash
# バックアップ作成
cp config.json config.json.backup

# 新しい設定テンプレート取得
cp config.example.json config.json

# 手動で設定値を移行
```