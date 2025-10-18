# Basic Three.js Example

最もシンプルなChocoDrop統合例です。

> ⚠️ **注意**: この例は**リポジトリをcloneした人（2%の人）向け**です。
> daemon のみを使う場合は、[vanilla-threejs の例](../vanilla-threejs/) を参照してください。

## 起動方法

```bash
# ルートディレクトリで
npm run dev
```

別のターミナルで：
```bash
# examplesサーバー起動
npm run example:basic
```

ブラウザで http://localhost:8000 を開いて `index.html` をクリック

## 使い方

1. **@キー** でコマンドUI起動
2. **自然言語入力**: 「ドラゴンを右上に」「桜を中央に」
3. **Enter** で実行

## 必要な設定

- ChocoDrop サーバーが `localhost:3011` で起動していること
- MCP設定が完了していること（`.claude/mcp-kamui-code.json`）

## トラブルシューティング

- **生成されない** → サーバーログを確認
- **配置されない** → ブラウザコンソールを確認
- **UIが表示されない** → F12 でエラーチェック