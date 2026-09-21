# @chocodrop/setup

Codex、Claude Code、Gemini CLIを検出し、ChocoDrop MCPを登録するセットアップコマンドです。

```bash
npx --yes @chocodrop/setup@alpha
```

既定では、見つかったCLIを表示して確認した後、`~/ChocoDropAssets`を作成し、ユーザー設定へChocoDropを登録します。

```bash
# Codexだけに登録
npx --yes @chocodrop/setup@alpha --client codex --yes

# 素材フォルダを指定
npx --yes @chocodrop/setup@alpha --assets-dir /path/to/assets

# 変更内容だけ確認
npx --yes @chocodrop/setup@alpha --dry-run
```

登録後、CLIを再起動して「ChocoDropの`get_status`でURLを教えて」と依頼してください。

このセットアップは生成サービスを追加しません。普段使っている生成MCPやCLIでPNG、動画、GLBを素材フォルダへ保存し、ChocoDropの`import_asset`で配置します。

[Website](https://nyukicorn.github.io/chocodrop/) · [Source](https://github.com/nyukicorn/chocodrop)
