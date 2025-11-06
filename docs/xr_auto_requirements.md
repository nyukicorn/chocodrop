# ChocoDrop XR 自動化 要件定義書（2025年11月改訂版）

本書は ChocoDrop 既存機能（画像・動画挿入、SceneManager によるシーン統合、ブックマークレット注入など）を維持したまま、ユーザーの Three.js シーンを **追加コードなしで XR（VR/AR）対応** させるための要件をまとめた最新版です。実装チームが直ちに着手できるよう、成功条件・失敗時挙動・検証基準まで具体化しています。

---

## 1. 背景と目的
- ChocoDrop は自然言語コマンドで Three.js シーンへ画像・動画・音声・GLTF モデル等を追加し、SceneManager が生成オブジェクトとインポート資産を統合管理している。
- 既存の UI／ブックマークレットを通じ、ユーザーコードを変更せずに機能を注入できる点が強みであり、XR 化でもこの体験を破壊しないことが必須である。
- 2025 年以降、Vision Pro・Meta Quest 3 など WebXR 対応デバイスが増え、GitHub Pages などで公開された Three.js シーンを即座に XR 化したい要望が高まっている。

## 2. 現行機能（保持必須）
| 区分 | 内容 | 備考 |
| --- | --- | --- |
| オブジェクト生成 | 画像生成・読み込み、動画、音声、GLTF/FBX 等を自然言語で追加。SceneManager が `registerSpawnedObject` で管理。 | 画像・音声 UI、トーンマッピング設定を含め後方互換を維持する。 |
| 入力手段 | ブラウザ UI、ブックマークレットによる注入。 | ゼロコード要件の基盤。 |
| Daemon / SDK | `@chocodrop/daemon` が UI/SDK を配信しローカルシーンへ attach。 | XR 化でも再利用。 |
| PWA 構成 | `src/pwa`、`service_worker.js` などでオフライン対応を進行中。 | XR モードでもキャッシュ・通知戦略を統合。 |

## 3. 想定ユースケース
1. **ローカル開発中のシーンを XR で検証**：開発者がブックマークレットを実行すると XR ボタンが表示され、既存シーンをそのまま VR/AR で体験できる。
2. **PWA/Web アプリ経由での XR 体験**：ChocoDrop PWA に URL を入力すると、PC・スマートフォン・ヘッドセットで一貫した UI から XR モードを起動できる。
3. **GitHub Pages 等の公開シーンを安全に XR 化**：一般ユーザーが URL を貼り付けるだけで、サンドボックスされた XR ビューアが起動し、画像・動画挿入機能も利用できる。

## 4. 開発ゴール
1. ユーザーコードへ一切の変更を求めず、`renderer.xr` 有効化から XR セッション開始までを自動化する。
2. PWA／Web アプリでも同等の UX を提供し、オフライン時のフォールバックを含む。
3. GitHub Pages 等リモートホストを安全に読み込み、CORS エラー時の代替導線を提示する。
4. **初期リリース対象ブラウザをデスクトップ版 Google Chrome と Meta Quest Browser（Chromium ベース）に限定し、最低 60 fps（VR）/ 45 fps（AR）を維持する。**

## 5. アーキテクチャ概要
| レイヤ | 主体 | 役割 |
| --- | --- | --- |
| XR ブリッジ層 | `XRBridge Loader`（新規） | `THREE` グローバル検出、`renderer.xr` 初期化、既存レンダーループの安全なラップ。 |
| 既存コア | `SceneManager`, `LiveCommandClient` | 生成オブジェクト管理・履歴記録・UI を継続活用し XR 状態でも操作性を保証。 |
| XR 基盤 | WebXR API, WebXR Layers, DOM Overlay | デバイス別の XR 機能を統合。Vision OS Safari の WebXR 対応や DOM Overlay を考慮。[^visionos-webxr][^webxr-layers] |
| PWA 層 | Service Worker, App Shell | XR 用リソースのプリロード、オフライン検証、更新制御。 |
| URL Gateway | `RemoteScene Loader`（新規） | リモートページを `<iframe sandbox>` または Service Worker Proxy 経由で読み込み、CORS・COOP/COEP を満たす。 |
| 運用基盤 | テレメトリ＆ロギング | `sessiongranted` イベントやデバイス情報を記録し、再接続 UX を最適化。[^needle-session] |

## 6. 機能要件

### 6.1 XR ブリッジ機能
- `XRBridge Loader` は以下を自動で実行すること：
  - `window.THREE` または ES Module import から `THREE.WebGLRenderer` を検出し、`renderer.xr.enabled = true` を設定。
  - 既存の `requestAnimationFrame` ループを `renderer.setAnimationLoop` に差し替える際、元の update 処理をフックして二重呼び出しを防ぐ。
  - `sessiongranted` をハンドリングし、ユーザーが一度許可したデバイスでは自動再接続を許容する。[^needle-session]
