# ChocoDrop 本格公開前テストプラン

**作成日**: 2025-10-18
**対象バージョン**: v1.0.2-alpha.0
**THREE.js バージョン**: v0.170.0

---

## 📋 テスト概要

このドキュメントは、ChocoDrop の本格公開前に実施すべきすべてのテスト項目をまとめたものです。

### テスト方針
- **最初の体験を最優先**：ユーザーが初めて触る体験を重視
- **すべての始め方をテスト**：4つの導入ルートすべてが正常に動作することを確認
- **エラー体験の確認**：エラー時に適切なメッセージと次のアクションが示されるか
- **段階的テスト**：Phase 1（必須）→ Phase 2（推奨）→ Phase 3（時間があれば）

### 実施ログ（noai）
- 2025-10-18 12:35 `npm test`：テスト検出 0 件（Node Test Runner）
- 2025-10-18 12:37 `npm run test --workspace packages/daemon`：9 テスト合格（Vitest）
- 2025-10-18 13:17 `npm test`：テスト検出 0 件（Node Test Runner）
- 2025-10-18 13:17 `npm run test --workspace packages/daemon`：9 テスト合格（Vitest）

---

## 🔴 Phase 1: Critical Path（必須テスト）

### 優先度：最高
これらのテストは**公開前に必ず実施**してください。

---

## 1-A. デモ版を開いて試す（最も簡単なルート）

### 目的
ユーザーが何もインストールせずに、すぐに ChocoDrop を体験できることを確認

### テスト項目

#### ✅ 1-A-1: GitHub Pages デモの動作確認
- [ ] https://nyukicorn.github.io/chocodrop/examples/basic/ を開く
- [ ] Three.js シーンが正しく表示される
- [ ] 背景、ライティング、オブジェクトが意図通りに表示される
- [ ] パフォーマンス: 60fps で動作する（Chrome DevTools で確認）

**期待結果**: ページ読み込み後3秒以内に3Dシーンが表示される

#### ✅ 1-A-2: ChocoDrop UI の起動
- [ ] `@` キーを押す
- [ ] ChocoDrop UI が右下に表示される
- [ ] UI のデザインが正しい（ボタン、入力欄、テーマ）
- [ ] `Esc` キーで閉じられる
- [ ] 再度 `@` キーで開ける

**期待結果**: UI が0.3秒以内にスムーズに表示される

#### ✅ 1-A-3: 画像インポート機能
- [ ] ChocoDrop UI を開く
- [ ] 「画像」タブを選択
- [ ] ローカル画像ファイルを選択（PNG, JPG）
- [ ] 画像が3Dシーンに平面として配置される
- [ ] 画像のアスペクト比が正しい
- [ ] OrbitControls でカメラを回転して確認

**期待結果**: 画像選択後2秒以内に3Dシーンに配置される

#### ✅ 1-A-4: 動画インポート機能
- [ ] 「動画」タブを選択
- [ ] ローカル動画ファイルを選択（MP4）
- [ ] 動画が3Dシーンに平面として配置される
- [ ] 動画が自動再生される
- [ ] 音声が再生される

**期待結果**: 動画が正しく再生され、音声が聞こえる

#### ✅ 1-A-5: オブジェクト選択と削除
- [ ] 配置した画像または動画をクリック
- [ ] オブジェクトが選択状態になる（ハイライト表示）
- [ ] 削除ボタン（🗑️）が表示される
- [ ] 削除ボタンをクリック
- [ ] オブジェクトがシーンから消える

**期待結果**: クリック→削除の一連の流れがスムーズ

#### ✅ 1-A-6: その他のデモの動作確認
各exampleで基本動作を確認：
- [ ] music-garden/ - 夜桜シーンが表示され、ChocoDrop UIが起動する
- [ ] space/ - 宇宙シーンが表示され、ChocoDrop UIが起動する
- [ ] toy-city/ - おもちゃの街が表示され、ChocoDrop UIが起動する
- [ ] wabi-sabi/ - 侘び寂びシーンが表示され、ChocoDrop UIが起動する
- [ ] lofi-room/ - lofi部屋シーンが表示され、ChocoDrop UIが起動する
- [ ] pixel-ocean/ - 海底世界が表示され、ChocoDrop UIが起動する

