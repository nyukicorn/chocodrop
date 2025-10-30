# 技術検証レポート（2025-10-30）

## 1. 検証サマリー
| プラットフォーム | バージョン | 検証内容 | 結果 | 備考 |
| --- | --- | --- | --- | --- |
| Quest 3 (Meta Browser) | v66 予定 | PWA インストール、XR起動、オフライン再訪 | 未実施 | 実機接続不可のため後述手順を参照してください。 |
| Chrome 129 (macOS) | 129.0.x | PWA 登録、オフライン動作、Service Worker 更新 | 手元確認済み | Lighthouse / DevTools で SW と OPFS を確認。 |
| Safari 18 (macOS) | 18.0 | WebClip インストール、オフライン動作 | 未実施 | iOS/macOS Safari は Service Worker 対応のため手順通り動作する想定。 |

## 2. テストケース
1. **PWA 登録**
   - `chrome://flags/#enable-desktop-pwas-launch-handler` は既定値のままで可。
   - アドレスバーの「インストール」アイコン → インストール。
   - ホームアイコンから起動し、`display-mode: standalone` で表示されることを確認。
2. **WebXR セッション**
   - `/immersive.html` を開き、「XR体験を開始する」を押下。
   - ヘッドセット内でセッション開始ダイアログに許可を与える。
   - 3D グリッドが表示され、セッション終了で UI が復帰すること。
3. **オフライン動作**
   - DevTools > Application > Service Workers で「Offline」チェック → `/index.html` をリロード。
   - モデルプルダウンが OPFS から復元され、オフラインバナー表示を確認。
4. **ログ採取**
   - DevTools > Application > Storage > Origin Private File System → `chocodrop-cache/chocodrop-dev.log` をダウンロード。
   - エラーを再現し、ログに JSON が追記されていること。

## 3. 実機検証手順（Quest 3）
1. **環境準備**
   - `ngrok http 3011 --host-header=rewrite` 等で HTTPS トンネルを作成。
   - Quest ブラウザで発行された HTTPS URL を開く。
2. **PWA 登録**
   - ブラウザのメニュー → `Install App` を選択し、ホーム画面に追加。
3. **XR 起動確認**
   - ホームアイコンから起動し、自動で `/immersive.html` が開く。
   - 「XR体験を開始する」を押下し、セッションが立ち上がること。
4. **オフライン確認**
   - ngrok を停止し、再びホームアイコンから起動。
   - オフラインバナーが表示され、キャッシュ済みデータで UI が読み込まれることを確認。

## 4. 既知の課題
- Quest 3 のブラウザでは初回アクセス時に TLS 警告が出る可能性があるため、ngrok 等の公的証明書付きトンネルを推奨。
- Safari (iOS) では WebXR API が限定的なため、AR Quick Look 等へのフォールバック検討が必要。
- 自動テストは未整備。Playwright の WebXR モックを利用した E2E テストを今後追加する余地あり。
