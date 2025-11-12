# ChocoDrop PWA / XR 完全統合ドキュメント

本書は `.worktrees/task-1762871591445-faaa93` から `.worktrees/task-1762871606532-4ee297` までの 7 ワークツリー成果物（conversation-summary, environment-checklist, improvement-proposals, scene-import-tutorial, settings-schema, tech-validation-report, ui-ux-design, xr-ui-prototype-notes, pwa_xr_strategy_2025.html など）を統合し、PWA/XR 戦略・実装・運用の最新知見を 1 つにまとめた完全版です。

## 1. 戦略サマリー
### 1.1 体験ゴール
- ホームアイコン → `/immersive.html` → 「XR 体験を開始する」のワンタップ導線で WebXR を即起動。
- Service Worker + OPFS を活かした常用 PWA と、ユーザー任意の Three.js シーンを取り込む拡張モードを同時に成立させる。
- ブックマークレットで「子アプリ体験」を提供し、興味を持ったユーザーを PWA（親アプリ）に誘導する二段導線を構築。

### 1.2 価値の二枚看板
| 観点 | 既存価値: メディア配置 | 新価値: XR 化 & シーン移動 |
| --- | --- | --- |
| 体験 | DOM/UI 上で画像・動画・音声・GLTF を自然言語で配置。SceneManager が履歴と配置を制御。 | GitHub Pages 等の URL を PWA が読み込み XR Bridge で没入体験へ移行。ブックマークレットが URL を送客。 |
| 利点 | ゼロコードで成果共有しやすく、生成系ワークフローと相性が良い。 | Vision Pro / Quest / Desktop Chrome まで一貫した XR 体験をゼロコードで確保。 |
| 技術要素 | SceneManager, LiveCommandClient, bookmarklet。 | XRBridge, Remote Scene Loader, postMessage 経由の URL 連携。 |

### 1.3 2025 年インサイト
- visionOS 2 Safari は WebXR をデフォルト有効化し、`transient-pointer` に標準対応。DOM 依存 UIs は XR Layer 化が必須。
- IDC: 2025 年の AR/VR + display-less smart glasses 市場は 1430 万台（前年比 +39.2%）、Meta のシェアは 60.6%。
- PWA は大手 EC でコンバージョン改善（Alibaba +76%、Flipkart +70%、Lancôme +17%）が継続報告され、インストールレス体験が主流に。
- GuardianPWA / Permissioner / SPARE などの研究で manifest・Service Worker の静的検証が品質保証の前提に。
- AI 生成（Google Flow / Veo 3 など）が 90 日で 1 億本規模に到達し、「テキスト→シーン」ゼロコード需要が急増。ChocoDrop の方向性を後押し。

## 2. アーキテクチャと実装メモ
### 2.1 ダッシュボード `/index.html`
- Service Worker (`public/service-worker.js`) と OPFS (`public/pwa-bootstrap.js`) でキャッシュ・ログ・最終入力を復元。
- モデル一覧取得失敗時は OPFS からリカバリ。フォームタブで生成/変更/削除モードを切替。
- オフラインバナーで `navigator.onLine` 状態を通知し、`session.json` から UX を再現。

### 2.2 没入ランチャー `/immersive.html`
- `immersive-launcher.js` が Three.js レンダラー・ライト・グリッドを初期化し、`ensureChocoDrop`→`createChocoDrop` でシーン管理を注入。
- WebXR Layers / DOM Overlay 化を視野に、XR UI を差し込めるキャンバス構成を確保。
- Import map で CDN の `three.module.js` を解決し、PWA manifest 経由でホームアイコンから即起動。

### 2.3 シーン取り込みモード
- `public/imported-scenes/` 配下に GLB/GLTF/JSON を配置し、`configs.json` でメタ情報（id, type, path, camera 等）を管理。
- `loadImportedScene(sceneId)` で `GLTFLoader` 等を利用し、`createChocoDrop` 呼び出し前に既存シーンを差し替える。
- ブックマークレットから URL/カメラ情報を JSON として PWA に送信し、`configs.json` へ追記する API を追加予定。

