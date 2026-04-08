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

# 代替画面 (alt screen) に切り替えて script の出力を claude の描画領域から隔離する。
# vim/nano 等の通常の $EDITOR と同じ作法。これをやらないと script の stderr 出力が
# main buffer に積まれて、claude の Ink renderer の位置情報と実画面がズレ、
# $EDITOR 終了後の描画に余白が生じる。
printf '\033[?1049h'
# どんな経路で終了しても alt screen から確実に復帰させる
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
# 速めの polling 間隔にしているのは、Cmd+Enter Submit 後に sh が foreground PG から
# 抜けるまでの遅延を最小化するため（TerminalView 側の resize nudge が claude に
# 届くように）。
# レスポンスはプレーンテキスト "done" or "pending"（JSON パース不要）
while true; do
  STATUS=$(curl -sf "$API_BASE/api/editor/session/$SESSION_ID" 2>/dev/null || echo "pending")
  if [ "$STATUS" = "done" ]; then
    exit 0
  fi
  sleep 0.1
done
