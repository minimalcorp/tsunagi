# whisper-server

ローカル音声入力用サーバー。Apple Silicon GPU (MLX) で文字起こしする。
モデルは起動時の環境変数で切り替える(tsunagiのSettingsで選択したものが渡される)。

| `TSUNAGI_ASR_ENGINE` | `TSUNAGI_ASR_MODEL` の例                                           | 実装          |
| -------------------- | ------------------------------------------------------------------ | ------------- |
| `whisper` (既定)     | `mlx-community/whisper-large-v3-turbo`                             | mlx-whisper   |
| `qwen3-asr`          | `mlx-community/Qwen3-ASR-1.7B-8bit`, `neosophie/Qwen3-ASR-1.7B-JA` | mlx-qwen3-asr |

選択肢の一覧は `apps/server/src/lib/asr-models.ts` で定義する。
tsunagi本体はこのサーバーにHTTPでプロキシするだけで、セットアップ・起動は行わない。

## 要件

- macOS (Apple Silicon: M1/M2/M3/M4)
- Python 3.9+ (Xcode Command Line Tools または Homebrew 経由で入手可能)

ffmpeg等の外部バイナリは不要（音声はブラウザ側のVADで発話区間だけ切り出し、16kHzモノラルWAVで送られる）。

## セットアップ・起動

```bash
cd apps/whisper-server
./run.sh
```

初回はvenvを作成し`requirements.txt`の依存関係(mlx-whisper, mlx-qwen3-asr, fastapi, uvicorn等)をインストールしてから起動する。
`http://127.0.0.1:8765`で待受。初回起動時に指定モデルを自動ダウンロードする。

起動している間、tsunagiのSettingsで音声入力を有効にすると利用できる。停止するとtsunagi側の音声入力はエラーになる。
