# @chocodrop/daemon

ChocoDropのブックマークレットとThree.js SDKへ、ローカルUIと補助APIを配信するdaemonです。`127.0.0.1`だけで待ち受けます。

素材を会話から配置する場合は、daemonではなく[`@chocodrop/setup`](https://www.npmjs.com/package/@chocodrop/setup)からローカルMCPを登録してください。

## 起動

Node.js 18以上とpnpmを用意します。

```bash
pnpm dlx @chocodrop/daemon@1.0.4-alpha.0
```

起動中は次のローカルURLを使用します。

- ヘルスチェック: `http://127.0.0.1:43110/v1/health`
- SDK: `http://127.0.0.1:43110/sdk.js`
- UI: `http://127.0.0.1:43110/ui/`

終了する時は、起動したターミナルで`Ctrl+C`を押してください。

## ブックマークレット

daemonを起動したまま、[登録ページ](https://nyukicorn.github.io/chocodrop/examples/bookmarklet-v2.html)からブックマークレットを登録します。対象ページはThree.jsの`scene`・`camera`・`renderer`を参照できる必要があります。

## 現在の範囲

- 現行の公開導線は、手元にある画像・動画・GLBのImportを中心にしています。
- ChocoDrop自体は素材を生成しません。生成には普段お使いのCLIやMCPを利用してください。
- 旧生成連携の互換コードはリポジトリ内に残っていますが、この公開手順では使用しません。

## 開発と検証

リポジトリのルートで実行します。

```bash
npm ci
npm run build
npm test --workspace=@chocodrop/daemon
./scripts/check.sh
```

[Website](https://nyukicorn.github.io/chocodrop/) · [Source](https://github.com/nyukicorn/chocodrop)