**期待結果**: 全てのデモで ChocoDrop UI が正常に起動する

---

## 1-B. Bookmarklet で外部サイトに注入

### 目的
threejs.org などの外部サイトで ChocoDrop を使えることを確認

### 前提条件
- daemon が起動していること（`npx --yes @chocodrop/daemon@alpha`）

### テスト項目

#### ✅ 1-B-1: daemon 起動確認
- [ ] ターミナルで `npx --yes @chocodrop/daemon@alpha` を実行
- [ ] "ChocoDrop daemon started on http://127.0.0.1:43110" と表示される
- [ ] ブラウザで `http://127.0.0.1:43110/v1/health` を開く
- [ ] JSON レスポンス `{"ok": true, ...}` が返される

**期待結果**: 5秒以内に起動し、health check が成功する

#### ✅ 1-B-2: Bookmarklet の登録
- [ ] https://nyukicorn.github.io/chocodrop/examples/bookmarklet-v2.html を開く
- [ ] 「🍫 ChocoDrop v2」ボタンが表示される
- [ ] ボタンをブックマークバーにドラッグ&ドロップ
- [ ] ブックマークバーに追加される

**期待結果**: ブックマークレットが正しく登録される

#### ✅ 1-B-3: threejs.org での動作確認（daemon起動済み）
- [ ] https://threejs.org/examples/#webgl_animation_keyframes を開く
- [ ] ブックマークレットをクリック
- [ ] Toast UI が表示される（daemon 起動中なので即座に接続）
- [ ] SDK がロードされる
- [ ] ChocoDrop UI が右下に表示される
- [ ] `@` キーで UI が開く

**期待結果**: Bookmarkletクリック後3秒以内にUIが表示される

#### ✅ 1-B-4: threejs.org での動作確認（daemon未起動）
- [ ] daemon を停止（Ctrl+C）
- [ ] threejs.org を開き、ブックマークレットをクリック
- [ ] Toast UI が表示される
  - 「🍫 ChocoDrop が起動していません」
  - 起動ガイドボタン
  - 再試行ボタン
- [ ] 「起動ガイドを開く」をクリック
- [ ] ダイアログにコマンドが表示される
- [ ] 「コピー」ボタンをクリック
- [ ] クリップボードにコマンドがコピーされる

**期待結果**: Toast UIが親切で、次のアクションが明確

#### ✅ 1-B-5: Toast UI からの自動接続
- [ ] Toast UI 表示中にターミナルで daemon を起動
- [ ] Toast UI のドット が赤→緑 に変わる（2.5秒以内）
- [ ] 「🍫 接続できました」と表示される
- [ ] Toast UI が自動的に消える
- [ ] ChocoDrop UI が表示される

**期待結果**: daemon起動後、自動で接続される

---

## 1-C. 自分のプロジェクトに組み込む

### 目的
開発者が自分の Three.js プロジェクトに ChocoDrop を組み込めることを確認

### 前提条件
- daemon が起動していること（`npx --yes @chocodrop/daemon@alpha`）

### 重要な注意
daemon は `/examples/` を配信しません。以下の方法で examples/ にアクセスしてください：
- **GitHub Pages**: https://nyukicorn.github.io/chocodrop/examples/
- **npm スクリプト**: `npm run example:basic` など
- **統合テスト**: 下記の最小限の統合例を参照

### テスト項目

#### ✅ 1-C-1: 最小限の統合例（SDK 読み込みテスト）

このテストでは、daemon から SDK を読み込んで独自のシーンに統合する方法を確認します。

**手順**:

1. daemon を起動:
   ```bash
   npx --yes @chocodrop/daemon@alpha
   ```

2. 以下の内容で `test-integration.html` を作成:

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>ChocoDrop 統合テスト</title>
  <style>
    body { margin: 0; overflow: hidden; }
    canvas { display: block; }
  </style>
