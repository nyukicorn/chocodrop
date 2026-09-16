# カムイコードに依存しないローカル利用

## ブラウザだけで使う

[Basicデモ](https://nyukicorn.github.io/chocodrop/examples/basic/)を開き、「サンプルを配置」で試すか、右下の🍫 → Import → ファイル選択で自動配置します。生成サービスやAPIキーは不要です。普段のAI・MCP・CLIで作成した素材も、ファイルに保存して使えます。

## ローカル起動

Node.js 22 LTS / npmを推奨します。リポジトリを取得して以下を実行します。

```bash
npm ci
npm run build
npm run local -- --assets-dir /absolute/path/to/your/assets
```

起動時に表示されたURLをブラウザで開きます。`--assets-dir`は、ツールに読み込ませてよい素材専用フォルダを指定してください。Ctrl+Cで停止します。`--port 43111`を指定することもできます。指定しなければ空きポートが選ばれます。

この入口は既存の `npm start` / `npm run dev` / daemon と独立しており、`config.json`・カムイ設定・1Password・生成サービスを利用しません。npm配布版への公開は別工程です。

## Cursor / stdio MCP対応ツール

Cursorの `.cursor/mcp.json` の `mcpServers` に以下を追加します。既存エントリを残し、絶対パスを自分の環境に置き換えてください。

```json
{
  "mcpServers": {
    "chocodrop": {
      "type": "stdio",
      "command": "node",
      "args": [
        "/absolute/path/to/chocodrop/scripts/chocodrop-mcp.mjs",
        "--assets-dir", "/absolute/path/to/your/assets"
      ]
    }
  }
}
```

`node`がGUIアプリから見つからない場合はNode実行ファイルの絶対パスを使います。stdio MCPではstdoutが通信専用なので、登録時は `npm run mcp` ではなく上の `node` コマンドを指定します。

1. `get_status` を呼び、返された `browserUrl` を開く。
2. ブラウザに「ツール連携中」と表示されるのを待つ。
3. `import_asset` に素材の絶対パスを渡す。

```json
{
  "path": "/absolute/path/to/your/assets/sample.png",
  "position": { "x": 0, "y": 0, "z": 12 }
}
```

位置はカメラ基準で、xが右、yが上、zが前方への距離です。ブラウザ内にオブジェクトが登録されてから成功と `objectId` を返します。送信しただけでは成功になりません。

Cursorがローカルサーバーも起動するので `npm run local` の同時起動は不要です。両方を起動した場合は別のシーンとなるため、必ずMCPの `get_status` が返したURLを開きます。他のstdio対応MCPクライアントからも同じコマンドで利用できます。

[Cursor公式のMCP設定](https://docs.cursor.com/context/model-context-protocol)

## 制限

- 新MCPの対象: PNG/JPEG/WebP、MP4/WebM、自己完結したGLB。ブラウザ手動Importとは対応形式が一部異なります。
- 1ファイル32MiB、プロセス合計128MiB。メモリ上で保持し、終了時に消去します。上限に達したらサーバーを再起動します。
- GLB内の外部ファイル参照は拒否します。動画コーデックの対応状況はブラウザに依存します。
- 素材フォルダ外のパス・外部を指すシンボリックリンクは拒否します。
- 127.0.0.1にのみ待ち受け、素材と通信はプロセスごとのtokenで保護します。URLを他者に共有しないでください。
- 操作対象は同じURLで接続した1タブのみです。複数タブでは誤配置防止のため拒否します。
- 配置応答の上限は20秒。切断・タイムアウト・読込失敗はエラーとして返します。
- シーンはブラウザ内にあり、ページ再読み込みで配置内容が失われます。MCPからの保存・復元・削除・生成は今回の対象外です。
- GitHub Pages自体はMCPサーバーを実行できません。MCP連携はローカルで利用します。
- Quest接続やクラウド上のAIから利用者PCへの接続は、この入口では提供しません。

## 開発時の検証

```bash
./scripts/check.sh
```

Node単体テスト、ブラウザビルド、既存daemonの契約テスト、Pages向け静的ファイルの生成を実行します。Pages成果物は `dist/pages/` です。公開前に、実ブラウザで起動・ファイル配置を確認してください。