### 2.4 共通リソース
- 図表: `output/architecture-diagram.svg`, `output/pwa-test-flow.svg`。
- チュートリアル: `output/scene-import-tutorial.md`, `docs/pwa-xr-direction-proposal.html`。
- 設定参照: `output/settings-schema.md`, `output/xr-ui-prototype-notes.md`。

## 3. セットアップ & チェックリスト
### 3.1 ブラウザ / デバイス
- Chrome/Edge: `--user-data-dir=$HOME/.chocodrop-pwa --disable-extensions` でクリーンプロファイル。
- Quest 3: Meta Browser キャッシュを削除し、Labs 設定をデフォルトへ戻す。

### 3.2 ネットワーク & 起動
```bash
HOST=<ローカルIP> PORT=3011 CLIENT_SERVER_URL=http://<ローカルIP>:3011 npm run dev
```
- `.env` ではなくワンライナーで起動し、ログに `🍫 ChocoDropServer initialized` が出ること。
- 旧プロセスは `lsof -i :3011` → `kill -9 <PID>` で整理。

### 3.3 HTTPS トンネル
- `ngrok http 3011 --host-header=rewrite` または `cloudflared tunnel run <NAME>` で HTTPS を配備し、Quest と共有。

### 3.4 CORS / Config
- `src/server/server.js` の `defaultCorsOrigins` に検証端末ホストを含める。
- `config/config.js` の `client.serverUrl` を `http://<HOST>:<PORT>` に揃える。
- `public/load-three.js` が jsDelivr へ到達できるようネットワーク遮断ツールを無効化。

### 3.5 Service Worker / OPFS 確認
- DevTools > Application > Service Workers で `chocodrop-pwa-v1` が登録済み。
- Storage > Origin Private File System で `chocodrop-cache` 配下に `session.json` と `chocodrop-dev.log` が生成されること。

### 3.6 Quest 3 手順
1. HTTPS URL を Meta Browser で開き「Install App」。
2. ホームアイコンから起動し「XR 体験を開始する」でセッション開始。
3. セッション後にトンネルを停止し、オフラインバナー表示を確認。

### 3.7 検証ログ
- `output/tech-validation-report.md` へ使用ブラウザと結果を追記。
- `chocodrop-dev.log` をチームドライブにバックアップ。

## 4. 技術検証レポート要約（2025-10-30）
### 4.1 サマリー
| プラットフォーム | バージョン | 内容 | 結果 | 備考 |
| --- | --- | --- | --- | --- |
| Quest 3 (Meta Browser) | v66 予定 | PWA インストール / XR / オフライン | 未実施 | 実機接続不可。手順を後述。 |
| Chrome 129 (macOS) | 129.0.x | PWA 登録 / SW / OPFS | 確認済み | Lighthouse で検証。 |
| Safari 18 (macOS) | 18.0 | WebClip + オフライン | 未実施 | Service Worker 対応のため想定内。 |

### 4.2 テストケース
1. PWA インストール → `display-mode:standalone` を確認。
2. `/immersive.html` → WebXR セッション開始 → 3D グリッド表示。
3. DevTools でオフライン切替 → モデルが OPFS から復元。
4. OPFS 内の `chocodrop-dev.log` をダウンロードし、エラー発生時に JSON が追記されることをチェック。

### 4.3 Quest 3 実機手順
- `ngrok` などで HTTPS を用意し、Meta Browser でアクセス → Install → XR 起動 → ngrok 停止後のオフライン再訪を確認。

### 4.4 既知課題
- TLS 警告回避のため公的証明書付きトンネル推奨。
- Safari (iOS) の WebXR 制限に備え、AR Quick Look 等のフォールバック検討。
- E2E 自動テスト未整備。Playwright + WebXR モックで CI を準備予定。

## 5. シーン取り込み & 設定スキーマ
### 5.1 シーン取り込みワークフロー
1. `public/imported-scenes/` にアセットを配置し、関連テクスチャも同階層へ。
2. `configs.json` に `id/label/type/path/initialCamera` などを記述。
3. `loadImportedScene(sceneId)` で GLB/GLTF/JSON を fetch → loader で読み込み。
4. `createChocoDrop` 呼び出し前に `scene` を差し替え、`initialCamera` を反映。
5. `HOST=0.0.0.0 PORT=3011 ... npm run dev` で起動し、`/immersive.html?scene=<id>` で XR を確認。
6. ブックマークレットから URL・シーン設定を JSON 送信し、自動登録する API を今後追加。

