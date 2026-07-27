#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

# venv・モデルキャッシュとも ~/.tsunagi/llm 配下にまとめる。
# npmインストール先(apps/llm-server自体)が書き込み不可な場所でも動くようにする狙いもある。
TSUNAGI_LLM_DIR="${HOME}/.tsunagi/llm"
VENV_DIR="${TSUNAGI_LLM_DIR}/venv"
export HF_HOME="${TSUNAGI_LLM_DIR}/cache"
# xet転送は進捗の観測が難しい独自プロトコルのため無効化し、素直なHTTPダウンロードに固定する。
export HF_HUB_DISABLE_XET=1

MODEL="mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit"

# requirements.txtでpinしているmlxがrequires-python >=3.10のため、venv作成に使うpython3自体も
# 3.10以上でなければpip installがそもそも失敗する。`python3`という名前がPATH上のどのバージョンを
# 指すかは環境依存(古いmacOS付属Python等)なため、候補を新しい順に探して最初に見つかった
# 3.10以上を使う。
MIN_PYTHON_VERSION="3.10"

find_python() {
  for cand in python3.14 python3.13 python3.12 python3.11 python3.10 python3; do
    if command -v "$cand" >/dev/null 2>&1; then
      ver="$("$cand" -c 'import sys; print("%d.%d" % sys.version_info[:2])' 2>/dev/null || true)"
      [ -z "$ver" ] && continue
      if [ "$(printf '%s\n%s\n' "$MIN_PYTHON_VERSION" "$ver" | sort -V | head -n1)" = "$MIN_PYTHON_VERSION" ]; then
        echo "$cand"
        return 0
      fi
    fi
  done
  return 1
}

if ! PYTHON_BIN="$(find_python)"; then
  echo "音声整形(LLM整形)サーバーの起動に失敗: Python ${MIN_PYTHON_VERSION}以上が見つかりません。" >&2
  echo "'brew install python@3.12' 等でインストールしてください。" >&2
  exit 1
fi

# requirements.txtの内容、または使用するpython3のバージョンが変わった場合は既存venvごと作り直す。
# venvは作成時のpythonバイナリに紐づくため、pip installだけでは古いバージョンのまま更新できない。
REQUIREMENTS_HASH_FILE="${VENV_DIR}/.requirements.sha256"
CURRENT_HASH="$( { cat requirements.txt; "$PYTHON_BIN" --version; } | shasum -a 256 | awk '{print $1}')"

if [ ! -d "$VENV_DIR" ] || [ "$(cat "$REQUIREMENTS_HASH_FILE" 2>/dev/null)" != "$CURRENT_HASH" ]; then
  mkdir -p "$TSUNAGI_LLM_DIR"
  rm -rf "$VENV_DIR"
  "$PYTHON_BIN" -m venv "$VENV_DIR"
  "$VENV_DIR/bin/python3" -m pip install -r requirements.txt
  echo "$CURRENT_HASH" > "$REQUIREMENTS_HASH_FILE"
fi

# サーバー起動前にモデルを予めダウンロードしておく(初回チャットで待たされないように)。
"$VENV_DIR/bin/python3" download_model.py

# venvを ~/.tsunagi 配下へ移設する場合があるため、絶対パスが焼き込まれる
# コンソールスクリプト(bin/mlx_lm.server)ではなく `python3 -m` 経由で呼び出す。
exec "$VENV_DIR/bin/python3" -m mlx_lm.server --model "$MODEL" --host 127.0.0.1 --port 8766
