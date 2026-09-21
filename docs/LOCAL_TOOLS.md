# Codex・Claude Code・Gemini CLIから使う

ChocoDropのローカルMCPは、許可した素材フォルダ内の画像・動画・GLBを、ローカルブラウザのThree.jsシーンへ配置します。生成サービス、APIキー、外部の認証情報は使用しません。

## 1コマンドで設定する

Node.js 22 LTSとnpmを用意し、次を実行します。

```bash
npx --yes @chocodrop/setup@alpha
```

インストール済みのCodex・Claude Code・Gemini CLIを検出し、実行内容を表示して確認した後に、次を行います。

- `~/ChocoDropAssets`を素材専用フォルダとして作成
- 見つかったCLIのユーザー設定へChocoDrop MCPを登録

設定後にCLIを再起動し、「ChocoDropの`get_status`でURLを教えて」と依頼してください。変更内容だけ確認する場合は`--dry-run`、確認を省略する場合は`--yes`を付けます。

```bash
npx --yes @chocodrop/setup@alpha --dry-run
npx --yes @chocodrop/setup@alpha --client codex,claude --yes
npx --yes @chocodrop/setup@alpha --assets-dir /absolute/path/to/your/assets
```

ChocoDropは、設定した素材フォルダ外のファイルを読み込みません。

## 手動でMCPを登録する

自動設定を使わない場合は、先に素材専用フォルダを作成し、以下の`/absolute/path/to/your/assets`をその絶対パスへ置き換えます。

### Codex

```bash
codex mcp add chocodrop -- npx -y @chocodrop/mcp@alpha --assets-dir /absolute/path/to/your/assets
codex mcp get chocodrop
```

ユーザー設定へ追加されます。既に開いている会話にツールが現れない場合は、Codexを再起動して新しい会話で確認してください。

### Claude Code

```bash
claude mcp add --transport stdio --scope user chocodrop -- npx -y @chocodrop/mcp@alpha --assets-dir /absolute/path/to/your/assets
claude mcp get chocodrop
```

ユーザー設定へ追加されます。Claude Codeを起動し、`/mcp`で接続を確認します。

### Gemini CLI

```bash
gemini mcp add --scope user chocodrop npx -- -y @chocodrop/mcp@alpha --assets-dir /absolute/path/to/your/assets
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

stdioでは標準出力をMCP通信に使用します。各CLIは必要なときに`@chocodrop/mcp`を起動します。GUIアプリから`npx`が見つからない場合は、Node.jsを通常のシステム環境へインストールし直すか、手動設定で`npx`の絶対パスを指定してください。

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

Node単体テスト、ブラウザビルド、配布パッケージ、daemon契約テスト、Pages向け静的ファイルの生成を実行します。Pages成果物は`dist/pages/`です。

リポジトリからMCPを開発・検証する場合は、`npm ci && npm run build`の後、`node scripts/chocodrop-mcp.mjs --assets-dir /absolute/path/to/your/assets`をクライアントへ登録できます。