#### Bookmarklet → PWA 連携仕様（2025-01-15更新）
- **エンドポイント**: `POST /api/scenes/import`
- **必須フィールド**: `url`、`label`
- **推奨フィールド**: `camera`（position/rotation）、`thumbnail`（Base64 PNG）、`renderer`（type/version/capabilities）、`metadata`
- **リクエスト例**
```json
{
  "url": "https://threejs.org/examples/#webgl_animation_keyframes",
  "label": "Three.js Animation Example",
  "camera": {
    "position": { "x": 0, "y": 5, "z": 10 },
    "rotation": { "x": 0, "y": 0, "z": 0 }
  },
  "thumbnail": "data:image/png;base64,iVBORw0KG...",
  "renderer": {
    "type": "WebGLRenderer",
    "version": "r170",
    "maxTextures": 16,
    "maxTextureSize": 16384
  },
  "metadata": {
    "userAgent": "Mozilla/5.0 ...",
    "timestamp": "2025-01-15T12:00:00.000Z",
    "viewport": { "width": 1920, "height": 1080 }
  }
}
```
- **レスポンス例**
```json
{
  "success": true,
  "scene": {
    "id": "scene_1736943600000_abc123",
    "label": "Three.js Animation Example",
    "type": "external",
    "url": "https://threejs.org/examples/#webgl_animation_keyframes",
    "camera": { ... },
    "thumbnail": "/imported-scenes/screenshots/scene_1736943600000_abc123.png",
    "renderer": { ... },
    "metadata": { ... },
    "createdAt": "2025-01-15T12:00:00.000Z"
  },
  "message": "シーン「Three.js Animation Example」を登録しました (ID: scene_1736943600000_abc123)"
}
```
- **動作フロー**:
  1. ブックマークレットがThree.jsシーンを検出（scene/camera/renderer）
  2. `renderer.domElement.toDataURL()` でサムネイルをキャプチャ
  3. `POST /api/scenes/import` にJSON送信
  4. サーバーがBase64サムネイルを `public/imported-scenes/screenshots/` に保存
  5. `configs.json` に新規シーン追加してログ出力: `✅ Scene imported successfully! { sceneId, label, url, ... }`
  6. `/immersive.html` のシーン一覧が5秒ポーリングで自動更新
  7. ブックマークレット側に成功通知表示（ボタンが緑に変化）

#### XR スクリーンショット保存
- `/immersive.html` 左下のライブラリパネルに **スクショ** ボタンを配置。クリックで WebGL キャンバスを `canvas.toDataURL('image/png')` し、`POST /api/imported-scenes/screenshots` で `public/imported-scenes/screenshots/` へ保存。
- 保存結果はトーストに表示し、`configs.json` の再読み込みをトリガー → UI へ即反映。README にも保存先と撮影導線を明記済み。
- XR内で最新サムネイル／スクリーンショットを CanvasTexture で掲示する「メディアボード」も実装。ボタン1つで On/Off でき、視覚的なレビューが容易になった。
- 参考スクリーンショット: `docs/screenshots/xr-media-panel.png`

### 5.2 OPFS 設定スキーマ
| ファイル | 用途 | 備考 |
| --- | --- | --- |
| `session.json` | 直近プロンプト、選択サービス、XR 起動時刻 | `saveSession` / `loadSession` |
| `models.json` | モデル一覧キャッシュ | オフライン復元 |
| `chocodrop-dev.log` | エラー/操作ログ | `appendLog` で追記 |

#### 拡張予定フィールド
- `scenes[]`: id, source, type, camera, lastUsed。
- `preferences`: テーマ、XR UI パネル位置/スケール。
- `onboarding`: bookmarklet / XR チュートリアル達成状況。

#### 保存戦略
- 短期は OPFS に集約。中期以降はクラウド同期や API 保存を検討し、GraphQL/REST を用意する。

