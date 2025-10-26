#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/run-parallel-task.sh [options] --branch <branch>

Options:
  -p, --prompt TEXT        タスク入力テキスト（STDIN からも可）
      --prompt-file FILE   テキストをファイルから読み込み
  -a, --agent NAME         エージェント名（必須）
  -b, --branch NAME        対象ブランチ。複数指定可
      --branches CSV       カンマ区切りでブランチ指定
      --ref REF            workflow を投げる Git リファレンス（既定: main）
      --session-id ID      セッションIDを手動指定
      --note TEXT          補足ノート（ログ専用）
      --dry-run            実際には gh workflow run をせず内容のみ表示
  -h, --help               このヘルプを表示
USAGE
}

error() {
  echo "[run-parallel-task] $1" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || error "'$1' コマンドが必要です"
}

slugify() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | tr -c 'a-z0-9 ' ' ' \
    | tr -s ' ' '-' \
    | sed -e 's/^-*//' -e 's/-*$//' \
    | cut -c1-32
}

trim() {
  # shellcheck disable=SC2001
  echo "$1" | sed -e 's/^\s*//' -e 's/\s*$//'
}

normalize_prompt() {
  local input="$1"
  if [[ "$input" == *:* ]]; then
    input="${input#*:}"
  fi
  input=$(printf '%s' "$input" | tr '\n' ' ')
  # collapse spaces
  # shellcheck disable=SC2005
  echo "$(printf '%s' "$input" | tr -s '[:space:]' ' ' | sed -e 's/^ //;s/ $//')"
}

PROMPT=""
PROMPT_FILE=""
CONFIG_PATH="${CHOCODROP_RUNNER_CONFIG:-$HOME/.chocodrop-runner.json}"
CONFIG_DEFAULT_MODE=""
CONFIG_DEFAULT_AGENT=""
CONFIG_DEFAULT_REF=""

if [[ -f "$CONFIG_PATH" ]]; then
  while IFS='=' read -r key value; do
    case "$key" in
      default_mode) CONFIG_DEFAULT_MODE="$value" ;;
      default_agent) CONFIG_DEFAULT_AGENT="$value" ;;
      default_ref) CONFIG_DEFAULT_REF="$value" ;;
    esac
  done < <(python3 - "$CONFIG_PATH" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
try:
    data = json.loads(path.read_text())
except Exception:
    sys.exit(0)
for key in ("default_mode", "default_agent", "default_ref"):
    value = data.get(key)
    if isinstance(value, str) and value.strip():
        print(f"{key}={value.strip()}")
PY
  )
fi

DEFAULT_MODE="${RUNNER_DEFAULT_MODE:-${CONFIG_DEFAULT_MODE:-github}}"
PROMPT_MODE=$(echo "$DEFAULT_MODE" | tr '[:upper:]' '[:lower:]')

