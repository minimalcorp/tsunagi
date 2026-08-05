"""リモートWhisper文字起こしサーバー (faster-whisper, Windows/CUDA)。

`tsunagi whisper` (apps/cli/src/inference/whisper-command.ts) がWSL2の
interop経由でWindowsネイティブプロセスとして起動する。apps/whisper-server
(mlx-whisper版, Apple Silicon専用)と同じAPI契約(`/transcribe`: multipart
`file`+`prompt` → `{text}`, `/health`)を実装し、tsunagi本体(Mac)の
`whisper.ts`クライアント側は無改修で両対応できるようにしている。

音声デコード処理はapps/whisper-server/server.pyと同一(PyAV経由でffmpeg内蔵、
16kHzモノラルへリサンプル)。faster-whisperはCTranslate2ベースで、
`model.transcribe()`が返すセグメントにもmlx-whisper同様`no_speech_prob`が
含まれるため、無音区間のハルシネーション対策ロジックもそのまま踏襲している。
"""

import io
import os
from typing import Optional

import av
import numpy as np
from fastapi import FastAPI, File, Form, UploadFile
from faster_whisper import WhisperModel

# openai/whisperの命名(例: "large-v3-turbo")をそのまま指定する。faster-whisperが
# 内部でCTranslate2変換済みモデルのHugging Face repoを解決してダウンロードする。
# Mac側ローカルモード(mlx-community/whisper-large-v3-turbo)に合わせた既定値だが、
# CTranslate2変換版の提供状況により調整が必要な場合は環境変数で上書きする。
MODEL_SIZE = os.environ.get("TSUNAGI_WHISPER_MODEL", "large-v3-turbo")
# Ampere(RTX 3080 Ti等)はfloat16のTensorコアを持つため既定はfloat16。
# VRAMが厳しい場合は環境変数でint8_float16等に切り替え可能にしている。
COMPUTE_TYPE = os.environ.get("TSUNAGI_WHISPER_COMPUTE_TYPE", "float16")
# 無音・雑音区間で無関係な文章を自信満々に生成してしまう(Whisper系モデルで
# 知られたハルシネーション挙動)ことがあるため、no_speech_prob(無音である確率)が
# この値を超えるセグメントは出力から除外する(apps/whisper-server/server.pyと同一)。
NO_SPEECH_THRESHOLD = 0.6

app = FastAPI()

# プロセス起動時に一度だけロードし、リクエスト毎のロード待ちを避ける。
# local_files_only=Trueにより、モデル未キャッシュ時は自動ダウンロードせず即座に
# エラーで落ちる(モデル管理はtsunagi CLIの責務外とする方針のため)。
# 初回は先にREADME記載のコマンドで手動キャッシュしておく必要がある。
model = WhisperModel(MODEL_SIZE, device="cuda", compute_type=COMPUTE_TYPE, local_files_only=True)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "model": MODEL_SIZE}


def decode_to_16k_mono(data: bytes) -> np.ndarray:
    container = av.open(io.BytesIO(data))
    stream = container.streams.audio[0]
    resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)

    chunks = []
    for frame in container.decode(stream):
        for resampled in resampler.resample(frame):
            chunks.append(resampled.to_ndarray().reshape(-1))
    container.close()

    if not chunks:
        return np.zeros(0, dtype=np.float32)
    samples = np.concatenate(chunks).astype(np.float32) / 32768.0
    return samples


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...), prompt: Optional[str] = Form(None)) -> dict:
    data = await file.read()
    audio = decode_to_16k_mono(data)
    # initial_promptは文字起こしのスタイル(表記ゆれ・句読点・固有名詞など)を
    # 誘導するヒントで、tsunagiのSettingsからユーザーが自由に設定できる。
    segments, _info = model.transcribe(
        audio, language="ja", initial_prompt=prompt or None
    )

    text = "".join(
        seg.text for seg in segments if getattr(seg, "no_speech_prob", 0.0) <= NO_SPEECH_THRESHOLD
    )

    return {"text": text.strip()}


if __name__ == "__main__":
    import uvicorn

    # WSL2側からwslpath変換したこのファイルの絶対パスを直接指定して起動するため、
    # (import文字列でなく)ここでアプリオブジェクトを渡して起動する。
    uvicorn.run(app, host="0.0.0.0", port=8765)
