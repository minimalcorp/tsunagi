"""Whisperモデルの重みを事前ダウンロードするだけのスクリプト。

サーバー起動(server.py)より前に呼ぶことで、初回の文字起こしリクエストで
突然数分待たされる、という事態を避ける。tsunagi(Node)側からはこのプロセスの
実行中、キャッシュディレクトリ内の.incompleteファイルのサイズを定期的に見て
進捗を計算する想定なので、ここでは特別な進捗出力はしない。
"""

from huggingface_hub import snapshot_download

MODEL_REPO = "mlx-community/whisper-large-v3-turbo"

if __name__ == "__main__":
    snapshot_download(repo_id=MODEL_REPO)
