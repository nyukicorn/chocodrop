# @chocodrop/setup

Codex、Claude Code、Antigravityを検出し、ChocoDrop MCPを登録するセットアップコマンドです。

```bash
pnpm dlx @chocodrop/setup@0.1.0-alpha.2
```

既定では、見つかったツールを表示して確認した後、`~/ChocoDropAssets`を作成し、未登録のツールへChocoDropを登録します。既存のChocoDrop設定は変更せず、どのツールをスキップしたか表示します。Antigravityでも他の設定を保持します。

```bash
# Codexだけに登録
pnpm dlx @chocodrop/setup@0.1.0-alpha.2 --client codex --yes

# 素材フォルダを指定
pnpm dlx @chocodrop/setup@0.1.0-alpha.2 --assets-dir /path/to/assets

# 変更内容だけ確認
pnpm dlx @chocodrop/setup@0.1.0-alpha.2 --dry-run
```

pnpmがない環境では`npx --yes @chocodrop/setup@0.1.0-alpha.2`も使用できます。

登録後、CLIを再起動して「ChocoDropの`get_status`でURLを教えて」と依頼してください。

このセットアップは生成サービスを追加しません。普段使っている生成MCPやCLIでPNG、動画、GLBを素材フォルダへ保存し、ChocoDropの`import_asset`で配置します。

案内するパッケージは検証済みバージョンへ固定しています。このパッケージに`install`・`postinstall`スクリプトや外部依存はありません。

[Website](https://nyukicorn.github.io/chocodrop/) · [Source](https://github.com/nyukicorn/chocodrop)
