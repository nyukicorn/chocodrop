#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/run-ai-implementation.sh [options]

Options:
  -p, --prompt TEXT        タスク入力テキスト（STDIN からも可）
      --prompt-file FILE   テキストをファイルから読み込み
      --session-id ID      セッションIDを手動指定（省略時は自動生成）
      --ref REF            workflow を投げる Git リファレンス（既定: main）
      --dry-run            実際には gh workflow run をせず内容のみ表示
  -h, --help               このヘルプを表示

説明:
  このスクリプトは ai-parallel-implementation.yml を実行し、
  GitHub Actions 上で AI に実装を行わせます。

  複数のAIが同じプロンプトテキストを実行すると、
  自動的に同じセッションIDが割り当てられます。

例:
  # コマンドラインから
  ./scripts/run-ai-implementation.sh -p "タスクはキラキラと光る..."

  # ファイルから
  ./scripts/run-ai-implementation.sh --prompt-file task.txt

  # STDIN から
  echo "タスクは..." | ./scripts/run-ai-implementation.sh
USAGE
}

error() {
  echo "[run-ai-implementation] ❌ $1" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || error "'$1' コマンドが必要です"
}

normalize_prompt() {
  local input="$1"

  # AI名部分（: より前）を除去
  if [[ "$input" == *:* ]]; then
    input="${input#*:}"
  fi

  # 改行を空白に変換
  input=$(printf '%s' "$input" | tr '\n' ' ')

  # 連続空白を1つに、前後の空白を削除
  printf '%s' "$input" | tr -s '[:space:]' ' ' | sed -e 's/^ //;s/ $//'
}

extract_task_description() {
  local text="$1"

  # "タスクは" 以降を抽出
  if [[ "$text" =~ タスクは(.+)$ ]]; then
    echo "${BASH_REMATCH[1]}"
  elif [[ "$text" =~ タスク:(.+)$ ]]; then
    echo "${BASH_REMATCH[1]}"
  else
    # フォールバック: 全文を使用
    echo "$text"
  fi
}

# デフォルト値
PROMPT=""
PROMPT_FILE=""
SESSION_ID_OVERRIDE=""
REF="main"
DRY_RUN=false

# 引数パース
while [[ $# -gt 0 ]]; do
  case "$1" in
    -p|--prompt)
      [[ $# -ge 2 ]] || error "--prompt には値が必要です"
      PROMPT="$2"
      shift 2
      ;;
    --prompt-file)
      [[ $# -ge 2 ]] || error "--prompt-file には値が必要です"
      PROMPT_FILE="$2"
      shift 2
      ;;
    --session-id)
      [[ $# -ge 2 ]] || error "--session-id には値が必要です"
      SESSION_ID_OVERRIDE="$2"
      shift 2
      ;;
    --ref)
      [[ $# -ge 2 ]] || error "--ref には値が必要です"
      REF="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      error "未知のオプション: $1"
      ;;
  esac
done

# コマンド存在確認
need_cmd gh
need_cmd sed
need_cmd tr

# プロンプト取得
if [[ -z "$PROMPT" && -n "$PROMPT_FILE" ]]; then
  [[ -f "$PROMPT_FILE" ]] || error "指定されたファイルが存在しません: $PROMPT_FILE"
  PROMPT=$(cat "$PROMPT_FILE")
fi

if [[ -z "$PROMPT" ]]; then
  if [[ -t 0 ]]; then
    error "タスクテキストを --prompt, --prompt-file, または STDIN で指定してください"
  else
    PROMPT=$(cat)
  fi
fi

# 空チェック
RAW_PROMPT=$(printf '%s' "$PROMPT" | sed 's/^[[:space:]]\+//;s/[[:space:]]\+$//')
[[ -n "$RAW_PROMPT" ]] || error "空のタスクテキストです"

# 正規化
NORMALIZED=$(normalize_prompt "$RAW_PROMPT")
[[ -n "$NORMALIZED" ]] || error "正規化後のテキストが空です"

# セッションID生成
if [[ -n "$SESSION_ID_OVERRIDE" ]]; then
  SESSION_ID="$SESSION_ID_OVERRIDE"
else
  # ハッシュコマンド検出
  HASH_CMD=""
  if command -v shasum >/dev/null 2>&1; then
    HASH_CMD="shasum -a 256"
  elif command -v sha256sum >/dev/null 2>&1; then
    HASH_CMD="sha256sum"
  else
    error "sha256sum または shasum が必要です"
  fi

  HASH=$(printf '%s' "$NORMALIZED" | eval "$HASH_CMD" | awk '{print $1}')
  SHORT_HASH=${HASH:0:12}
  SESSION_ID="task-$SHORT_HASH"
fi

# タスク内容を抽出
TASK_DESC=$(extract_task_description "$NORMALIZED")
[[ -n "$TASK_DESC" ]] || error "タスク内容を抽出できませんでした"

# 情報表示
echo "🪄 Session ID: $SESSION_ID"
echo "📝 Task Description: $TASK_DESC"
echo "📚 Git Ref: $REF"
echo ""

if [[ "$DRY_RUN" == true ]]; then
  echo "⚠️  Dry-run モード: GitHub Actions は起動しません"
  echo ""
  echo "実行予定のコマンド:"
  echo "gh workflow run ai-parallel-implementation.yml \\"
  echo "  --ref \"$REF\" \\"
  echo "  -f task_description=\"$TASK_DESC\" \\"
  echo "  -f session_id=\"$SESSION_ID\" \\"
  echo "  -f num_approaches=1"
else
  echo "🚀 GitHub Actions ワークフローを起動中..."
  gh workflow run ai-parallel-implementation.yml \
    --ref "$REF" \
    -f task_description="$TASK_DESC" \
    -f session_id="$SESSION_ID" \
    -f num_approaches=1

  echo "✅ ワークフロー実行完了"
  echo ""
  echo "💡 実行状況を確認:"
  echo "   gh run list --workflow=ai-parallel-implementation.yml --limit 5"
fi
