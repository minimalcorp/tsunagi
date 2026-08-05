# whisper-server-windows

リモート音声入力用サーバー。faster-whisper (CTranslate2, CUDA) で文字起こしする。
`apps/whisper-server`(mlx-whisper版, Apple Silicon専用)と同じAPI契約
(`/transcribe`, `/health`)を実装しており、Mac側のtsunagiはどちらに接続しても
動作する。

## 要件

- Windows + NVIDIA GPU (CUDA対応)
- Python 3.10+
- `tsunagi whisper` から起動される想定(`apps/cli/src/inference/whisper-command.ts`)。
  WSL2上で実行しているtsunagi CLIが、WSL2のinterop経由でWindowsネイティブの
  Python(venv)としてこのスクリプトを起動する。venv構築・依存関係インストールは
  `tsunagi whisper`が自動で行う。

## モデルの準備(手動)

`tsunagi whisper`はモデルのダウンロードを行わない。初回は事前に手動でモデルを
キャッシュしておく必要がある:

```powershell
<venvのpython.exe> -c "from faster_whisper import WhisperModel; WhisperModel('large-v3-turbo', device='cuda', compute_type='float16')"
```

モデル名・compute_typeは環境変数`TSUNAGI_WHISPER_MODEL`/`TSUNAGI_WHISPER_COMPUTE_TYPE`で
上書きできる(`tsunagi whisper`実行時にも同じ環境変数が使われる)。

## 単体起動(デバッグ用)

```powershell
<venvのpython.exe> server.py
```

`http://0.0.0.0:8765`で待受する。