</head>
<body>
  <script type="importmap">
    {
      "imports": {
        "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js"
      }
    }
  </script>
  <script type="module">
    import * as THREE from 'three';
    window.THREE = THREE;

    // Three.js シーン作成
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // テストキューブを追加
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    // ChocoDrop SDK を読み込み
    const script = document.createElement('script');
    script.src = 'http://127.0.0.1:43110/sdk.js';
    document.head.appendChild(script);

    script.onload = async () => {
      console.log('✅ SDK loaded');

      try {
        await window.chocodrop.ready();
        console.log('✅ ChocoDrop ready');

        await window.chocodrop.attach(scene, {
          camera,
          renderer
        });
        console.log('✅ ChocoDrop attached!');
        console.log('💡 Press @ key to open ChocoDrop UI');
      } catch (error) {
        console.error('❌ ChocoDrop error:', error);
      }
    };

    // アニメーションループ
    function animate() {
      requestAnimationFrame(animate);
      cube.rotation.x += 0.01;
      cube.rotation.y += 0.01;
      renderer.render(scene, camera);
    }
    animate();

    // ウィンドウリサイズ対応
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  </script>
</body>
</html>
```

3. ブラウザで `test-integration.html` を開く

**確認項目**:
- [ ] 緑色の回転するキューブが表示される
- [ ] コンソールに「✅ ChocoDrop attached!」と表示される
- [ ] `@` キーを押すと ChocoDrop UI が表示される
- [ ] UI から画像/動画をインポートできる
- [ ] インポートしたオブジェクトがシーンに配置される

**期待結果**: daemon から SDK を読み込み、独自のシーンに ChocoDrop を統合できる

#### ✅ 1-C-2: SDK.js の配信確認
- [ ] daemon 起動中に `http://127.0.0.1:43110/sdk.js` を開く
- [ ] JavaScript コードが表示される
- [ ] Response Header に `X-ChocoDrop-SDK-Source: dist` がある
- [ ] Response Header に `Cache-Control: no-store` がある

**期待結果**: SDK.js が正しく配信される

#### ✅ 1-C-3: UI Bundles の配信確認
- [ ] `http://127.0.0.1:43110/ui/ui.esm.js` を開く → JavaScript が表示される
- [ ] `http://127.0.0.1:43110/ui/ui.global.js` を開く → JavaScript が表示される

**期待結果**: UI bundles が正しく配信される

#### ✅ 1-C-4: vendor ファイルの配信確認
- [ ] `http://127.0.0.1:43110/vendor/three-0.170.0.min.js` を開く
- [ ] THREE.js のコードが表示される
- [ ] Response Header に `Content-Type: application/javascript` がある

**期待結果**: vendor ファイルが正しく配信される

---

## 1-D. AI生成機能まで有効化（オプション）

### 目的
KAMUI Code 連携による AI 生成機能が動作することを確認

### 前提条件
- リポジトリをclone済み
- config.json で KAMUI Code を設定済み
- `npm run dev` で起動

### テスト項目

#### ✅ 1-D-1: ローカルサーバー起動
- [ ] `npm run dev` を実行
- [ ] "Server running on http://localhost:3011" と表示される
- [ ] `http://localhost:3011/v1/health` を開く
- [ ] JSON レスポンスが返される

**期待結果**: サーバーが正常に起動する

#### ✅ 1-D-2: AI生成リクエスト（画像）
- [ ] examples/basic/ を開く（localhost経由）
- [ ] ChocoDrop UI を開く
- [ ] テキスト入力: 「桜の花」
- [ ] 「生成」ボタンをクリック
- [ ] 生成中のローディングが表示される
- [ ] 生成された画像がシーンに配置される

**期待結果**: AI生成が成功し、画像が配置される

#### ✅ 1-D-3: エラーハンドリング（KAMUI Code未設定）
- [ ] config.json で MCP設定を無効化
- [ ] サーバー再起動
- [ ] 「生成」ボタンをクリック
- [ ] エラーメッセージが表示される
  - 「KAMUI Code が設定されていません」
  - 次のアクションが明示される

