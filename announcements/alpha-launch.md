# ChocoDrop v1.0.2-alpha.0 アナウンステンプレート集

このファイルには各配信先用のアナウンステンプレートが含まれています。コピペして使用してください。

---

## 配信先 & 順番（おすすめ）

1. ✅ **GitHub Release** → 完了！ https://github.com/nyukicorn/chocodrop/releases/tag/v1.0.2-alpha.0
2. ✅ **GitHub Issues（フィードバック集約ハブ）** → 完了！ https://github.com/nyukicorn/chocodrop/issues/2
3. ⬜ **X（Twitter）** → 拡散
4. ⬜ **Discord/Slack** → 会話とサポート
5. ⬜ **メール** → テスター/UAT募集 or 友人・関係者へ

---

## 2) X（Twitter）アナウンス

### 日本語版

```
🍫 ChocoDrop v1.0.2-alpha.0 を公開しました！

・ローカル常駐を起動：
  npx --yes @chocodrop/daemon@alpha
・READMEのブックマークレットを登録して
・threejs.org 等でクリック → 右下にフルUI✨

✅ 外部サイトでもそのまま動作（PNA/CORS対応）
🏢 CDN禁止なら：window.chocodropConfig = { allowCdn: false }

詳細とダウンロード：
https://github.com/nyukicorn/chocodrop/releases/tag/v1.0.2-alpha.0

フィードバック募集中：
https://github.com/nyukicorn/chocodrop/issues/2
```

### 英語版

```
🍫 ChocoDrop v1.0.2-alpha.0 (alpha) is out!

How to try in 30s:
1) Run: npx --yes @chocodrop/daemon@alpha
2) Add the bookmarklet from README
3) Open threejs.org examples → click → full UI in the bottom-right ✨

✅ Works on external sites (PNA/CORS)
🏢 No external CDN? use: window.chocodropConfig = { allowCdn: false }

Release:
https://github.com/nyukicorn/chocodrop/releases/tag/v1.0.2-alpha.0

Feedback:
https://github.com/nyukicorn/chocodrop/issues/2
```

---

## 3) Discord / Slack 投稿

```
【α公開】ChocoDrop v1.0.2-alpha.0

threejs.org 等の外部サイトでも、ブックマークレット1クリックで右下にフルUIが出ます🎉

最短手順👇
1) npx --yes @chocodrop/daemon@alpha
2) READMEのブックマークレットを登録
3) threejs.org/examples/ を開いてクリック → フルUI表示

企業CSPでCDN禁止なら：
window.chocodropConfig = { allowCdn: false }

フィードバックはこちら（テンプレ付）：
https://github.com/nyukicorn/chocodrop/issues/2

リリースノート：
https://github.com/nyukicorn/chocodrop/releases/tag/v1.0.2-alpha.0
```

---

## 4) メール（UAT募集・友人/関係者向け）

### 件名
```
ChocoDrop α版の最終チェックにご協力ください（所要5分）
```

### 本文

```
こんにちは、ChocoDrop の α版（v1.0.2-alpha.0）を公開しました。
「ワンクリックで threejs.org 等の外部サイトでもフルUI」を検証中です。最短5分で試せます。

■ 手順
1) ターミナルで実行：
   npx --yes @chocodrop/daemon@alpha

2) READMEのブックマークレットを登録
   https://github.com/nyukicorn/chocodrop#readme

3) https://threejs.org/examples/ を開き、ブックマークレットをクリック
   → 右下に ChocoDrop のフルUIが出ればOKです

■ CDN禁止環境の場合
ページのコンソールで：
window.chocodropConfig = { allowCdn: false }

■ フィードバックの送り先（テンプレあり）
https://github.com/nyukicorn/chocodrop/issues/2

目標：最初のUI表示まで120秒以内。ご協力に感謝します！

---
ChocoDrop Project
https://github.com/nyukicorn/chocodrop
```

---

## 5) README Quick Start（README冒頭に追記する短尺）

```markdown
### Quick Start（30秒）

1) 起動：`npx --yes @chocodrop/daemon@alpha`
2) READMEのブックマークレットを登録
3) threejs.org でクリック → 右下に **フルUI** が出れば成功

> 企業CSPなどでCDNが使えない場合：
> `window.chocodropConfig = { allowCdn: false }` を実行してから試してください

📋 [αテスター募集中](https://github.com/nyukicorn/chocodrop/issues/2)
```

---

## 6) 既知の制限（明記して誤解を防ぐ）

以下の制限を各アナウンスに記載することを推奨：

- ⚠️ 生成など書き込み系APIはαでは無効（次フェーズでペアリング承認＋CSRF導入後に解放）
- ⚠️ ブックマークレットがCSPで弾かれるサイトでは、DevToolsスニペットを推奨（READMEに記載）
- ⚠️ 公式サポートブラウザ第1優先は Chrome。他ブラウザは順次対応

---

## 7) 計測 & 回収（軽量KPI）

フィードバックIssueで収集する項目：

- **TTFU（Time to First UI）**: UI表示までの秒数
- **PASS率**: Dev環境 / Non-Dev環境別
- **失敗の内訳**: PNA / CSP / CDN / 不明
- **収集先**: Pinned Issue #2 に統一

---

## 次のステップ

✅ 配信完了後、Phase 2b（ペアリング承認＋CSRF）に着手
✅ 互換テスト拡張：Safari/Firefox/Edge、CodePen/Glitchの実機スクショ
✅ `serve --target` コマンド検討メモ作成
