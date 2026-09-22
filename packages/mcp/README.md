# @chocodrop/mcp

Codex、Claude Code、AntigravityなどのMCPクライアントから、許可したローカルフォルダ内の画像・動画・GLBをChocoDropのブラウザシーンへ配置します。

このMCPは素材を生成しません。普段使っている生成MCPやCLIでファイルを作り、素材フォルダへ保存してから配置します。

```bash
pnpm dlx @chocodrop/mcp@0.1.0-alpha.1 --assets-dir "$HOME/ChocoDropAssets"
```

通常は [`@chocodrop/setup`](https://www.npmjs.com/package/@chocodrop/setup) で利用中のCLIへ登録してください。

- 待受先は`127.0.0.1`のみです。
- `get_status`で専用ブラウザURLを取得します。
- `import_asset`でPNG、JPEG、WebP、MP4、WebM、自己完結したGLBを配置します。
- 1ファイル32MiB、プロセス合計128MiBまでです。
- パッケージに`install`・`postinstall`スクリプトはありません。

[Website](https://nyukicorn.github.io/chocodrop/) · [Source](https://github.com/nyukicorn/chocodrop)