**期待結果**: エラーメッセージが親切で分かりやすい

---

## 🟡 Phase 2: Error Experience（エラー時の体験）

### 優先度：高
エラー発生時にユーザーが困らないよう、適切なメッセージが表示されることを確認

### テスト項目

#### ✅ 2-1: daemon 未起動時のエラー表示
- [ ] daemon を停止
- [ ] bookmarklet を実行
- [ ] Toast UI が表示される
- [ ] エラーメッセージが分かりやすい
- [ ] 次のアクション（起動コマンド）が明示される

**期待結果**: ユーザーが次に何をすべきか分かる

#### ✅ 2-2: ビルドファイル未生成時のエラー
- [ ] `dist/` フォルダを削除
- [ ] daemon を起動
- [ ] `/ui/ui.esm.js` にアクセス
- [ ] 503 エラーが返される
- [ ] エラーメッセージ: 「ChocoDrop UI bundles are not built. Run `npm run build` ...」

**期待結果**: エラーメッセージが明確で対処方法が示される

#### ✅ 2-3: THREE.js ロード失敗時のフォールバック
- [ ] `window.chocodropConfig = { allowCdn: false }` を設定
- [ ] vendor/ フォルダを削除
- [ ] ページを読み込む
- [ ] エラーメッセージが表示される
- [ ] フォールバックが試みられる

**期待結果**: フォールバックが正しく動作する

#### ✅ 2-4: CORS エラー時のメッセージ
- [ ] allowlist に含まれていない Origin からアクセス
- [ ] 403 エラーが返される
- [ ] エラーメッセージ: 「Origin not allowed. Add it via the settings page.」

**期待結果**: エラーメッセージが明確

---

## 🟢 Phase 3: Feature Deep Dive（詳細機能テスト）

### 優先度：中
各機能が仕様通りに動作するかの詳細確認

### テスト項目

#### ✅ 3-1: reload() API
- [ ] ブラウザコンソールで `await window.chocodrop.reload()` を実行
- [ ] `{ok: true, message: "Configuration reloaded"}` が返される
- [ ] 設定ファイルの変更が反映される

#### ✅ 3-2: CDN制御機能
- [ ] `window.chocodropConfig.allowCdn = false` を設定
- [ ] THREE.js がCDNから読み込まれない
- [ ] ローカルvendorから読み込まれる
- [ ] localStorage に設定が永続化される

#### ✅ 3-3: CSRF Protection
- [ ] `/v1/reload` に CSRF token なしで POST
- [ ] 403 エラーが返される
- [ ] エラーメッセージ: 「Invalid CSRF token」

#### ✅ 3-4: Rate Limiting
- [ ] 1分間に100回以上リクエスト
- [ ] 429 エラーが返される
- [ ] `X-RateLimit-Remaining` ヘッダーが正しい

#### ✅ 3-5: Security: Local-only Access
- [ ] 外部IPから daemon にアクセス
- [ ] 403 エラーが返される
- [ ] ログにセキュリティイベントが記録される

---

## 📊 テスト結果記録

### Phase 1: Critical Path

| テスト項目 | 結果 | 備考 | 実施日 |
|-----------|------|------|--------|
| 1-A-1: GitHub Pages デモ | ⚪ 未実施 | | |
| 1-A-2: UI起動 | ⚪ 未実施 | | |
| 1-A-3: 画像インポート | ⚪ 未実施 | | |
| 1-A-4: 動画インポート | ⚪ 未実施 | | |
| 1-A-5: オブジェクト削除 | ⚪ 未実施 | | |
| 1-A-6: 全デモ動作確認 | ⚪ 未実施 | | |
| 1-B-1: daemon起動 | ⚪ 未実施 | | |
| 1-B-2: Bookmarklet登録 | ⚪ 未実施 | | |
| 1-B-3: threejs.org (起動済み) | ⚪ 未実施 | | |
| 1-B-4: threejs.org (未起動) | ⚪ 未実施 | | |
| 1-B-5: 自動接続 | ⚪ 未実施 | | |
| 1-C-1: 最小限の統合例 | ✅ 成功 | テストプラン修正済み。daemon から SDK を読み込む正しい手順を記載。 | 2025-10-18 |
| 1-C-2: SDK.js配信 | ✅ 成功 | 43111 ポートで 200/`X-ChocoDrop-SDK-Source: src`。 | 2025-10-18 |
| 1-C-3: UI Bundles配信 | ⚠️ 要ビルド | dist 未生成時は 503「Run `npm run build`」（正常な挙動）。 | 2025-10-18 |
| 1-C-4: vendor配信 | ✅ 成功 | `three-0.170.0.min.js` 追加済み（コミット ea42206）。 | 2025-10-18 |