- 失敗時は UI トーストでモードごとのエラー理由（`navigator.xr` 未対応、権限拒否等）を表示し、2D 表示へフォールバックする。
- ブリッジ処理が例外を投げた場合は即座にパッチを解除し、`renderer` を元の実装に戻して副作用を残さない。
- ユーザーが意図せず XR セッションへ入らないよう、明示的な UI 操作（ボタン）を経ない限り `requestSession` を呼び出さない。

### 6.2 入力・操作
- VR モード：XR コントローラ／ハンドトラッキングイベント（`selectstart/end`、`squeeze`）を SceneManager のオブジェクト操作 API にバインドする。
- AR モード：`hit-test` で得られたアンカーを既存の配置ロジックへ引き渡し、生成コンテンツのスケール補正（`defaultObjectScale`）を適用する。
- DOM Overlay を使用して Command UI・履歴・音声コントロールを XR 空間に重畳する。[^webxr-layers]

### 6.3 RemoteScene Loader（リモート URL 対応）
- 入力 URL に対する処理フロー：
  1. HTTPS・拡張子・`Content-Type` を検証し、Three.js シーンである可能性を判定。
  2. 同一オリジンで読み込めない場合は Service Worker Proxy でリライティングを行い、`Access-Control-Allow-Origin` を付与する。
  3. `<iframe>` に `allow="xr-spatial-tracking; vr"`, `referrerpolicy="no-referrer"`, `sandbox="allow-scripts allow-same-origin"` を設定し、COOP/COEP 無しで動作しない場合はプロキシ経由を強制する。
- CORS 失敗時の UX：
  - UI に「オリジン制限のため直接読み込めません。ローカルに保存して読み込む／プロキシ経由で再試行する」など 3 パターンの選択肢を表示。
  - 失敗ログを収集し、今後の許可リストに追加すべきドメインを解析する。
- セキュリティ：未知のスクリプトが親フレームへアクセスしないよう `postMessage` で許可されたメッセージのみ受理する。
- プロキシが HTML／JS を書き換える場合は改ざん検出用にハッシュを付与し、ログへ残す。
- 共有プロキシを運用する場合は API キーやレート制限を設け、第三者による悪用を防ぐ。

### 6.4 PWA／Web アプリ要件
- `manifest.json` に以下を追加：`display": "standalone"`, `display_override`: `"fullscreen"`, `categories`: `["productivity","xr"]`, `orientation`: `"landscape"`。
- Service Worker は XR 用バンドル（`xr-bridge.js`、`xr-ui.css` 等）とユーザーシーンキャッシュを別々のキャッシュバケットで管理し、更新失敗時は前バージョンへロールバックする。
- Meta Quest / Chrome / Safari (Vision OS) の各ブラウザで以下の自動テストを実施する：
  - Lighthouse PWA スコア 90 以上。
  - Playwright + WebXR Emulator で VR/AR 起動、フォールバック、キャッシュ更新の 4 シナリオを自動化。
- インストール済み PWA がバックグラウンドへ移行した場合は XR セッションを終了し、復帰時に再接続ダイアログを提示する。

### 6.5 追加価値機能
- `WebXR Layers` による 2D HUD 描画と 3D オブジェクト描画を分離し、省電力と視認性を両立する。[^webxr-layers]
- シーン履歴を IndexedDB に保存し、最近開いた URL を PWA 起動時にサジェストする。
- テレメトリ：XR セッション時間・エラー率・コマンド成功率を送信し、ユーザー行動を分析。

## 7. 非機能要件
- **パフォーマンス**：
  - VR モードで 60 fps、AR モードで 45 fps を最低ラインとし、閾値を下回った場合は UI で警告と軽量化オプション（テクスチャ解像度、ポリゴン削減）を提示する。
  - 初回 XR 起動まで 5 秒以内、RemoteScene Loader でのシーン描画開始まで 8 秒以内を目標とする。
- **セキュリティ**：
  - GitHub Pages 等のリモート読み込みでは COOP/COEP（`same-origin`）を推奨し、設定されていない場合は Service Worker Proxy を利用する。
  - `postMessage` で `origin` を検証し、許可ドメイン以外からのコマンドは破棄する。
- **信頼性**：
  - XR セッションが強制終了された際、2D モードに自動復帰し SceneManager の状態を保持する。
  - CORS／ネットワークエラー時は再試行・ローカルダウンロード・サポート窓口の 3 導線を表示。
- **ブラウザ対象**：初期サポートはデスクトップ版 Google Chrome と Meta Quest Browser に限定し、その他ブラウザは運用実績を踏まえて順次追加する。