## 6. UI/UX と XR UI 設計
### 6.1 Web UI
- `/index.html`: サーバー状態ヘッダー、ワンタップ没入カード、オフラインバナー、生成モード切替タブ。
- `/immersive.html`: ヒーローセクション（XR開始/戻る）、チュートリアルカード、WebGL キャンバス。
- UI コンポーネントは 18px Padding / 16px Radius のプライマリボタン、WCAG AA カラー、`clamp` によるレスポンシブ調整。

### 6.2 XR UI コンセプト
| コンポーネント | 役割 | 実装ポイント |
| --- | --- | --- |
| メインパネル | プロンプト入力 / サービス選択 / 実行 | WebXR Quad Layer or CSS3DRenderer、幅 1.2m × 高さ 0.7m。 |
| ステータスバッジ | 進行状況・結果通知 | SceneManager イベントを購読し色で状態表示。 |
| アセットギャラリー | 生成物サムネイルとドラッグ配置 | 1 列 3 枚、Raycaster でドラッグ。 |
| ログパネル | `chocodrop-dev.log` を抜粋表示 | エラー時は自動ポップ。 |
| コントローラヒント | 操作ガイド | 初回のみ提示し、以後はメニューから再表示。 |

### 6.3 レイアウト & インタラクション
- メインパネルを視線やや下 (Y=1.4m)、距離 1.5m に配置。ステータス/ギャラリーは左右下に浮かせる。
- テキスト入力は Quest ソフトキーボード、将来は音声入力も検討。
- ギャラリーからのドラッグ&ドロップで SceneManager が配置処理を実行。
- A/B ボタンで UI 表示切替、Grip で位置調整、エラー時はログパネルが前面に出る。

### 6.4 実装ステップ
1. `XRInterfaceManager`（仮）を `immersive-launcher.js` に追加。
2. WebXR Layer と CSS3DRenderer の両案を試作してパフォーマンス比較。
3. SceneManager の `onGenerateStart/Success/Error` を XR UI にブリッジ。
4. ギャラリーのドラッグ処理を Raycaster + attach/detach で実装。
5. OPFS から最新ログ 100 行を取得し XR に表示。

### 6.5 課題
- ブラウザごとの WebXR Layer 差異、DOM 依存 UI の脱却。
- ソフトキーボード UX と音声入力の比較検証。
- Raycaster の衝突レイヤー設計、多言語対応。

## 6.6 テスト手順（2025-01-15追加）

### 自動テスト
```bash
# XRシーンインポート統合テスト
npm run test:xr-import

# テスト内容:
# 1. GET /api/scenes - シーン一覧取得
# 2. POST /api/scenes/import - シーン登録
# 3. /immersive.html - UI表示確認
# 4. サムネイル表示切替ボタン動作確認
```

### 手動確認手順
1. **ブックマークレット実行**
   - Three.js公式サイトを開く: `https://threejs.org/examples/#webgl_animation_keyframes`
   - ブックマークレット実行: コンソールに `bookmarklet-code.js` を貼り付け
   - 「このシーンをPWAに登録」ボタンをクリック
   - 成功メッセージ（緑色）を確認

2. **POST先確認**
   - エンドポイント: `http://localhost:3011/api/scenes/import`
   - サーバーログで `✅ Scene imported successfully!` を確認
   - シーンID（例: `scene_1736943600000_abc123`）をログで確認

3. **immersive.html起動**
   ```bash
   cd /path/to/ChocoDrop
   npm run dev
   ```
   - ブラウザで `http://localhost:3011/immersive.html` を開く
   - ステータスバーでシーン数が増加していることを確認
   - シーン一覧に新規シーンとサムネイルが表示されることを確認（5秒以内）

4. **XRでの確認手順**
   - Quest 3でHTTPS URL（ngrok等）にアクセス
   - 「XR体験を開始する」をタップ
   - XR空間にサムネイルが円形配置されていることを確認
   - 「サムネイル表示切替」ボタンで表示/非表示を切り替え
   - シーン一覧から「読み込み」ボタンでシーンを切り替え

### 検証項目チェックリスト
- [ ] サーバーログに scene ID が出力される
- [ ] サムネイルが `public/imported-scenes/screenshots/` に保存される
- [ ] `configs.json` に新規シーンが追加される
- [ ] immersive.html のシーン一覧が自動更新される（5秒以内）
- [ ] ステータスバーのシーン数とサムネイル数が正しい
- [ ] XR空間でサムネイルが表示される
- [ ] サムネイル表示切替ボタンが機能する

