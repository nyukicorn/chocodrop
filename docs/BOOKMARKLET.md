# ブックマークレットで使う

ChocoDropのブックマークレットは、閲覧中のThree.jsページへGitHub Pagesの公開runtimeからUIを読み込み、利用者のPCで動くローカルdaemonへ接続します。GitHubのcloneは不要ですが、利用中はターミナルでdaemonを起動しておく必要があります。

## 登録

1. Node.js 16以上を用意します。Node.js 22 LTSを推奨します。
2. ターミナルでdaemonを起動します。

   ```bash
   npx --yes @chocodrop/daemon@alpha
   ```

3. [ブックマークレット登録ページ](https://nyukicorn.github.io/chocodrop/examples/bookmarklet-v2.html)を開きます。
4. 「ChocoDropを登録」をブックマークバーへドラッグします。
5. 対象のThree.jsページを開き、登録したブックマークを押します。

daemonは`127.0.0.1:43110`だけで待ち受けます。終了する時は、起動したターミナルで`Ctrl+C`を押してください。

## 対応するページ

素材配置まで利用できるのは、次の条件を満たすページです。

- Three.jsを使用している
- `scene`、`camera`、`renderer`がページのグローバル変数として参照できる
- Content Security PolicyがChocoDropのGitHub Pagesからのスクリプト読込を許可する
- ブラウザがHTTPSページからローカルdaemonへの接続を許可する

モジュール内部に閉じたThree.jsシーンは自動検出できません。Three.js以外の3Dエンジン、WebGPUだけで描画するページ、第三者iframeの内部も対象外です。シーンを検出できない場合は理由を画面に表示し、素材配置UIは開きません。

自分のThree.jsプロジェクトで確実に使う場合は、ブックマークレットではなく[SDKの統合手順](INTEGRATION.md)を使用してください。

## 表示されない時

1. `http://127.0.0.1:43110/v1/health`をブラウザで開き、`"ok":true`が返ることを確認します。
2. 対象ページを再読み込みし、ブックマークをもう一度押します。
3. ページに「ChocoDropを読み込めませんでした」と出る場合は、そのページのContent Security Policyで外部スクリプトが禁止されています。
4. UIは出るが配置できない場合は、Three.jsシーンがグローバルに公開されていません。

Chromeでの利用を推奨します。Safari・Firefoxとスマートフォンのブックマークレットは、現時点では動作保証の対象外です。

## プライバシー

daemonはローカルアドレスだけで待ち受けます。対象ページはGitHub Pagesから公開runtimeを読み込み、ローカルdaemonへヘルスチェックと必要なAPI通信を行います。選択した素材やページ内容をChocoDropの外部サーバーへ送信する機能ではありません。
