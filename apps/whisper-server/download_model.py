"""音声認識モデルの重みを事前ダウンロードするだけのスクリプト。

使い方: python3 download_model.py <Hugging FaceのリポジトリID>
(省略時はWhisper large-v3-turbo)

サーバー起動(server.py)より前に呼ぶことで、初回の文字起こしリクエストで
突然数分待たされる、という事態を避ける。tsunagi(Node)側からはこのプロセスの
実行中、キャッシュディレクトリ内の.incompleteファイルのサイズを定期的に見て
進捗を計算する想定なので、ここでは特別な進捗出力はしない。
"""

import sys

from huggingface_hub import snapshot_download

DEFAULT_MODEL_REPO = "mlx-community/whisper-large-v3-turbo"

if __name__ == "__main__":
    snapshot_download(repo_id=sys.argv[1] if len(sys.argv) > 1 else DEFAULT_MODEL_REPO)
