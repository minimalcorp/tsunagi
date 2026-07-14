# whisper-server

ローカル音声入力用サーバー。mlx-whisper (Apple Silicon GPU) で文字起こしする。
tsunagi本体はこのサーバーにHTTPでプロキシするだけで、セットアップ・起動は行わない。

## 要件

- macOS (Apple Silicon: M1/M2/M3/M4)
- Python 3.9+ (Xcode Command Line Tools または Homebrew 経由で入手可能)

ffmpeg等の外部バイナリは不要（音声はブラウザ側で16kHzモノラルWAVに変換して送られる）。

## セットアップ・起動

```bash
cd apps/whisper-server
./run.sh
```

初回は`.venv`を作成し`requirements.txt`の依存関係(mlx-whisper, fastapi, uvicorn等)をインストールしてから起動する。
`http://127.0.0.1:8765`で待受。初回起動時にWhisperモデル(mlx-community/whisper-large-v3-turbo, 約1.5GB)を自動ダウンロードする。

起動している間、tsunagiのSettingsで音声入力を有効にすると利用できる。停止するとtsunagi側の音声入力はエラーになる。
