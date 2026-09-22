# @chocodrop/setup

Codex、Claude Code、Antigravityを検出し、ChocoDrop MCPを登録するセットアップコマンドです。

```bash
pnpm dlx @chocodrop/setup@0.1.0-alpha.1
```

既定では、見つかったツールを表示して確認した後、`~/ChocoDropAssets`を作成し、ユーザー設定へChocoDropを登録します。Antigravityでは既存の`~/.gemini/config/mcp_config.json`を保持し、`mcpServers.chocodrop`だけを追加・更新します。

```bash
# Codexだけに登録
pnpm dlx @chocodrop/setup@0.1.0-alpha.1 --client codex --yes

# 素材フォルダを指定
pnpm dlx @chocodrop/setup@0.1.0-alpha.1 --assets-dir /path/to/assets

# 変更内容だけ確認
pnpm dlx @chocodrop/setup@0.1.0-alpha.1 --dry-run
```

pnpmがない環境では`npx --yes @chocodrop/setup@0.1.0-alpha.1`も使用できます。

登録後、CLIを再起動して「ChocoDropの`get_status`でURLを教えて」と依頼してください。

このセットアップは生成サービスを追加しません。普段使っている生成MCPやCLIでPNG、動画、GLBを素材フォルダへ保存し、ChocoDropの`import_asset`で配置します。

案内するパッケージは検証済みバージョンへ固定しています。このパッケージに`install`・`postinstall`スクリプトや外部依存はありません。

[Website](https://nyukicorn.github.io/chocodrop/) · [Source](https://github.com/nyukicorn/chocodrop)
