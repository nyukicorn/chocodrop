# セキュリティポリシー

## 対象バージョン

ChocoDropは現在alpha版です。最新版と`main`ブランチを確認対象とし、過去のalpha版に対する個別の修正は保証していません。

## 脆弱性を報告する

セキュリティ上の問題を見つけた場合は、公開IssueやDiscussionへ詳細を書かず、GitHubの[非公開の脆弱性報告](https://github.com/nyukicorn/chocodrop/security/advisories/new)をご利用ください。

次の情報があると確認しやすくなります。

- 問題の内容
- 再現手順
- 影響するバージョンや機能
- 想定される影響
- 修正案（ある場合）

報告を確認後、内容と影響範囲を調査します。返答や修正までの時間は、問題の内容と開発状況によって異なります。

## 安全に使うために

- APIキー、トークン、認証情報をブラウザコードやリポジトリへ含めないでください。
- MCPへ許可する素材フォルダは必要な範囲に限定してください。
- 画像、動画、GLBなどの素材は、信頼できる提供元のものを使用してください。
- ChocoDropのローカルサーバーを、意図せず外部ネットワークへ公開しないでください。

---

## English summary

ChocoDrop is currently in alpha. Security review focuses on the latest release and the `main` branch; fixes for older alpha releases are not guaranteed.

Please do not disclose vulnerabilities in public issues or discussions. Submit them through [GitHub private vulnerability reporting](https://github.com/nyukicorn/chocodrop/security/advisories/new), including reproduction steps, affected versions or features, impact, and a suggested fix when available.

Response and remediation times depend on the issue and current development capacity.