## 7. 改善計画・ロードマップ
### 7.1 即時改善提案
1. XR セッション中はブラウザ UI を自動最小化し、ヘッドセット HUD を表示。
2. OPFS の `chocodrop-dev.log` を `/api/logs` 経由で取得し、ダッシュボードにログビューアを追加。
3. Service Worker `sync` イベントでオンライン復帰時にモデル一覧を自動更新。
4. Quest 3 用の共通クリーンプロファイルを配布し、セットアップ時間を短縮。
5. Playwright + WebXR モックで PWA インストール / オフライン / XR 開始の E2E テストを CI 化。

### 7.2 実行ロードマップ（2025-11-11 時点）
| 期間 | テーマ | タスク | 成果指標 |
| --- | --- | --- | --- |
| Nov 11–15 | PWA ベースライン | Lighthouse 監査、manifest lint、SW precache 拡張、GuardianPWA/Permissioner 導入 | Lighthouse ≥ 90、重大度 Medium 以下 |
| Nov 16–29 | Remote Scene Loader β | `configs.json` に `external/sandbox` 追加、SW proxy + COOP/COEP 検査、iframe sandbox + postMessage | GitHub Pages デモ 3 件を無改変で XR 手前まで動作 |
| Nov 30–Dec 13 | XR Bridge 自動化 | XRBridge Loader を bookmarklet/PWA で共有、Vision Pro/Quest/Desktop で入力モード自動切替 | Playwright + WebXR Emulator 成功率 ≥ 95% |
| Dec 14–Jan 10 | XR 中の生成 UX | SceneManager UI を XR パネル化、OPFS にシーン履歴保存、生成結果を XR 内に直接配置 | ユーザーテスト 5 名で「コード不要で XR まで行けた」評価 4/5 以上 |

### 7.3 今週のアクション
1. GuardianPWA チェックを CI に組み込み、manifest/SW を lint。
2. `bookmarklet-code.js` で現在 URL + カメラ情報を JSON POST し、PWA が受信できるようにする。
3. `src/pwa/routes/import.js`（新規）で POST を受け取り `configs.json` に追記。
4. `immersive.html` に sandboxed iframe を導入し、外部シーンを安全に読み込む。
5. `src/common/logger.js` を XR Bridge にも共有し、XR 起動率 / 失敗理由を OPFS とサーバーに記録。

#### 7.3.1 Bookmarklet → PWA JSON Payload & Mode

- **POST 先:** `POST https://<PWAホスト>/api/scenes`
- **共通フィールド:**
  - `sceneId`（bookmarklet が URL から生成）。
  - `url` / `title` / `documentTitle` / `tags` / `notes`。
  - `camera`: `{ position, target, fov }`（存在する場合のみ）。
  - `thumbnail`: `data:image/png;base64,...`（同一オリジン+非汚染キャンバス時のみ。取得不可の場合は `null`）。
  - `renderer`: `{ type, xrEnabled, size, pixelRatio, context }` で WebGLRenderer のメタ情報を通知。
  - `viewport`, `userAgent`, `captureSource`, `capturePath` で実行デバイスを記録。

```jsonc
POST /api/scenes
{
  "sceneId": "threejs-webgl-animation-keyframes-7b12e4af",
  "url": "https://threejs.org/examples/webgl_animation_keyframes.html",
  "title": "three.js webgl - animation - keyframes",
  "camera": {
    "position": [0, 1.6, 3.5],
    "target": [0, 1.4, 0],
    "fov": 55
  },
  "thumbnail": "data:image/png;base64,iVBORw0K...",
  "renderer": {
    "type": "WebGLRenderer",
    "xrEnabled": false,
    "size": { "width": 1920, "height": 1080 },
    "pixelRatio": 2,
    "context": { "antialias": true, "alpha": true }
  },
  "tags": ["bookmarklet", "threejs.org"],
  "notes": "Captured via bookmarklet at 2025-11-12T10:05:00.000Z"
}

HTTP/1.1 201 Created
{
  "ok": true,
  "scene": {
    "id": "threejs-webgl-animation-keyframes-7b12e4af",
    "path": "https://threejs.org/examples/webgl_animation_keyframes.html",
    "updatedAt": "2025-11-12T10:05:02.000Z"
  },
  "total": 5
}
```

