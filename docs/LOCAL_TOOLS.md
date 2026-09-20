# Codex・Claude Code・Gemini CLIから使う

ChocoDropのローカルMCPは、許可した素材フォルダ内の画像・動画・GLBを、ローカルブラウザのThree.jsシーンへ配置します。生成サービス、APIキー、外部の認証情報は使用しません。

## 先に準備する

Node.js 22 LTSとnpmを推奨します。

```bash
git clone https://github.com/nyukicorn/chocodrop.git
cd chocodrop
npm ci
npm run build
```

素材専用フォルダを用意し、以降の`/absolute/path/to/your/assets`をその絶対パスに置き換えてください。ChocoDropは、このフォルダ外のファイルを読み込みません。

## MCPを登録する

### Codex

```bash
codex mcp add chocodrop -- node /absolute/path/to/chocodrop/scripts/chocodrop-mcp.mjs --assets-dir /absolute/path/to/your/assets
codex mcp get chocodrop
```

ユーザー設定へ追加されます。既に開いている会話にツールが現れない場合は、Codexを再起動して新しい会話で確認してください。

### Claude Code

ChocoDropを使いたいプロジェクトのディレクトリで実行します。

```bash
claude mcp add --transport stdio --scope local chocodrop -- node /absolute/path/to/chocodrop/scripts/chocodrop-mcp.mjs --assets-dir /absolute/path/to/your/assets
claude mcp get chocodrop
```

現在のプロジェクトだけの個人設定として追加されます。Claude Codeを起動し、`/mcp`で接続を確認します。

### Gemini CLI

```bash
gemini mcp add --scope user chocodrop node /absolute/path/to/chocodrop/scripts/chocodrop-mcp.mjs -- --assets-dir /absolute/path/to/your/assets
gemini mcp list
```

Gemini CLIはstdio MCPをサポートしています。現在のフォルダが信頼されていない場合、`gemini mcp list`ではサーバーが`Disconnected`と表示されます。利用するフォルダを信頼してから再確認してください。

公式資料： [Codex MCP](https://developers.openai.com/codex/mcp) · [Claude Code MCP](https://code.claude.com/docs/en/mcp) · [Gemini CLI MCP](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md)

## 配置する

1. 利用中のツールへ「ChocoDropの`get_status`を呼んで」と依頼します。
2. 返された`browserUrl`をブラウザで開きます。
3. 「ChocoDropの`import_asset`で、素材フォルダの`sample.png`を配置して」と依頼します。

直接ツール引数を指定する場合は次の形です。

```json
{
  "path": "/absolute/path/to/your/assets/sample.png",
  "position": { "x": 0, "y": 0, "z": 12 }
}
```

位置はカメラ基準で、xが右、yが上、zが前方への距離です。ブラウザ内への配置完了後に、`objectId`を含む成功結果を返します。

MCPクライアントがローカルサーバーを起動するため、`npm run local`を同時に実行する必要はありません。ツールごとに別のシーンが起動するため、必ずそのツールの`get_status`が返したURLを開いてください。

stdioでは標準出力をMCP通信に使用します。登録コマンドには`npm run mcp`ではなく、上記の`node .../scripts/chocodrop-mcp.mjs`を指定します。GUIアプリから`node`が見つからない場合は、Node実行ファイルの絶対パスを指定してください。

## ブラウザだけで使う

[公開サイト](https://nyukicorn.github.io/chocodrop/#home)の遊園地では、MCPを登録せずに「猫ちゃんを置く」または「画像・動画・GLBを選ぶ」から配置できます。

ローカルで同じ入口を起動する場合は次を実行します。

```bash
npm run local -- --assets-dir /absolute/path/to/your/assets
```

起動時に表示されたURLを開き、終了時は`Ctrl+C`を押します。`--port 43111`のようにポートを指定することもできます。指定しなければ空きポートを選びます。

## 制限

- MCPの対象はPNG/JPEG/WebP、MP4/WebM、自己完結したGLBです。
- 1ファイル32MiB、プロセス合計128MiBまでです。終了するとメモリ上の素材は消去されます。
- GLB内の外部ファイル参照は拒否します。動画コーデックの対応状況はブラウザに依存します。
- 素材フォルダ外のパスと、外部を指すシンボリックリンクは拒否します。
- `127.0.0.1`だけで待ち受け、通信はプロセスごとのtokenで保護します。`browserUrl`を他者に共有しないでください。
- 操作対象は同じURLで接続した1タブです。複数タブでは誤配置を防ぐため拒否します。
- 配置応答の上限は20秒です。切断・タイムアウト・読込失敗はエラーとして返します。
- シーンはブラウザ内にあり、再読み込みで配置内容が消えます。保存・復元・削除・生成は、このMCPの対象外です。
- GitHub Pages自体はMCPサーバーを実行しません。MCP連携は利用者のPCで動きます。
- Quest接続やクラウド上のAIから利用者PCへ直接接続する機能は、この入口では提供しません。

## 開発時の検証

```bash
./scripts/check.sh
```

Node単体テスト、ブラウザビルド、daemon契約テスト、Pages向け静的ファイルの生成を実行します。Pages成果物は`dist/pages/`です。
