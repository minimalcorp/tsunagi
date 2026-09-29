"""ローカルWhisper文字起こしサーバー (mlx-whisper, Apple Silicon GPU)。

ユーザーが手動でセットアップ・起動する常駐プロセス。モデルをメモリに保持し続け
リクエスト毎のロード待ちを避ける。tsunagi本体(Fastify)からHTTPでプロキシされる。

音声はブラウザ側のVAD(Silero VAD)で発話区間だけを切り出した16kHzモノラルWAVを受け取る。
デコードにはPyAV(`av`)を使う(WAV以外の形式もそのままデコードできる)。ffmpegの内部コーデックをホイールに同梱しており、
システムにffmpegバイナリをインストールする必要はない。
"""

import io
import re
import threading
from typing import Optional

import av
import numpy as np
from fastapi import FastAPI, File, Form, UploadFile
import mlx_whisper

MODEL = "mlx-community/whisper-large-v3-turbo"
# 無音・雑音区間で「ご視聴ありがとうございました」等の無関係な文章を自信満々に
# 生成してしまう(Whisper系モデルで知られたハルシネーション挙動)ことがあるため、
# no_speech_prob(無音である確率)がこの値を超えるセグメントは出力から除外する。
NO_SPEECH_THRESHOLD = 0.6
# ただしno_speech_probは30秒の窓ごとに1回しか計算されず、窓内の全セグメントに同じ値が
# コピーされる。そのため「発話+末尾の無音」を含む窓では、無音部分から生成された定型文も
# 発話ありと判定されて素通りする。これを補うため、発話より後ろ(または前)の無音区間に
# 現れた異常セグメントを読み飛ばすmlx_whisper組込みの判定(要word_timestamps)を有効にする。
HALLUCINATION_SILENCE_THRESHOLD = 2.0
# それでも残った場合の最終防衛線。YouTube字幕由来の典型的なハルシネーションで、
# セグメント全体が(句読点・空白を除いて)これらと完全一致する場合のみ除外する。
# 部分一致にしないのは、ユーザーが実際にこれらの語を含む文を話すケースを壊さないため。
HALLUCINATION_PHRASES = {
    "ご視聴ありがとうございました",
    "ご視聴ありがとうございます",
    "最後までご視聴いただきありがとうございました",
    "最後までご視聴ありがとうございました",
    "チャンネル登録お願いします",
    "チャンネル登録をお願いします",
    "チャンネル登録よろしくお願いします",
    "次回もお楽しみに",
    "次回予告",
    "おやすみなさい",
}
_NORMALIZE_RE = re.compile(r"[\s、。，．,.！!？?・…「」『』（）()\[\]〜~♪]+")

# mlx_whisperの推論は同時実行を想定していないため直列化する。エンドポイント自体は
# 同期関数にしてスレッドプールで実行させ、推論中も/healthが応答できるようにする
# (途中経過の表示で文字起こしリクエストが連続しても、起動状態のポーリングが
# タイムアウトしてUIが「未起動」扱いになるのを防ぐ)。
_transcribe_lock = threading.Lock()

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


def is_hallucination_phrase(text: str) -> bool:
    return _NORMALIZE_RE.sub("", text) in HALLUCINATION_PHRASES


@app.post("/transcribe")
def transcribe(file: UploadFile = File(...), prompt: Optional[str] = Form(None)) -> dict:
    data = file.file.read()
    audio = decode_to_16k_mono(data)
    if audio.size == 0:
        return {"text": ""}
    # initial_promptは文字起こしのスタイル(表記ゆれ・句読点・固有名詞など)を
    # 誘導するヒントで、tsunagiのSettingsからユーザーが自由に設定できる。
    with _transcribe_lock:
        result = mlx_whisper.transcribe(
            audio,
            path_or_hf_repo=MODEL,
            language="ja",
            initial_prompt=prompt or None,
            # 前の窓の出力を次の窓のプロンプトに引き継ぐと、一度出たハルシネーションが
            # 後続の窓へ連鎖しやすくなるため無効化する。
            condition_on_previous_text=False,
            word_timestamps=True,
            hallucination_silence_threshold=HALLUCINATION_SILENCE_THRESHOLD,
        )

    # result["text"]はno_speech_prob等のフィルタを経ずに全セグメントを結合した
    # ものなので使わず、セグメント単位でno_speech_probを見て自前で組み立て直す。
    segments = result.get("segments")
    if segments:
        text = "".join(
            seg["text"]
            for seg in segments
            if seg.get("no_speech_prob", 0.0) <= NO_SPEECH_THRESHOLD
            and not is_hallucination_phrase(seg["text"])
        )
    else:
        text = result.get("text", "")
        if is_hallucination_phrase(text):
            text = ""

    return {"text": text.strip()}
