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

# ファイルパスを送信。サーバー側がファイルの読み書きを行う。
# TSUNAGI_SESSION_ID はPTY作成時に設定される環境変数（= tab_id）
# レスポンスはプレーンテキストの sessionId のみ（JSON パース不要）
SESSION_ID=$(curl -sf -X POST "$API_BASE/api/editor/session" \
  -H "Content-Type: application/json" \
  -d "{\"filePath\": \"$TMPFILE\", \"tabId\": \"$TSUNAGI_SESSION_ID\"}")

if [ -z "$SESSION_ID" ]; then
  echo "Error: Failed to create editor session (is tsunagi running? check monaco-editor.sh setup)" >&2
  exit 1
fi

echo "Opening Monaco Editor in browser... (session: $SESSION_ID)" >&2

# 完了までポーリング（最大10分、1秒間隔）
# レスポンスはプレーンテキスト "done" or "pending"（JSON パース不要）
i=0
while [ $i -lt 600 ]; do
  STATUS=$(curl -sf "$API_BASE/api/editor/session/$SESSION_ID" 2>/dev/null || echo "pending")
  if [ "$STATUS" = "done" ]; then
    exit 0
  fi
  sleep 1
  i=$((i + 1))
done

echo "Error: Timed out waiting for editor (10 min)" >&2
exit 1
