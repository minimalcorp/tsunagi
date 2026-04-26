#!/bin/sh
# monaco-editor.sh
# $EDITOR として設定することで、Claude Code の Ctrl+G でブラウザ上の
# Monaco Editor Modal を開いてプロンプトを編集できる。
#
# セットアップ:
#   export EDITOR="/path/to/scripts/monaco-editor.sh"
#
# 依存: curl のみ

set -e

TMPFILE="$1"
API_BASE="http://localhost:2792"

if [ -z "$TMPFILE" ]; then
  echo "Usage: monaco-editor.sh <tmpfile>" >&2
  exit 1
fi

# alt screen に切り替えて $EDITOR フローの間は main buffer を凍結する。
# vim/nano 等の通常の $EDITOR と同じ作法。これにより:
# - sh script の（潜在的な）出力や claude の Ink 再描画の副作用が main buffer に影響しない
# - sh exit 時の `\033[?1049l` で main buffer が pre-Ctrl+G 時の状態に完全復元される
printf '\033[?1049h'
trap 'printf "\033[?1049l"' EXIT

# エラー報告用: alt screen から抜けてから stderr に出す
_error_exit() {
  printf '\033[?1049l'
  trap - EXIT
  echo "Error: $1" >&2
  exit 1
}

# ファイルパスを送信。サーバー側がファイルの読み書きを行う。
# TSUNAGI_SESSION_ID はPTY作成時に設定される環境変数（= tab_id）
# レスポンスはプレーンテキストの sessionId のみ（JSON パース不要）
SESSION_ID=$(curl -sf -X POST "$API_BASE/api/editor/session" \
  -H "Content-Type: application/json" \
  -d "{\"filePath\": \"$TMPFILE\", \"tabId\": \"$TSUNAGI_SESSION_ID\"}")

if [ -z "$SESSION_ID" ]; then
  _error_exit "Failed to create editor session (is tsunagi running? check monaco-editor.sh setup)"
fi

# 完了までポーリング（無制限、0.1秒間隔。Ctrl+C で中断可能）
# レスポンスはプレーンテキスト "done" or "pending"（JSON パース不要）
while true; do
  STATUS=$(curl -sf "$API_BASE/api/editor/session/$SESSION_ID" 2>/dev/null || echo "pending")
  if [ "$STATUS" = "done" ]; then
    exit 0
  fi
  sleep 0.1
done
