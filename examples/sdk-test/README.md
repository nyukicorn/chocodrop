# ChocoDrop SDK Test Page

このページは **SDK版（完全版）** の動作確認用です。

## 📦 SDK版 vs デモ版

| 項目 | SDK版 (このページ) | デモ版 (basic/) |
|------|-------------------|----------------|
| ファイル | `CommandUI.js` | `CommandUIDemo.js` |
| 生成機能 | ✅ あり | ❌ なし（インポートのみ） |
| サーバー | 必要（localhost:3011） | 不要 |
| 用途 | 開発・npm配布 | GitHub Pages配布 |

## 🚀 使い方

### 1. サーバーを起動

```bash
# プロジェクトルートで実行
npm run dev:sdk
```

これで以下が起動します：
- SDK Test Page: http://localhost:8080/
- SDK Server: http://localhost:3011/

### 2. ブラウザで開く

http://localhost:8080/ にアクセス

### 3. ChocoDrop を起動

- `@` キーを押す
- または右下のボタンをクリック

### 4. 画像生成をテスト

自然言語で画像生成のリクエストを送信してテストします。

## 🔧 開発時の注意

### ソースコードを修正したら必ずビルド

```bash
npm run build
```

ビルドしないと変更が反映されません！

### テストする順序

1. `src/client/CommandUI.js` を修正
2. `npm run build` でビルド
3. `npm run dev:sdk` でサーバー起動
4. http://localhost:8080/ でテスト

## ⚠️ トラブルシューティング

**UIが更新されない**
→ ブラウザのキャッシュをクリア（Cmd+Shift+R）

**生成機能が動かない**
→ SDK Serverが起動しているか確認（http://localhost:3011/health）

**ポートが使われている**
→ 他のプロセスを終了してから再起動

---

詳細は `.claude/commands/edit-chocodrop-form.md` を参照してください。
