# ChocoDrop PWA UI/UX 設計ドキュメント

## 1. 体験コンセプト
- **ワンタップ没入**: PWA の `start_url` を `/immersive.html` に設定し、起動後は「XR体験を開始する」ボタンのみで WebXR セッションを開始できる設計。
- **常用アプリ化**: `manifest.webmanifest` と `service-worker.js` によりホーム画面アイコン、スタンドアロン表示、オフライン起動を実現。
- **安心な再訪体験**: `pwa-bootstrap.js` と OPFS（`navigator.storage.getDirectory`）を利用し、モデル一覧や直近のプロンプトをキャッシュ。オフライン時はバナーで状態を通知。

## 2. ページ構造
### 2.1 `/index.html`（管理ダッシュボード）
- **ヘッダー**: サーバー状態、稼働時間、サービス数を表示。
- **ワンタップ導線**: 新設の「🚀 ワンタップで没入ビューを開く」カードから `/immersive.html` を開く。
- **オフラインバナー**: `navigator.onLine` を監視し、オフライン時に `#offlineBanner` を表示。
- **フォーム領域**: 生成・変更・削除モードをタブで切り替え、各フォームの送信結果はカード内に表示。

### 2.2 `/immersive.html`（没入ランチャー）
- **ヒーローセクション**: 状態メッセージと 2 ボタン（XR開始 / ダッシュボードへ戻る）。
- **チュートリアルカード**: Quest 3 実機検証のチップスを箇条書き。
- **キャンバス領域**: `#canvasContainer` が WebGL レンダラーをホストし、事前にライト・グリッドをセットアップ。

## 3. 主要フロー
1. **インストール**
   - Chrome / Quest ブラウザでアクセス → ブラウザの「インストール」プロンプトが表示。
   - インストール後はホームアイコンから直接 `/immersive.html` が起動。
2. **XR 開始**
   - `immersive-launcher.js` が THREE.js と `createChocoDrop` を初期化。
   - 「XR体験を開始する」ボタン押下 → `navigator.xr.requestSession('immersive-vr', ...)` → `renderer.xr.setSession`。
3. **オフライン再訪**
   - Service Worker が `APP_SHELL` を precache。`/api/models` の失敗時は OPFS の `models.json` から復元。
   - 直近プロンプトは `session.json` からフォームに復元。
4. **ログ収集**
   - 例外時には `window.chocoPWA.appendLog` を通して `chocodrop-dev.log`（OPFS）に追記。

## 4. UI コンポーネント仕様
- **Action Button**: プライマリボタンは 18px Padding / 16px Radius、右利き操作でも押しやすい幅（100%）を確保。
- **状態表示**: ローディング時には中央にスピナー（CSSアニメーション）と動的メッセージ。
- **レスポンシブ**: 320px ビューポートでもコンテンツが縦積みになり、重要情報が折り返されないよう `clamp` を使用。

## 5. アクセシビリティ・操作性
- 色コントラスト: 主要テキストは WCAG AA 基準 (4.5:1 以上) を満たすカラーリングを採用。
- キーボード操作: ボタン／フォーム要素は標準の tab インデックスを維持。
- ステータス更新は `textContent` で書き換え、スクリーンリーダーが最新状態を取得可能。

## 6. 今後の検討ポイント
- XR セッション中に UI オーバーレイを抑制するため、メニューを VR UI に移植する余地がある。
- PWA 起動時の自動ログインや `WebXR Anchors` を用いた位置保持は未実装（改善提案で補足）。
