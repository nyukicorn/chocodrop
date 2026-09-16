#!/usr/bin/env bash
# ============================================================
# ChocoDrop の検証器（"No を言う装置"）— loop-ops 標準テンプレート
#   導入: このファイルを <repo>/scripts/check.sh に置き、VERIFY を書き換え、chmod +x
#   loop-breaker はグローバル版(~/.claude/scripts/)に自動フォールバックするので
#   リポジトリ同梱は Codex sandbox / Scion / CI で使う場合のみコピーする
#   緑 → サマリ数行だけ（文脈を汚さない） / 赤 → 全部ダンプ
# ============================================================
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p tmp/check || exit 1
export TMPDIR="$PWD/tmp/check"
export LOOP_BREAKER_LOG_DIR="${LOOP_BREAKER_LOG_DIR:-$PWD/tmp/check}"

# 連続赤チェックポイント（loop-breaker 経由で自分を再実行。緑でリセット）
if [ -z "${LOOP_BREAKER_ACTIVE:-}" ]; then
  for lb in "$(dirname "$0")/loop-breaker.sh" "$HOME/.claude/scripts/loop-breaker.sh"; do
    if [ -x "$lb" ]; then exec "$lb" -- "$0" "$@"; fi
  done
fi

log="$(mktemp "$TMPDIR/chocodrop-check.XXXXXX")" || exit 1
# ===== ここをプロジェクトに合わせて書き換える =====
# 例: pnpm test / pnpm exec tsc --noEmit / pytest -q / bash scripts/lint.sh
VERIFY() {
  echo '[1/4] Unit and local MCP tests'
  npm test || return
  echo '[2/4] Browser bundles'
  npm run build || return
  echo '[3/4] Existing daemon contracts'
  npm test --workspace=@chocodrop/daemon || return
  echo '[4/4] Pages artifact'
  node scripts/build-pages.mjs || return
}
# =================================================

if VERIFY > "$log" 2>&1; then
  tail -5 "$log"
  echo "✅ check passed"
  command rm -f "$log" 2>/dev/null || true
else
  cat "$log"
  echo "❌ check failed"
  command rm -f "$log" 2>/dev/null || true
  exit 1
fi
