"""LLMモデルの重みを事前ダウンロードするだけのスクリプト。

サーバー起動(mlx_lm.server)より前に呼ぶことで、初回のチャットリクエストで
突然数分〜数十分待たされる、という事態を避ける。tsunagi(Node)側からはこの
プロセスの実行中、キャッシュディレクトリ内の.incompleteファイルのサイズを
定期的に見て進捗を計算する想定なので、ここでは特別な進捗出力はしない。
"""

from huggingface_hub import snapshot_download

MODEL_REPO = "mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit"

if __name__ == "__main__":
    snapshot_download(repo_id=MODEL_REPO)
