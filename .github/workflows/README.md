# GitHub Actions Workflows

このディレクトリには、ChocoDrop プロジェクトの開発を支援する GitHub Actions ワークフローが含まれています。

## 📋 ワークフロー一覧

### 1. CI (ci.yml)
**トリガー**: Push, Pull Request (main ブランチ)

**機能**:
- 複数の Node.js バージョン (18, 20) でテスト実行
- ビルドの検証
- ESLint によるコード品質チェック
- Prettier によるフォーマットチェック

### 2. Security (security.yml)
**トリガー**: Push, Pull Request, 毎週月曜日, 手動実行

**機能**:
- **NPM Audit**: 依存関係の脆弱性スキャン
- **CodeQL Analysis**: コード品質とセキュリティ分析
- **Dependency Review**: PR での依存関係変更レビュー

### 3. Documentation (docs.yml)
**トリガー**: Push/PR (docs/ や src/ の変更時), 手動実行

**機能**:
- JSDoc 生成 (将来実装予定)
- Markdown ドキュメント検証
- HTML ドキュメント生成
- GitHub Pages へのデプロイ (main ブランチのみ)

### 4. Deploy (deploy.yml)
**トリガー**: Push (main ブランチ)

**機能**:
- GitHub Pages への自動デプロイ
- 静的サイトの公開

### 5. Release (release.yml) ⭐️
**トリガー**: 手動実行のみ

**機能**:
- バージョンアップ (patch/minor/major/prerelease)
- CHANGELOG 更新
- Git タグ作成
- GitHub Release 作成
- NPM への公開 (オプション)

**使い方**:
1. GitHub の Actions タブを開く
2. "Release" ワークフローを選択
3. "Run workflow" をクリック
4. バージョンタイプを選択 (patch, minor, major, prerelease)
5. プレリリースタグを入力 (alpha, beta, rc など)
6. 実行

### 6. Worktree Parallel Testing (worktree-parallel.yml) 🌳⚡️
**トリガー**: 手動実行のみ

**機能**:
- **複数ブランチの並行テスト**: 異なる実装を同時に実行・比較
- **詳細なレポート生成**: 各ブランチの結果を JSON + Markdown で出力
- **パフォーマンス比較**: ビルド時間、テスト時間を比較
- **総合評価レポート**: 全ブランチの結果を一覧表示

**使い方**:
```bash
# 例: 3つのワークツリーブランチを並行テスト
ブランチ名: task/feature-a,task/feature-b,task/feature-c
```

1. GitHub の Actions タブを開く
2. "Worktree Parallel Testing" を選択
3. "Run workflow" をクリック
4. パラメータを設定:
   - **branches**: テストするブランチ名 (カンマ区切り)
     - 例: `task/impl-1,task/impl-2,task/impl-3`
   - **run_build**: ビルドを実行するか (デフォルト: true)
   - **run_tests**: テストを実行するか (デフォルト: true)
   - **compare_results**: 比較レポートを生成するか (デフォルト: true)
5. 実行

**出力**:
- 各ブランチの詳細レポート (JSON + Markdown)
- 比較レポート (全ブランチの結果を表形式で表示)
- アーティファクトとしてダウンロード可能 (30-90日間保存)
- `session/<ID>` ラベル付きの Issue にすべての Run が自動コメントされ、GitHub UI 上でグルーピング可能

**レポート内容**:
- Lint 結果
- ビルド成功/失敗とビルド時間
- テスト成功/失敗とテスト時間
- テストの合格数/失敗数
- 推奨事項 (どのブランチをマージすべきか)

#### セッションID生成と workflow_dispatch 入力
- `session_id` と `agent_name` は必須入力になりました。`prompt_seed` には正規化済みタスクテキスト（512文字以内）を渡してください。
- Run 名とアーティファクト名が `session_id` を含むようになり、遅延したキュー実行でも UI で容易に検索できます。
- `session/<ID>` というラベル付き Issue が自動生成され、各ブランチ実行がコメントとして追記されます。

#### CLI: `scripts/run-parallel-task.sh`
タスクテキストからセッションIDを自動生成し、`gh workflow run` を安全に叩くヘルパースクリプトです。

```bash
scripts/run-parallel-task.sh \
  --agent ClaudeCode1 \
  --prompt 'ClaudeCode1: README の Section E を...タスクはキラキラと...' \
  --branch task/section-e-a \
  --branch task/section-e-b
```

