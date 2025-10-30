# 検証環境手順書（チェックリスト）

## 1. ブラウザ準備
- [ ] **Chrome / Edge**: `chrome --user-data-dir=$HOME/.chocodrop-pwa --disable-extensions` のように新規プロファイルを用意し、すべての拡張機能を無効化していますか。
- [ ] **Quest 3**: Meta Browser のキャッシュを削除し、実験機能（Labs）はデフォルト設定に戻しましたか。

## 2. ネットワーク設定
1. **ローカル IP の確認**
   - macOS / Linux: `ipconfig getifaddr en0` または `hostname -I`。
   - Windows: `ipconfig` → 使用中のアダプタの IPv4 アドレス。
2. **環境変数と起動**
   ```bash
   HOST=<ローカルIP> \
   PORT=3011 \
   CLIENT_SERVER_URL=http://<ローカルIP>:3011 \
   npm run dev
   ```
   - `.env` を使わずコマンド一発で起動し、サーバーログに `🍫 ChocoDropServer initialized` が出力されること。
3. **旧プロセスの停止**
   ```bash
   lsof -i :3011
   kill -9 <PID>
   ```
   - `command not found` の場合は `sudo lsof` を利用。

## 3. HTTPS トンネル
- [ ] ngrok を利用する場合 `ngrok http 3011 --host-header=rewrite` を実行し、生成された HTTPS URL を Quest / モバイルに共有しましたか。
- [ ] Cloudflare Tunnel を利用する場合、`cloudflared tunnel run <TUNNEL_NAME>` を実行し、チームでトークンを共有していますか。

## 4. CORS・共通設定
- [ ] `src/server/server.js` の `defaultCorsOrigins` に検証端末のホストが含まれているか確認しましたか。必要に応じて `config/server` で追加してください。
- [ ] `config/config.js`（または `config.example.json`）で `client.serverUrl` が `http://<HOST>:<PORT>` に一致していますか。
- [ ] import map は使用していませんが、`public/load-three.js` で `jsDelivr` から three.js を読み込むため、検証時はネットワーク遮断ツールを無効化してください。

## 5. Service Worker / OPFS 確認
- [ ] DevTools > Application > Service Workers で `chocodrop-pwa-v1` が登録されているか確認しましたか。
- [ ] Application > Storage > Origin Private File System に `chocodrop-cache` ディレクトリが作成され、`session.json` と `chocodrop-dev.log` が生成されることを確認しましたか。

## 6. Quest 3 実機手順
1. HTTPS URL を Meta Browser に入力 → ページが表示されたら右上メニューから「Install App」。
2. ホームに追加されたアイコンから起動 → 「XR体験を開始する」をタップでセッション開始。
3. セッション終了後、`ngrok` を停止して再度起動し、オフラインバナーが表示されるか確認。

## 7. 検証完了記録
- [ ] `output/tech-validation-report.md` に使用したブラウザバージョンと結果を追記しましたか。
- [ ] `chocodrop-dev.log` をチームドライブへ保管し、再発手順を添えて共有しましたか。
