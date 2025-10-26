# ChocoDrop XR Demo

Meta Quest 3向けWebXR（VR/AR）デモアプリケーション

## 📋 概要

このデモは、ChocoDrop本体にXR機能を統合する前のプロトタイプとして作成されました。Three.js r170とWebXR APIを使用して、Meta Quest 3でVR/AR体験を提供します。

## 🚀 セットアップ

### 前提条件

- Node.js 16以上
- Meta Quest 3（推奨）またはWebXR対応ブラウザ
- ローカルネットワーク接続（192.168.1.15での接続を想定）

### 起動方法

#### 方法1: 簡易HTTPサーバー（推奨）

```bash
# プロジェクトルートから
cd examples/xr-demo

# Python 3の場合
python3 -m http.server 8080 --bind 192.168.1.15

# または Node.jsのhttp-serverを使用
npx http-server -p 8080 -a 192.168.1.15
```

その後、Meta Quest 3のブラウザで以下にアクセス：
```
# 基本デモ
http://192.168.1.15:8080/

# AR高度機能デモ
http://192.168.1.15:8080/ar-demo.html

# ChocoDrop統合デモ（推奨）
http://192.168.1.15:8080/chocodrop-demo.html
```

#### 方法2: ChocoDrop開発サーバーから

```bash
# プロジェクトルートから
npm run dev

# 別のポートで起動している場合は調整してください
```

Meta Quest 3のブラウザで以下にアクセス：
```
http://192.168.1.15:3011/examples/xr-demo/
```

## 🎮 使い方

### デスクトップブラウザ

1. Chrome/Edgeで`index.html`を開く
2. 3Dシーンが表示される
3. VR/ARボタンが表示されない場合は、WebXR対応デバイスが必要

### Meta Quest 3

1. Meta Quest 3のブラウザで上記URLにアクセス
2. **VR起動**ボタンをタップ → 完全なVR体験
3. **AR起動**ボタンをタップ → カラーパススルーAR体験

### 操作方法

#### VRモード
- **コントローラーのトリガー** - オブジェクトを選択
- **選択中にトリガーホールド** - オブジェクトを移動
- **トリガーリリース** - オブジェクトを配置

#### ARモード
- VRモードと同じ操作
- 現実の部屋を見ながら仮想オブジェクトを配置できます

## 🔧 技術仕様

### 使用技術

- **Three.js r170** - 3Dレンダリングエンジン
- **WebXR Device API** - VR/AR対応
- **VRButton / ARButton** - Three.js WebXRヘルパー
- **XRControllerModelFactory** - コントローラー視覚化

### 対応機能

- ✅ 基本VRセッション（immersive-vr）
- ✅ 基本ARセッション（immersive-ar）
- ✅ コントローラー入力
- ✅ オブジェクト選択・移動
- ✅ カラーパススルー（Meta Quest 3）
- ⚠️ 平面検出（オプション機能として要求）
- ⚠️ ハンドトラッキング（未実装）
- ⚠️ Depth API（未実装）

### 未対応（今後の実装予定）

- ❌ ヒットテスト（現実世界へのレイキャスト）
- ❌ 平面検出の視覚化
- ❌ メッシュ検出
- ❌ 空間アンカー（永続化）
- ❌ ハンドトラッキング
- ❌ 動的オクルージョン

## 📁 ファイル構成

```
examples/xr-demo/
├── index.html          # 基本XRデモ（プロトタイプ）
├── ar-demo.html        # AR高度機能デモ（ヒットテスト、平面検出）
├── chocodrop-demo.html # ✨ ChocoDrop統合デモ（本格実装）
└── README.md           # このファイル
```

### 各デモの違い

**index.html** - 基本プロトタイプ
- Three.jsの基本的なWebXR実装
- VRButton/ARButtonの動作確認
- コントローラー入力のテスト

**ar-demo.html** - AR高度機能
- ヒットテスト実装
- 平面検出と視覚化
- レティクル（配置ガイド）

**chocodrop-demo.html** - ChocoDrop統合 🎯
- SceneManager統合
- XRManager/VRController/ARController使用
- オブジェクト追加UIコントロール
- 完全なVR/AR体験
- **Meta Quest 3での本格テストに推奨**

## 🐛 トラブルシューティング

### VR/ARボタンが表示されない

**原因**: WebXRに対応していないブラウザまたはデバイス

**解決策**:
- Meta Quest 3のネイティブブラウザを使用
- Chrome/Edgeを使用（デスクトップでは開発者モードでシミュレート可能）

### "接続できません"エラー

**原因**: ネットワーク設定またはHTTPS要件

**解決策**:
1. Meta Quest 3と開発PCが同じWi-Fiネットワークに接続されているか確認
2. 192.168.1.15のIPアドレスが正しいか確認（`ifconfig`または`ipconfig`で確認）
3. ファイアウォールが8080ポートをブロックしていないか確認

### ARモードでパススルーが表示されない

**原因**: ARセッションの権限または機能が有効になっていない

**解決策**:
- Meta Quest 3のシステム設定で、ブラウザに必要な権限が付与されているか確認
- `immersive-ar`セッション要求時の`requiredFeatures`を確認

### オブジェクトが選択できない

**原因**: コントローラーのレイキャストが機能していない

**解決策**:
- コントローラーが正しく認識されているか確認（白い線が表示されるはず）
- ブラウザのコンソールでエラーを確認

## 🔗 関連リンク

- [調査報告書](../../docs/XR_RESEARCH_2025.html) - 2025年最新XR技術調査
- [Three.js WebXR Examples](https://threejs.org/examples/?q=webxr)
- [WebXR Device API Spec](https://www.w3.org/TR/webxr/)
- [Meta Quest Developer Hub](https://developers.meta.com/horizon/)

## 📝 次のステップ

このデモが正常に動作したら、以下の高度な機能を実装していきます：

1. **ヒットテスト** - 現実の床やテーブルにオブジェクトを配置
2. **平面検出** - 壁、床、テーブルの自動検出
3. **ハンドトラッキング** - コントローラー不要の操作
4. **Depth API** - 仮想オブジェクトが現実の物体に隠れる
5. **空間アンカー** - 配置したオブジェクトの位置を保存

これらの機能を段階的に`ar-demo.html`に実装し、最終的にChocoDrop本体に統合します。

## 🤝 貢献

このデモに関するフィードバックや改善提案は、GitHubのIssueまたはPull Requestでお願いします。

## 📄 ライセンス

MIT License - ChocoDrop Projectに準じます