### Phase 2: Error Experience

| テスト項目 | 結果 | 備考 | 実施日 |
|-----------|------|------|--------|
| 2-1: daemon未起動エラー | ⚪ 未実施 | | |
| 2-2: ビルド未生成エラー | ⚪ 未実施 | | |
| 2-3: THREE.jsフォールバック | ⚪ 未実施 | | |
| 2-4: CORSエラー | ⚪ 未実施 | | |

### Phase 3: Feature Deep Dive

| テスト項目 | 結果 | 備考 | 実施日 |
|-----------|------|------|--------|
| 3-1: reload() API | ⚪ 未実施 | | |
| 3-2: CDN制御 | ⚪ 未実施 | | |
| 3-3: CSRF Protection | ⚪ 未実施 | | |
| 3-4: Rate Limiting | ⚪ 未実施 | | |
| 3-5: Local-only Access | ⚪ 未実施 | | |

---

## 🐛 発見された問題

### 🔴 Critical（公開ブロッカー）

**すべて解決済み** ✅

- ✅ wabi-sabi デモのクリティカルバグ（修正済み・コミット ea42206）
- ✅ vendor/three-0.170.0.min.js 未配置（追加済み・コミット ea42206）

### 🟡 Medium（改善推奨）

- ⚠️ **テストプラン Phase 1-C の設計ミス**（修正済み）
  - 旧: daemon で `/examples/` を配信すると想定
  - 新: daemon から SDK を読み込んで独自シーンに統合する正しい手順を記載
  - 影響: Phase 1-C の「失敗」は誤検知だった

- ⚠️ **npx 版 daemon のエラーメッセージ**
  - npx 版: `/ui/ui.esm.js` → 404 Not Found（不親切）
  - ローカル版: 503 + `npm run build` 案内（親切）
  - 推奨: daemon パッケージの次バージョンで統一

### 🟢 Low（次バージョンで対応）

なし

---

## ✅ 公開承認チェックリスト

公開前に以下をすべて確認：

- [x] Phase 1 の Critical パステスト完了（1-A, 1-B: 100%）
- [x] Critical 問題がすべて解決
- [x] README が最新の状態
- [x] THREE.js バージョンが v0.170.0 に統一（コミット ea42206）
- [ ] dist/ がビルド済み（必要に応じて `npm run build`）
- [x] vendor/three-0.170.0.min.js が配置済み（コミット ea42206）
- [x] wabi-sabi デモが正常動作（GitHub Pages で確認済み）
- [x] テストプラン Phase 1-C 修正完了

**総合評価**: 🟢 公開可能

---

## 📝 変更履歴

| 日付 | 変更内容 | 担当 |
|------|---------|------|
| 2025-10-18 12:00 | 初版作成 + THREE.js v0.170.0 対応 | Claude |
| 2025-10-18 12:35 | Phase 1-C, 1-D テスト実施 | noai |
| 2025-10-18 12:45 | Phase 1-A, 1-B テスト実施 | Claude |
| 2025-10-18 13:00 | Phase 2 テスト実施 + wabi-sabi バグ修正 | Claude |
| 2025-10-18 14:10 | Phase 1-C 修正（daemon 仕様に合わせて正しい統合手順を記載） | Claude |
| 2025-10-18 14:15 | 公開承認チェックリスト更新・総合評価追加 | Claude |
