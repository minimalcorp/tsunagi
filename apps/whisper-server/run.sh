#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

# venv・モデルキャッシュとも ~/.tsunagi/whisper 配下にまとめる。
# npmインストール先(apps/whisper-server自体)が書き込み不可な場所でも動くようにする狙いもある。
TSUNAGI_WHISPER_DIR="${HOME}/.tsunagi/whisper"
VENV_DIR="${TSUNAGI_WHISPER_DIR}/venv"
export HF_HOME="${TSUNAGI_WHISPER_DIR}/cache"
# xet転送は進捗の観測が難しい独自プロトコルのため無効化し、素直なHTTPダウンロードに固定する。
export HF_HUB_DISABLE_XET=1

if [ ! -d "$VENV_DIR" ]; then
  mkdir -p "$TSUNAGI_WHISPER_DIR"
  python3 -m venv "$VENV_DIR"
  "$VENV_DIR/bin/python3" -m pip install -r requirements.txt
fi

# サーバー起動前にモデルを予めダウンロードしておく(初回文字起こしで待たされないように)。
"$VENV_DIR/bin/python3" download_model.py

# venvを ~/.tsunagi 配下へ移設する場合があるため、絶対パスが焼き込まれる
# コンソールスクリプト(bin/uvicorn等)ではなく `python3 -m` 経由で呼び出す。
exec "$VENV_DIR/bin/python3" -m uvicorn server:app --host 127.0.0.1 --port 8765
