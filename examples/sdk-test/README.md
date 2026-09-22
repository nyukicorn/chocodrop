# ChocoDrop SDK版テストページ

`CommandUI.js`を使うSDK版の確認ページです。右下のチョコから、生成済みの画像・動画・GLBをImportできます。外部の生成サービスは必須ではありません。

## 起動

プロジェクトルートで、2つのターミナルを使います。

```bash
# ターミナル1
node src/server/server.js --port 3011

# ターミナル2
python3 -m http.server 8080 --directory examples/sdk-test
```

ブラウザで <http://localhost:8080/> を開き、「SDK版の準備完了」と右下のチョコが表示されることを確認します。

## デモ版との違い

| 項目 | SDK版 | デモ版 |
| --- | --- | --- |
| UI | `src/client/CommandUI.js` | `src/client/demo/CommandUIDemo.js` |
| 主な用途 | 自分のThree.jsシーンへの組み込み | GitHub Pages上の体験 |
| ローカルサーバー | 使用 | 手動Importだけなら不要 |

フォームUIを変更した場合は、SDK版と `http://localhost:8000/examples/basic/` のデモ版を両方確認します。
