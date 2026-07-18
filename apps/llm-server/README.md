# llm-server

ローカルLLM対話デモ用サーバー。mlx-lm (Apple Silicon GPU) でチャット応答を生成する。
tsunagi本体はこのサーバーにHTTPでプロキシするだけで、セットアップ・起動は行わない。

## 要件

- macOS (Apple Silicon: M1/M2/M3/M4)
- Python 3.9+ (Xcode Command Line Tools または Homebrew 経由で入手可能)
- 空きディスク容量 約18GB(モデル1つあたり。両モード使う場合は約35GB)

## セットアップ・起動

2つのモードを用意している。用途に応じて起動するプロセスを選ぶ(両方同時に起動することも可能)。

```bash
cd apps/llm-server
./run.sh instruct   # 通常モード。http://127.0.0.1:8766 で待受
./run.sh thinking   # シンキングモード。http://127.0.0.1:8767 で待受
```

初回は`venv`を作成し`requirements.txt`の依存関係(mlx-lm)をインストールしてから起動する(venvは両モードで共有)。
初回起動時にそれぞれのモデルを自動ダウンロードする(約17.2GB/モデル)。

- `instruct`: `mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit`。シンキングを行わず高速。
- `thinking`: `mlx-community/Qwen3-30B-A3B-Thinking-2507-4bit`。回答前に`<think>`ブロックで推論する。

いずれもMoE構成(総30B・実計算に使うアクティブパラメータは約3B)で、denseな32B級モデルよりメモリ帯域あたりの生成速度が出やすい。

`mlx_lm.server`が提供するOpenAI互換の`/v1/chat/completions`(ストリーミング対応)をそのまま公開する。

起動している間、tsunagiのSettingsでローカルLLMを有効にすると`/local-llm`のデモページから利用できる。停止するとデモページはエラーになる。
