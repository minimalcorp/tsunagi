"""ローカルWhisper文字起こしサーバー (mlx-whisper, Apple Silicon GPU)。

ユーザーが手動でセットアップ・起動する常駐プロセス。モデルをメモリに保持し続け
リクエスト毎のロード待ちを避ける。tsunagi本体(Fastify)からHTTPでプロキシされる。

音声はtsunagi側(ブラウザのWeb Audio API)で16kHzモノラルWAVに変換済みのものを
受け取る想定。Pythonの標準ライブラリ`wave`で読み込みnumpy配列として直接
mlx_whisper.transcribeに渡すため、ffmpeg等の外部バイナリは不要。
"""

import wave

import numpy as np
from fastapi import FastAPI, File, UploadFile
import mlx_whisper

MODEL = "mlx-community/whisper-large-v3-turbo"

app = FastAPI()


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "model": MODEL}


def read_wav_as_float32(data: bytes) -> np.ndarray:
    import io

    with wave.open(io.BytesIO(data), "rb") as wf:
        if wf.getframerate() != 16000:
            raise ValueError(f"expected 16kHz WAV, got {wf.getframerate()}Hz")
        if wf.getnchannels() != 1:
            raise ValueError("expected mono WAV")
        if wf.getsampwidth() != 2:
            raise ValueError("expected 16-bit PCM WAV")
        frames = wf.readframes(wf.getnframes())
    return np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)) -> dict:
    data = await file.read()
    audio = read_wav_as_float32(data)
    result = mlx_whisper.transcribe(audio, path_or_hf_repo=MODEL, language="ja")
    return {"text": result["text"].strip()}
