"""LLMモデルの重みを事前ダウンロードするだけのスクリプト。

サーバー起動(mlx_lm.server)より前に呼ぶことで、初回のチャットリクエストで
突然数分〜数十分待たされる、という事態を避ける。tsunagi(Node)側からはこの
プロセスの実行中、キャッシュディレクトリ内の.incompleteファイルのサイズを
定期的に見て進捗を計算する想定なので、ここでは特別な進捗出力はしない。

第1引数にHugging FaceのリポジトリID(mlx-community/...)を渡す。
省略時はinstructモードのデフォルトモデルを使う。
"""

import sys

from huggingface_hub import snapshot_download

DEFAULT_MODEL_REPO = "mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit"

if __name__ == "__main__":
    repo_id = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_MODEL_REPO
    snapshot_download(repo_id=repo_id)