## 8. テスト計画と受け入れ基準
| カテゴリ | 内容 | 受け入れ基準 |
| --- | --- | --- |
| ユニットテスト | XRBridge, RemoteScene Loader, Service Worker の各モジュール | 主要分岐網羅率 80% 以上、CORS 失敗時のフォールバックを自動検証 |
| E2E テスト | Playwright + WebXR Emulator で VR/AR 起動、フォールバック、PWA 更新、URL 取り込み | 主要シナリオ 4 件すべて成功、タイムアウト 5 秒以内 |
| デバイステスト | Google Chrome（Windows/macOS デスクトップ）、Meta Quest Browser | FPS と入力レスポンスを測定し、閾値内に収まること |
| PWA 品質 | Lighthouse（Chrome デスクトップ）、Meta Quest Review Checklist | Lighthouse PWA スコア 90 以上、Meta Quest チェック項目で NG 無し |

### 8.1 セキュリティ検証
- WebXR セッション権限：初回許可ダイアログが必ず表示されること、`sessiongranted` 自動復帰の ON/OFF を UI から切り替えられること。
- ブリッジ解除試験：`renderer` パッチ後に例外を発生させ、原状回復と 2D フォールバックが正常に動作することを確認。
- プロキシ経由ロード：COOP/COEP 未設定ページの読み込み時にプロキシが必須となり、ハッシュ検証とアクセス制限が機能していること。
- `postMessage` フィルタリング：許可ドメイン以外からのメッセージが破棄されることを自動テストで確認。

### 8.2 プライバシーとログ
- 収集するテレメトリ（セッション時間、エラー率など）を一覧化し、デフォルトで匿名化・ユーザー同意 UI を用意する。
- ログアップロード失敗時はローカル保存に切り替え、利用者に通知する。

## 9. KPI とモニタリング
- XR 起動率：XR セッション数 / シーン読み込み数（週次で 40% 以上を目標）。
- 平均 XR 滞在時間：10 分以上を目標とし、短期離脱時はフィードバックフォームを表示。
- Remote URL 成功率：CORS・COOP/COEP 要因を除き 95% 以上。
- PWA 再訪率：インストール済みユーザーの月次再訪を 50% 以上に維持。
- セキュリティ監視：CORS 失敗・プロキシ拒否・postMessage 拒否などのイベントを集計し、月次で 0.5% 未満を目標とする。

## 10. マイルストーン
| フェーズ | 期間 | 成果物 |
| --- | --- | --- |
| M1: 基盤整備 | 2025-11-10〜2025-12-06 | XRBridge Loader PoC、Three.js r175 互換確認、ユニットテスト基盤 |
| M2: PWA 統合 | 2025-12-07〜2026-01-15 | manifest/service worker 改修、Playwright 自動テスト、Lighthouse クリア |
| M3: GitHub Pages 対応 | 2026-01-16〜2026-02-20 | RemoteScene Loader β、CORS プロキシ、COOP/COEP チェックリスト |
| M4: ベータ公開 | 2026-02-21〜2026-03-31 | デバイステストレポート、KPI ダッシュボード、フィードバック収集プロセス |

## 11. リスクと対策
| リスク | 内容 | 対策 |
| --- | --- | --- |
| ブラウザ差異 | WebXR 実装差異でセッション開始に失敗 | 互換リスト提示、`navigator.xr.isSessionSupported` による事前チェック |
| CORS 制限 | 外部ドメインがヘッダーを許可しない | Service Worker Proxy とローカル保存導線、ユーザー向けガイド提供 |
| パフォーマンス劣化 | 重量級アセットで FPS が低下 | 自動プロファイル計測と画質プリセット切り替え |
| ユーザー誤認 | 未対応ブラウザで XR ボタンが表示される | 検出結果に応じた UI 切り替え、サポートリンク表示 |

## 12. 参考資料
- Vision Pro Safari WebXR 対応報道[^visionos-webxr]
- WebXR Layers モジュール ドラフト[^webxr-layers]
- Needle Engine WebXR `sessiongranted` の活用[^needle-session]
- three.js r175 Release Notes（WebXRManager 改良）[^threejs-r175]

---

[^visionos-webxr]: 9to5Mac, “visionOS 2 makes Apple Vision Pro a true spatial browser with full WebXR support,” 2024-09-10. https://9to5mac.com/2024/09/10/visionos-2-webxr-safari
[^webxr-layers]: W3C Immersive Web Working Group, “WebXR Layers module progress update,” 2025-10-21. https://lists.w3.org/Archives/Public/public-immersive-web-wg/2025Oct/0016.html
[^needle-session]: Needle Engine Documentation, “Working with WebXR,” 2025-06-12. https://docs.needle.tools/learn/webxr/webxr-overview/
[^threejs-r175]: three.js, “r175 Release Notes,” 2025-05-27. https://threejs.org/blog/r175
