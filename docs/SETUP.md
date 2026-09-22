# ChocoDrop セットアップガイド

ChocoDropは、手元の画像・動画・GLBをThree.jsの3D空間へ配置するツールです。ChocoDrop自体に素材生成サービスやAPIキーは必要ありません。

## まずブラウザで試す

[公開デモ](https://nyukicorn.github.io/chocodrop/#home)を開き、「猫ちゃんを置く」または「画像・動画・GLBを選ぶ」を押します。アカウントやGitHubのcloneは不要です。

## Codex・Claude Code・Antigravityとつなぐ

Node.js 18以上とpnpmを用意し、次のコマンドを実行します。

```bash
pnpm dlx @chocodrop/setup@0.1.0-alpha.1
```

セットアップは利用中のCLIを検出し、内容を表示して確認した後、ChocoDrop MCPを登録します。詳しいオプションと手動設定は[ローカルMCPガイド](LOCAL_TOOLS.md)をご覧ください。

登録後にCLIを再起動し、次のように依頼します。

```text
ChocoDropのget_statusでURLを教えて
```

返されたローカルURLをブラウザで開き、素材を`~/ChocoDropAssets`へ保存してから、次のように依頼します。

```text
ChocoDropのimport_assetでsample.pngを配置して
```

## ブックマークレットを使う

既存の対応Three.jsページへUIを追加する場合は、ローカルdaemonを起動します。

```bash
pnpm dlx @chocodrop/daemon@1.0.4-alpha.0
```

続いて[ブックマークレット登録ページ](https://nyukicorn.github.io/chocodrop/examples/bookmarklet-v2.html)から登録します。対象ページの条件と制限は[ブックマークレットガイド](BOOKMARKLET.md)をご覧ください。

## リポジトリから開発する

```bash
git clone https://github.com/nyukicorn/chocodrop.git
cd chocodrop
npm ci
npm run build
./scripts/check.sh
```

ローカルMCPを直接起動する場合は、配置を許可する素材フォルダを明示します。

```bash
npm run mcp -- --assets-dir /absolute/path/to/your/assets
```

## 現在の境界

- 公開サイトは静的なGitHub Pagesです。MCPとdaemonは利用者のPCで動きます。
- MCPは素材を生成せず、許可したフォルダ内のファイルを配置します。
- 対応形式はPNG、JPEG、WebP、MP4、WebM、自己完結したGLBです。
- ChocoDropの現行ブラウザ統合はThree.js向けです。
- XR・Questはブラウザ版とは別に検証中です。

## サポート

- [GitHub Issues](https://github.com/nyukicorn/chocodrop/issues)
- [GitHub Discussions](https://github.com/nyukicorn/chocodrop/discussions)
- [非公開の脆弱性報告](https://github.com/nyukicorn/chocodrop/security/advisories/new)