- 正規化内容: `AI名:` 以前を除去 → 改行をスペース化 → 連続空白圧縮 → 前後の空白除去。
- SHA256 の先頭12文字 + スラッグを組み合わせた `task-xxxxxxxxxxxx-foo-bar` 形式を生成。`--session-id` で手動指定も可能。
- `db/session-log.jsonl` に実行記録を追記（`.gitignore` 済み）。`--dry-run` でコマンド確認のみも可能。
- `branches` は複数指定可（`--branch` を繰り返すか `--branches` でカンマ区切り）。

**AI / 人間オペレーター向けの伝達指針**
- **GitHub Actions で実行した場合**: 各AIは `session_id`（例: `task-123abcde-demo`）と対象ブランチ列をコメントに含め、`session/<ID>` Issue への自動リンクを共有してください。
- **ローカルで検証した場合**: 同じ `session_id` を `git worktree`／ローカル成果物にラベルとして付け（例: `worktrees/task-123abcde-demo/codex`）、結果を `db/session-log.jsonl` へ追記後に人間へ報告します。報告フォーマットは「Session task-XXX by Codex: ローカルテスト結果...」のように AI/人の責務を明示します。

## 🔧 ローカルでの実行

### Lint & Format
```bash
# Lint チェック
npm run lint

# Lint 自動修正
npm run lint:fix

# Format チェック
npm run format:check

# Format 自動適用
npm run format
```

### Build & Test
```bash
# ビルド
npm run build

# テスト実行
npm test
```

## 🛠️ セットアップ

### 必要な Secrets

リリース自動化で NPM に公開する場合は、以下の Secret を設定してください：

1. GitHub リポジトリの Settings → Secrets and variables → Actions
2. `NPM_TOKEN` を追加
   - NPM のアクセストークンを取得: https://www.npmjs.com/settings/your-username/tokens
   - "Automation" タイプのトークンを作成
   - トークンを Secret に追加

### CodeQL のセットアップ

CodeQL は自動的に有効化されます。追加設定は不要です。

### Dependabot

Dependabot は `.github/dependabot.yml` で設定されており、自動的に有効化されます：
- 毎週月曜日 09:00 (JST) に依存関係をチェック
- メインプロジェクト、daemon、SDK の依存関係を個別管理
- GitHub Actions の依存関係も自動更新

## 📊 ワークフロー戦略

### 開発フロー

```
1. Feature ブランチで開発
   ↓
2. Push → CI ワークフローが自動実行
   ↓
3. Pull Request 作成 → Security チェック実行
   ↓
4. レビュー & マージ
   ↓
5. main ブランチ → Deploy ワークフロー実行
```

### Worktree 並行開発フロー

```
1. 複数のワークツリーで異なる実装を試す
   git worktree add .worktrees/impl-1 -b task/impl-1
   git worktree add .worktrees/impl-2 -b task/impl-2
   git worktree add .worktrees/impl-3 -b task/impl-3
   ↓
2. それぞれで実装
   ↓
3. Push & Worktree Parallel Testing 実行
   ↓
4. 結果を比較 (アーティファクトをダウンロード)
   ↓
5. 最良の実装を選択してマージ
```

### リリースフロー

```
1. main ブランチで開発完了
   ↓
2. Release ワークフローを手動実行
   - バージョンタイプを選択
   - プレリリースタグを入力 (必要に応じて)
   ↓
3. 自動的に以下が実行される:
   - バージョンアップ
   - CHANGELOG 更新
   - Git タグ作成
   - GitHub Release 作成
   - NPM 公開 (オプション)
   ↓
4. リリース完了
```

## 🎯 ベストプラクティス

1. **頻繁にコミット**: CI が各コミットをチェック
2. **早期のセキュリティチェック**: 毎週のスキャンで脆弱性を早期発見
3. **Worktree 活用**: 複数の実装を並行開発・比較
4. **ドキュメント更新**: コード変更と同時にドキュメントも更新
5. **定期的なリリース**: 小さな変更を頻繁にリリース

## 🐛 トラブルシューティング

### Lint エラーが出る
```bash
# 自動修正を試す
npm run lint:fix
npm run format
```

### Build が失敗する
```bash
# 依存関係を再インストール
npm ci
npm run build
```

### Worktree ワークフローでブランチが見つからない
- ブランチを GitHub にプッシュしているか確認
- ブランチ名が正確か確認 (大文字小文字、スラッシュ)

## 📚 参考リンク

- [GitHub Actions ドキュメント](https://docs.github.com/actions)
- [Git Worktree](https://git-scm.com/docs/git-worktree)
- [CodeQL](https://codeql.github.com/)
- [Dependabot](https://docs.github.com/code-security/dependabot)
