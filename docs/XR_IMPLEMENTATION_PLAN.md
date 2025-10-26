# ChocoDrop XR機能実装計画

## 📋 概要

このドキュメントは、ChocoDrop本体にXR（VR/AR）機能を統合するための段階的実装計画です。

## 🎯 実装準備完了

以下のファイルが作成され、実装準備が整いました：

### 調査・ドキュメント
- ✅ `docs/XR_RESEARCH_2025.html` - 2025年最新XR技術調査報告
- ✅ `docs/XR_IMPLEMENTATION_PLAN.md` - 本実装計画書

### デモ・プロトタイプ
- ✅ `examples/xr-demo/index.html` - 基本VR/ARデモ
- ✅ `examples/xr-demo/ar-demo.html` - 高度なAR機能デモ
- ✅ `examples/xr-demo/README.md` - セットアップと使用方法

## 🚀 実装フェーズ

### フェーズ1: 基本VR対応（最優先）

**目標**: ChocoDrop UIをVR空間で操作可能にする

**実装タスク**:
1. Three.jsシーン管理への WebXR 統合
   - `renderer.xr.enabled = true`
   - VRButton コンポーネントの追加

2. VRセッション管理
   - セッション開始/終了イベント処理
   - デスクトップ⇔VRモードの切り替え

3. コントローラー入力対応
   - XRControllerModelFactory 統合
   - トリガー、グリップ、スティック入力
   - レイキャスティングによるオブジェクト選択

4. VR用UI適応
   - WebXR Layers API での UI 表示
   - 3D空間でのUIパネル配置
   - 視線・コントローラーによるUI操作

**成果物**: Meta Quest 3でVR空間に3Dオブジェクトを配置できる

**推定期間**: 2週間

### フェーズ2: AR基礎機能（最優先）

**目標**: 現実空間に3Dオブジェクトを配置可能にする

**実装タスク**:
1. ARセッション対応
   - "immersive-ar"セッション要求
   - ARButton コンポーネントの追加
   - カラーパススルー有効化

2. ヒットテスト実装
   - Hit Test API 統合
   - 現実世界へのレイキャスト
   - 床・壁への配置ガイド（レティクル）

3. 平面検出
   - Plane Detection API 有効化
   - 検出された平面の視覚化
   - 平面上へのスナップ配置

4. 基本AR体験最適化
   - パフォーマンス調整（90fps維持）
   - AR用照明調整
   - オブジェクトスケール自動調整

**成果物**: Meta Quest 3で部屋の床やテーブルに3Dオブジェクトを配置できる

**推定期間**: 2週間

### フェーズ3: ハンドトラッキング（中優先）

**目標**: コントローラーなしで手だけで操作可能にする

**実装タスク**:
1. Hand Tracking API 統合
   - "hand-tracking"機能記述子の要求
   - XRHandModelFactory の統合
   - generic-hand モデルの表示

2. ジェスチャー認識
   - ピンチジェスチャー検出
   - グラブジェスチャー検出
   - ポインティング検出

3. ハンド入力によるUI操作
   - 手のレイキャスティング
   - ピンチでの選択・移動
   - 両手での拡大縮小・回転

4. ハンド/コントローラーの動的切り替え
   - 入力モードの自動検出
   - シームレスな切り替え

**成果物**: 手だけでオブジェクトを配置・操作できる

**推定期間**: 2-3週間

### フェーズ4: 高度なMR機能（中優先）

**目標**: より没入感のあるMR体験を提供

**実装タスク**:
1. Depth API 統合
   - 環境深度推定の有効化
   - 動的オクルージョンシェーダー
   - ハード/ソフトオクルージョンの選択

2. メッシュ検出
   - Mesh Detection API 有効化
   - 部屋全体の3Dメッシュ取得
   - メッシュへのオブジェクト配置

3. 空間アンカー
   - Anchors API 統合
   - 永続的アンカーのサポート
   - アンカー位置の保存・復元

4. Reality Accelerator Toolkit (RATK) 統合
   - RATK ライブラリのインストール
   - 平面・メッシュ管理の簡易化
   - Object3D への自動変換

**成果物**: 仮想オブジェクトが現実の物体に隠れ、セッションをまたいで位置を保持できる

**推定期間**: 3-4週間

### フェーズ5: AI統合とマルチユーザー（低優先）

**目標**: AIとマルチユーザーでXR体験を拡張

**実装タスク**:
1. 音声コマンドでのXR操作
   - VR/AR空間での音声認識
   - 音声でのオブジェクト生成指示
   - ハンズフリー操作

2. AI生成3DモデルのXRプレビュー
   - 生成中のリアルタイムプレビュー
   - VR/AR空間での即座配置
   - AI提案の空間配置最適化

3. マルチユーザーコラボレーション
   - WebRTC によるリアルタイム同期
   - 複数ユーザーの同時編集
   - アバター表示

4. 空間音響
   - Web Audio API 3D 音響
   - オブジェクトからの音源定位
   - 環境音響シミュレーション

**成果物**: 複数人が同じAR空間で協働し、音声でオブジェクトを生成できる

**推定期間**: 4-6週間

## 🛠️ 技術スタック

### コア依存関係

