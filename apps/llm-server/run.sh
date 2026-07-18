#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

# venv・モデルキャッシュとも ~/.tsunagi/llm 配下にまとめる。
# npmインストール先(apps/llm-server自体)が書き込み不可な場所でも動くようにする狙いもある。
# venvはinstruct/thinkingで共有する(同じmlx-lmパッケージを使うため)。
TSUNAGI_LLM_DIR="${HOME}/.tsunagi/llm"
VENV_DIR="${TSUNAGI_LLM_DIR}/venv"
export HF_HOME="${TSUNAGI_LLM_DIR}/cache"
# xet転送は進捗の観測が難しい独自プロトコルのため無効化し、素直なHTTPダウンロードに固定する。
export HF_HUB_DISABLE_XET=1

# 第1引数でモード切替。省略時はinstruct(非シンキング)。
PROFILE="${1:-instruct}"
case "$PROFILE" in
  instruct)
    MODEL="mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit"
    PORT=8766
    ;;
  thinking)
    MODEL="mlx-community/Qwen3-30B-A3B-Thinking-2507-4bit"
    PORT=8767
    ;;
  *)
    echo "Unknown profile: ${PROFILE} (expected 'instruct' or 'thinking')" >&2
    exit 1
    ;;
esac

if [ ! -d "$VENV_DIR" ]; then
  mkdir -p "$TSUNAGI_LLM_DIR"
  python3 -m venv "$VENV_DIR"
  "$VENV_DIR/bin/python3" -m pip install -r requirements.txt
fi

# サーバー起動前にモデルを予めダウンロードしておく(初回チャットで待たされないように)。
"$VENV_DIR/bin/python3" download_model.py "$MODEL"

# venvを ~/.tsunagi 配下へ移設する場合があるため、絶対パスが焼き込まれる
# コンソールスクリプト(bin/mlx_lm.server)ではなく `python3 -m` 経由で呼び出す。
exec "$VENV_DIR/bin/python3" -m mlx_lm.server --model "$MODEL" --host 127.0.0.1 --port "$PORT"
