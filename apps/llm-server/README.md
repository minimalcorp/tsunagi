# llm-server

ローカルLLM対話デモ用サーバー。mlx-lm (Apple Silicon GPU) でチャット応答を生成する。
tsunagi本体はこのサーバーにHTTPでプロキシするだけで、セットアップ・起動は行わない。

## 要件

- macOS (Apple Silicon: M1/M2/M3/M4)
- Python 3.9+ (Xcode Command Line Tools または Homebrew 経由で入手可能)
- 空きディスク容量 約18GB(モデル本体)

## セットアップ・起動

```bash
cd apps/llm-server
./run.sh
```

初回は`venv`を作成し`requirements.txt`の依存関係(mlx-lm)をインストールしてから起動する。
`http://127.0.0.1:8766`で待受。初回起動時にモデル(mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit,
約17.2GB)を自動ダウンロードする。MoE構成(総30B・実計算に使うアクティブパラメータは約3B)で、
denseな32B級モデルよりメモリ帯域あたりの生成速度が出やすい。

`mlx_lm.server`が提供するOpenAI互換の`/v1/chat/completions`(ストリーミング対応)をそのまま公開する。

起動している間、tsunagiのSettingsでローカルLLMを有効にすると`/local-llm`のデモページから利用できる。停止するとデモページはエラーになる。
