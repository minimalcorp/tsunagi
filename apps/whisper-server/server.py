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
from fastapi import FastAPI, File, Form, UploadFile
import mlx_whisper

MODEL = "mlx-community/whisper-large-v3-turbo"
# 無音・雑音区間で「ご視聴ありがとうございました」等の無関係な文章を自信満々に
# 生成してしまう(Whisper系モデルで知られたハルシネーション挙動)ことがあるため、
# no_speech_prob(無音である確率)がこの値を超えるセグメントは出力から除外する。
NO_SPEECH_THRESHOLD = 0.6

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
async def transcribe(file: UploadFile = File(...), prompt: str | None = Form(None)) -> dict:
    data = await file.read()
    audio = decode_to_16k_mono(data)
    # initial_promptは文字起こしのスタイル(表記ゆれ・句読点・固有名詞など)を
    # 誘導するヒントで、tsunagiのSettingsからユーザーが自由に設定できる。
    result = mlx_whisper.transcribe(
        audio, path_or_hf_repo=MODEL, language="ja", initial_prompt=prompt or None
    )

    # result["text"]はno_speech_prob等のフィルタを経ずに全セグメントを結合した
    # ものなので使わず、セグメント単位でno_speech_probを見て自前で組み立て直す。
    segments = result.get("segments")
    if segments:
        text = "".join(
            seg["text"]
            for seg in segments
            if seg.get("no_speech_prob", 0.0) <= NO_SPEECH_THRESHOLD
        )
    else:
        text = result.get("text", "")

    return {"text": text.strip()}
