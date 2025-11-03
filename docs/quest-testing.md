# Meta Quest テスト準備ガイド

Meta Quest ブラウザから ChocoDrop の XR 体験を検証するための手順をまとめています。

## 1. 前提条件
- Node.js 18 以上がインストールされていること
- ngrok アカウントがあり、`npx ngrok` が認証済みであること
- Meta Quest と開発マシンが同一ネットワークに接続されていること

## 2. 開発サーバー起動
```bash
cd /Users/nukuiyuki/Dev/ChocoDrop/.worktrees/task-1762140313516-11046e
npm run dev
```
実行するとランダムなポート番号でローカルサーバーが立ち上がり、`output/build-report.json` に `localUrl` が記録されます。

## 3. ngrok トンネル作成
別ターミナルで以下を実行します:
```bash
npm run tunnel
```
数秒後に `output/build-report.json` の `ngrokUrl` が更新されます。Meta Quest ブラウザではこの HTTPS URL を使用します。

## 4. Quest ブラウザでアクセス
1. Meta Quest のブラウザを起動し、アドレスバーに `ngrokUrl` を入力して接続します。
2. タブが開いたら `immersive.html` を読み込み、表示が落ち着いたら「XRセッション開始」を選択します。
3. WebXR 権限のダイアログが表示されたら「許可」を選択してください。
4. 追加で `importer.html` を開き、GLB/GLTF/JSON ファイルのみ受理されることを確認します。ファイルは Meta Quest 上のクラウドストレージから選択できます。

## 5. 推奨チェック項目
- 初回ロードが 2 秒以内に完了するか（ローディング状態を目視）
- XR セッション中のフレームが滑らか（概ね 72fps）か
- リードコントローラーでの視点操作が問題ないか
- `importer.html` で OPFS 保存後、ページ再読み込みしても保存済み一覧に表示されるか

## 6. 切断・終了
テスト終了後は両ターミナルで `Ctrl + C` を押してサーバーを停止し、ngrok セッションも終了させてください。

---
Meta Quest ブラウザは HTTPS のみ WebXR を許可します。必ず `ngrokUrl` 経由でアクセスしてください。*** End Patch