- **mode 切替:** `bookmarklet-code.js` は `chocodrop:bookmarklet-mode`（`immersive` / `json`）を保持。`window.__setChocoDropMode('json')` または トーストの「送信モード切替」ボタンで変更可能。
  - `immersive`（デフォルト）: Bookmarklet 実行後に daemon へ接続し、SDK を読み込む。
  - `json`: ポップアップ不可の環境でも HTTP POST のみ実行し、レスポンスをコンソールへ表示。`daemon` がオフラインでも PWA 登録だけ先行できる。

### 7.4 KPI
| 指標 | 目標値 | データ源 |
| --- | --- | --- |
| PWA インストール率 / 7 日後再訪率 | > 35% / > 50% | SW install hook + IndexedDB |
| XR 起動率（URL 読み込みあたり） | > 40% | XRBridge telemetry |
| GitHub Pages 取り込み成功率 | > 90% | Remote Scene Loader 成功イベント |
| Security 回帰 | GuardianPWA / Permissioner 重大警告 0 件 | CI レポート |

### 7.5 リスクと対策
- **Service Worker のブラックボックス化**: GuardianPWA / Permissioner を CI に組み込み、manifest 変更時はレビュー必須。
- **WebXR 入力差異**: Vision Pro `transient-pointer` と Quest コントローラを抽象化し、XR Layer ベースの UI を採用。
- **URL 取込時のセキュリティ**: sandboxed iframe + COOP/COEP 検査、SW proxy に allowlist を設定し preflight 結果をログ化。
- **ユーザー教育コスト**: Bookmarklet に「PWA へ送る」導線を常設し、PWA 起動直後にオンボーディングモーダルを表示。

### 7.6 代替シナリオ
1. **ライトランチャー**: manifest 無しの WebXR SPA として配信し、Service Worker を外す。
2. **TWA / Quest Browser Bookmark**: 企業ネットワーク向けに TWA やブラウザショートカットだけを提供。
3. **生成特化ピボット**: XR 需要が弱い場合、PWA を生成・配信に特化させ、XR は bookmarklet オプションに降格。

## 8. 参考リンク & 付録
- `output/architecture-diagram.svg`: PWA/XR アーキテクチャ図。
- `output/pwa-test-flow.svg`: インストール〜オフライン再訪の検証フロー。
- `output/scene-import-tutorial.md`: 本書の 5 章詳細版。
- `output/settings-schema.md`: OPFS 拡張フィールド詳細。
- `output/xr-ui-prototype-notes.md`: XR UI 実装メモ全文。
- `output/environment-checklist.md`: 本書 3 章チェックリスト原文。
- `output/tech-validation-report.md`: 詳細な検証結果ログ。
- `output/improvement-proposals.md`: 改善提案原文。
- `output/ui-ux-design.md`: Web UI 設計原文。
- `output/conversation-summary.md`: 2025-10-31 議論ログ。
- `.worktrees/task-1762871596539-357b5a/output/pwa_xr_strategy_2025.html`: 2025-11-11 時点の戦略 HTML（本書 1・7 章に反映）。

### 参考文献
1. WebKit Blog "Introducing Natural Input for WebXR in Apple Vision Pro" (2024-03-19)
2. UploadVR "With visionOS 2, Safari On Apple Vision Pro Supports WebXR By Default" (2024-06-12)
3. IDC "AR & VR Headsets Market Insights" (2025-10-21)
4. WPFrank "Comprehensive Analysis of PWAs in E-commerce for 2025" (2025-04-01)
5. arXiv "GuardianPWA: Enhancing Security Throughout the Progressive Web App Installation Lifecycle" (2025-09-16)
6. arXiv "Demystifying Progressive Web Application Permission Systems" (2025-09-16)
7. arXiv "SPARE: Securing PWAs Against Unauthorized Replications" (2025-08-09)
8. The Gen Creative "How AI Empowers Creators: Best Image Generators of 2025" (2025-08-18)

---
本書は 2025-11-11 時点の統合版です。以降の更新は各元ドキュメントと同様に `docs/` 直下で管理してください。
