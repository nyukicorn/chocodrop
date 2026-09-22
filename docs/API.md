# ChocoDrop API リファレンス

この文書は、現在公開しているローカルMCPとブラウザ統合の入口を説明します。ChocoDropのMCPは素材を生成せず、許可したローカルファイルをブラウザの3D空間へ配置します。

## ローカルMCP

通常はセットアップツールから登録します。

```bash
pnpm dlx @chocodrop/setup@0.1.0-alpha.1
```

MCP本体を直接起動する場合は、素材フォルダを指定します。

```bash
pnpm dlx @chocodrop/mcp@0.1.0-alpha.1 --assets-dir /absolute/path/to/your/assets
```

### `get_status`

ローカルシーンのURLと接続状態を返します。引数はありません。

```text
ChocoDropのget_statusでURLを教えて
```

返された`browserUrl`をブラウザで開き、ツール連携中と表示されるまで待ちます。

### `import_asset`

許可した素材フォルダ内のファイルを、接続中のChocoDropシーンへ配置します。

```json
{
  "path": "/absolute/path/to/your/assets/sample.png"
}
```

配置位置を指定する場合は`position`へ有限の数値を渡します。

```json
{
  "path": "/absolute/path/to/your/assets/sample.glb",
  "position": { "x": 0, "y": 1, "z": -2 }
}
```

対応形式はPNG、JPEG、WebP、MP4、WebM、自己完結したGLBです。1ファイル32MiB、プロセス合計128MiBまでです。素材フォルダ外のファイルとシンボリックリンクは拒否されます。

## ブラウザ統合

### 公開デモ

[公開サイト](https://nyukicorn.github.io/chocodrop/#home)では、サンプルまたは手元のファイルをブラウザ内だけで読み込みます。配置内容はページの再読み込みでリセットされます。

### ブックマークレット

ブックマークレットは、`scene`・`camera`・`renderer`を参照できるThree.jsページへChocoDrop UIを追加します。詳しい条件は[ブックマークレットガイド](BOOKMARKLET.md)をご覧ください。

### JavaScript SDK

自分のThree.jsアプリへ組み込む場合は、[統合ガイド](INTEGRATION.md)の`window.chocodrop.attach()`または`createChocoDrop()`を使用します。SDKとdaemonのバージョンを揃え、公開API以外の内部モジュールへ直接依存しないでください。

## セキュリティ境界

- MCPとdaemonは`127.0.0.1`だけで待ち受けます。
- 素材フォルダは配置を許可するファイルだけに限定してください。
- ChocoDropのMCPに素材生成サービスの認証情報を渡す必要はありません。
- セキュリティ上の問題は[非公開の脆弱性報告](https://github.com/nyukicorn/chocodrop/security/advisories/new)へお寄せください。
