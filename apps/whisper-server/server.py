"""ローカルWhisper文字起こしサーバー (mlx-whisper, Apple Silicon GPU)。

ユーザーが手動でセットアップ・起動する常駐プロセス。モデルをメモリに保持し続け
リクエスト毎のロード待ちを避ける。tsunagi本体(Fastify)からHTTPでプロキシされる。

音声はブラウザのMediaRecorderが生成する元のwebm/opusをそのまま受け取る
（クライアント側でのWAV再エンコードは行わない。Opus圧縮は録音時点で既に
発生しているため、無圧縮WAVへ変換し直しても音質は改善せず転送量が増えるだけ）。
デコードにはPyAV(`av`)を使う。ffmpegの内部コーデックをホイールに同梱しており、
システムにffmpegバイナリをインストールする必要はない。
"""

import io

import av
import numpy as np
from fastapi import FastAPI, File, UploadFile
import mlx_whisper

MODEL = "mlx-community/whisper-large-v3-turbo"

app = FastAPI()


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "model": MODEL}


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
async def transcribe(file: UploadFile = File(...)) -> dict:
    data = await file.read()
    audio = decode_to_16k_mono(data)
    result = mlx_whisper.transcribe(audio, path_or_hf_repo=MODEL, language="ja")
    return {"text": result["text"].strip()}
