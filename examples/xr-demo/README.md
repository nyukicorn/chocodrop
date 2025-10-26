# ChocoDrop XR Demo

Meta Quest 3 対応の WebXR デモアプリケーション

## 🎯 概要

このデモは ChocoDrop に XR（VR/AR）機能を統合するための実証実験です。Meta Quest 3 のブラウザで動作し、VRモードとARモードの両方をサポートしています。

## 🚀 使い方

### 1. ローカル開発サーバーを起動

```bash
cd /Users/nukuiyuki/Dev/ChocoDrop/.worktrees/task-1761476416770-73488a
npm run dev
```

サーバーは `http://192.168.1.15:3011` で起動します。

### 2. Meta Quest 3 からアクセス

1. Meta Quest 3 を装着
2. Quest Browser を起動
3. アドレスバーに入力：`http://192.168.1.15:3011/examples/xr-demo/`
4. ページが読み込まれたら、下部の「ENTER VR」または「ENTER AR」ボタンをクリック

### 3. 操作方法

#### VRモード
- **コントローラーのトリガー**: オブジェクトを選択・移動
- **スティック**: 移動（実装予定）
- **Bボタン**: メニュー表示（実装予定）

#### ARモード（パススルー）
- **コントローラーのトリガー**: オブジェクトを選択・配置
- **現実空間**: カラーパススルーで表示
- **平面検出**: 自動的に床や壁を認識（実装予定）

## 📁 ファイル構成

```
xr-demo/
├── index.html           # メインデモページ（VR/AR対応）
├── research-report.html # 技術調査レポート
└── README.md           # このファイル
```

## 🛠️ 技術スタック

- **Three.js r170**: 3Dレンダリング
- **WebXR Device API**: VR/AR機能
- **Meta Quest Browser**: Chromiumベース

## ✨ 実装済み機能

- ✅ VRモード（没入型3D表示）
- ✅ ARモード（パススルー）
- ✅ コントローラーのビジュアライゼーション
- ✅ レイキャスティングによるオブジェクト選択
- ✅ オブジェクトの掴み・移動
- ✅ ハンドトラッキング対応（基礎）

## 🔧 今後の実装予定

- ⏳ 平面検出と空間アンカー
- ⏳ ハンドジェスチャー認識
- ⏳ 音声コマンド統合
- ⏳ ChocoDrop UI の XR 統合
- ⏳ AI生成オブジェクトの配置
- ⏳ マルチユーザー対応

## 🐛 トラブルシューティング

### デモが動かない

1. **Quest Browser のバージョンを確認**
   - Settings > Apps > Quest Browser > Update

2. **ネットワーク接続を確認**
   - Quest と開発PCが同じWiFiに接続されているか
   - `http://192.168.1.15:3011` に直接アクセスできるか

3. **HTTPS 警告が出る場合**
   - WebXR は基本的に HTTPS が必要ですが、localhost と同一ネットワーク内はHTTPでも動作します
   - 本番環境では自己署名証明書を使用してください

### VR/ARボタンが表示されない

- Quest Browser で WebXR が有効になっているか確認
- `chrome://flags` で WebXR 関連のフラグを確認

### パフォーマンスが悪い

- オブジェクト数を減らす
- シェーダーを最適化
- テクスチャサイズを小さくする

## 📚 関連ドキュメント

- [調査レポート](./research-report.html) - 2025年のXR技術動向と実装方針
- [Three.js WebXR Documentation](https://threejs.org/docs/#api/en/renderers/webxr/WebXRManager)
- [Meta WebXR Documentation](https://developers.meta.com/horizon/documentation/web/webxr-overview/)

## 🔗 開発環境

- **サーバーIP**: 192.168.1.15
- **ポート**: 3011
- **対象デバイス**: Meta Quest 3
- **ブラウザ**: Quest Browser (Chromium)

## 📝 メモ

- 他チームと並列開発中のため、ポート番号が変更される可能性があります
- パフォーマンステストは必ず実機（Meta Quest 3）で行ってください
- Chrome DevTools の Remote Debugging が使用可能です