PROMPT=""
PROMPT_FILE=""
AGENT_NAME="${AI_AGENT_NAME:-${CONFIG_DEFAULT_AGENT:-}}"
REF="${GIT_DEFAULT_REF:-${CONFIG_DEFAULT_REF:-main}}"
SESSION_ID_OVERRIDE=""
NOTE=""
MODE_OVERRIDE=""
BRANCHES=()

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
    -a|--agent)
      [[ $# -ge 2 ]] || error "--agent には値が必要です"
      AGENT_NAME="$2"
      shift 2
      ;;
    -b|--branch)
      [[ $# -ge 2 ]] || error "--branch には値が必要です"
      BRANCHES+=("$2")
      shift 2
      ;;
    --branches)
      [[ $# -ge 2 ]] || error "--branches には値が必要です"
      IFS=',' read -ra extra <<< "$2"
      for b in "${extra[@]}"; do
        BRANCHES+=("$b")
      done
      shift 2
      ;;
    --ref)
      [[ $# -ge 2 ]] || error "--ref には値が必要です"
      REF="$2"
      shift 2
      ;;
    --session-id)
      [[ $# -ge 2 ]] || error "--session-id には値が必要です"
      SESSION_ID_OVERRIDE="$2"
      shift 2
      ;;
    --note)
      [[ $# -ge 2 ]] || error "--note には値が必要です"
      NOTE="$2"
      shift 2
      ;;
    --mode)
      [[ $# -ge 2 ]] || error "--mode には github か dry-run を指定してください"
      MODE_OVERRIDE="$2"
      shift 2
      ;;
    --dry-run)
      MODE_OVERRIDE="dry-run"
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

need_cmd gh
need_cmd sed
need_cmd tr
need_cmd date

if [[ -z "$PROMPT" && -n "$PROMPT_FILE" ]]; then
  [[ -f "$PROMPT_FILE" ]] || error "指定されたファイルが存在しません"
  PROMPT=$(cat "$PROMPT_FILE")
fi

if [[ -z "$PROMPT" ]]; then
  if [[ -t 0 ]]; then
    error "タスクテキストを --prompt か STDIN で指定してください"
  else
    PROMPT=$(cat)
  fi
fi

[[ -n "$AGENT_NAME" ]] || error "--agent でエージェント名を指定してください"
[[ ${#BRANCHES[@]} -gt 0 ]] || error "少なくとも1つの --branch が必要です"

MODE="${MODE_OVERRIDE:-$PROMPT_MODE}"
MODE=$(echo "$MODE" | tr '[:upper:]' '[:lower:]')
case "$MODE" in
  github|dry-run) ;;
  *) error "--mode は github か dry-run を指定してください" ;;
esac

RAW_PROMPT=$(printf '%s' "$PROMPT" | sed 's/^[[:space:]]\+//;s/[[:space:]]\+$//')
[[ -n "$RAW_PROMPT" ]] || error "空のタスクテキストです"

NORMALIZED=$(normalize_prompt "$RAW_PROMPT")
[[ -n "$NORMALIZED" ]] || error "正規化後のテキストが空です"

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
SLUG=$(slugify "$NORMALIZED")
[[ -n "$SLUG" ]] || SLUG="prompt"
SESSION_ID=${SESSION_ID_OVERRIDE:-task-$SHORT_HASH-$SLUG}
SESSION_ID=$(echo "$SESSION_ID" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-_' '-')
SESSION_ID=${SESSION_ID%%-}

BRANCH_CLEAN=()
for b in "${BRANCHES[@]}"; do
  cleaned=$(trim "$b")
  [[ -n "$cleaned" ]] || continue
  BRANCH_CLEAN+=("$cleaned")
done
[[ ${#BRANCH_CLEAN[@]} -gt 0 ]] || error "有効なブランチ名がありません"

BRANCH_CSV=$(IFS=','; echo "${BRANCH_CLEAN[*]}")
BRANCH_CSV=${BRANCH_CSV// /}

PROMPT_FIELD="$NORMALIZED"
PROMPT_MAX=512
if (( ${#PROMPT_FIELD} > PROMPT_MAX )); then
  PROMPT_FIELD="${PROMPT_FIELD:0:PROMPT_MAX}"
fi

printf '🪄 Session ID: %s\n' "$SESSION_ID"
printf '🤖 Agent: %s\n' "$AGENT_NAME"
printf '🌿 Branches: %s\n' "$BRANCH_CSV"
printf '📚 Ref: %s\n' "$REF"
printf '⚙️ Mode: %s\n' "$MODE"

if [[ "$MODE" == "dry-run" ]]; then
  echo "default_mode=dry-run のため GitHub Actions は起動しません"
else
  gh workflow run worktree-parallel.yml \
    --ref "$REF" \
    --raw-field session_id="$SESSION_ID" \
    --raw-field agent_name="$AGENT_NAME" \
    --raw-field prompt_seed="$PROMPT_FIELD" \
    --raw-field branches="$BRANCH_CSV"
fi

LOG_PATH="db/session-log.jsonl"
mkdir -p "$(dirname "$LOG_PATH")"

SESSION_TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
export SESSION_TS SESSION_ID AGENT_NAME NORMALIZED BRANCH_CSV REF NOTE
python3 - "$LOG_PATH" <<'PY'
import json
import os
import sys
from pathlib import Path

log_path = Path(sys.argv[1])
entry = {
    "timestamp": os.environ["SESSION_TS"],
    "session_id": os.environ["SESSION_ID"],
    "agent": os.environ["AGENT_NAME"],
    "branches": os.environ["BRANCH_CSV"].split(',') if os.environ["BRANCH_CSV"] else [],
    "prompt": os.environ["NORMALIZED"],
    "ref": os.environ["REF"],
    "note": os.environ.get("NOTE", "")
}
log_path.parent.mkdir(parents=True, exist_ok=True)
with log_path.open('a', encoding='utf-8') as fh:
    fh.write(json.dumps(entry, ensure_ascii=False) + '\n')
PY

echo "📝 セッションログを更新しました: $LOG_PATH"