```json
{
  "dependencies": {
    "three": "^0.170.0"
  },
  "optionalDependencies": {
    "@reality-accelerator-toolkit/core": "latest"
  }
}
```

### 必要なWebXR機能

**必須**:
- `immersive-vr` - VRセッション
- `immersive-ar` - ARセッション
- `local` または `local-floor` リファレンス空間

**オプション（推奨）**:
- `hit-test` - 現実世界へのレイキャスト
- `plane-detection` - 平面検出
- `hand-tracking` - ハンドトラッキング
- `depth-sensing` - 環境深度推定
- `anchors` - 空間アンカー
- `dom-overlay` - UI オーバーレイ

## 📁 ファイル構造

実装後の予定構造：

```
chocodrop/
├── src/
│   ├── xr/
│   │   ├── XRManager.ts           # XRセッション管理
│   │   ├── VRController.ts        # VRコントローラー処理
│   │   ├── ARController.ts        # AR機能（ヒットテスト等）
│   │   ├── HandTracker.ts         # ハンドトラッキング
│   │   ├── DepthOcclusion.ts      # 深度オクルージョン
│   │   ├── PlaneDetector.ts       # 平面検出
│   │   ├── MeshDetector.ts        # メッシュ検出
│   │   └── AnchorManager.ts       # 空間アンカー管理
│   ├── ui/
│   │   └── XRUIAdapter.ts         # VR/AR用UIアダプター
│   └── core/
│       └── SceneManager.ts        # XR対応シーン管理（拡張）
├── examples/
│   ├── xr-demo/                   # XRデモ（既存）
│   └── xr-integration/            # ChocoDrop統合デモ（今後）
└── docs/
    ├── XR_RESEARCH_2025.html      # 調査報告書（既存）
    ├── XR_IMPLEMENTATION_PLAN.md  # 実装計画（本ファイル）
    └── XR_API_REFERENCE.md        # API リファレンス（今後）
```

## 🧪 テスト戦略

### 開発環境テスト

1. **Immersive Web Emulator** (Chrome拡張)
   - デスクトップでのVR/ARシミュレーション
   - 全Meta Questヘッドセット対応
   - 高速イテレーション開発

2. **WebXR API Emulator** (Firefox拡張)
   - クロスブラウザ検証
   - 基本機能テスト

### 実機テスト

1. **Meta Quest 3** (主要ターゲット)
   - 192.168.1.15 での接続
   - ローカルネットワーク経由
   - 全機能の動作確認

2. **Meta Quest 2** (サブターゲット)
   - 互換性確認
   - モノクロパススルーでの動作

3. **その他WebXR対応デバイス**
   - Magic Leap 2
   - HoloLens 2 (可能であれば)

## 📊 パフォーマンス目標

- **フレームレート**: 90fps以上（VR必須）
- **レイテンシ**: 20ms以下（モーション→フォトン）
- **初回ロード**: 3秒以内
- **セッション開始**: 2秒以内

## 🔒 セキュリティ・プライバシー

- ユーザー同意なしでのカメラ/センサーアクセス禁止
- WebXR権限リクエストの明示的表示
- 環境メッシュ/画像データのローカル処理のみ
- 外部送信なし（KAMUI Code連携時を除く）

## 🌐 ネットワーク設定

### 開発環境

**接続先**: `192.168.1.15`

**推奨サーバー起動コマンド**:

```bash
# ChocoDrop開発サーバー
npm run dev -- --host 192.168.1.15 --port 3011

# または独立HTTPサーバー
cd examples/xr-demo
python3 -m http.server 8080 --bind 192.168.1.15
```

**Meta Quest 3からのアクセス**:
- VR/AR基本デモ: `http://192.168.1.15:8080/`
- 高度なARデモ: `http://192.168.1.15:8080/ar-demo.html`
- ChocoDrop統合版: `http://192.168.1.15:3011/` （今後）

### 注意事項

- HTTPSが必要な機能もあるため、本番環境では証明書が必要
- ローカルネットワークでは`192.168.x.x`はHTTPで動作
- 複数チームが同じサーバーを使用する場合はポート番号で区別

## 📚 参考資料

### 公式ドキュメント
- [WebXR Device API Spec](https://www.w3.org/TR/webxr/)
- [Three.js WebXR Docs](https://threejs.org/docs/#manual/en/introduction/How-to-use-WebXR)
- [Meta WebXR Docs](https://developers.meta.com/horizon/documentation/web/webxr-mixed-reality/)
- [Reality Accelerator Toolkit](https://github.com/meta-quest/reality-accelerator-toolkit)

### 内部ドキュメント
- [XR調査報告書](./XR_RESEARCH_2025.html) - 2025年技術動向
- [XRデモREADME](../examples/xr-demo/README.md) - セットアップ方法

## ✅ 次のステップ

1. **フェーズ1の開始**: 基本VR対応の実装
2. **プロトタイプテスト**: Meta Quest 3での動作確認
3. **フィードバック収集**: UX改善点の洗い出し
4. **段階的展開**: フェーズ2→3→4の順で実装

---

**最終更新**: 2025年1月
**作成者**: ChocoDrop XR実装チーム
**ステータス**: 実装準備完了 ✅
