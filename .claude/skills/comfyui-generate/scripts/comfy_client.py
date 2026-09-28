#!/usr/bin/env python3
"""ComfyUI (Windows ネイティブ、http://localhost:8188) を叩いて画像/3Dモデル/効果音を
生成するCLI。標準ライブラリのみ使用（WSL2側のplain python3で動く）。

検証済みワークフロー（2026-09-29、~/.tsunagi/workspaces/.../feat-local-llm-skill で実施した
手動検証をそのまま移植したもの）:
  - image : Z-Image Turbo (INT8) txt2img
  - sfx   : Stable Audio Open 1.0 text2audio
  - model3d: TRELLIS.2 + Pixal3D image-to-3D（60ノード超、テンプレートJSONを流用）

使い方:
  python3 comfy_client.py image "a red road bicycle, photorealistic" --out out.png
  python3 comfy_client.py sfx "a single low-pitched countdown beep" --seconds 1.0 --out beep.flac
  python3 comfy_client.py model3d --prompt "a road bicycle, side view, white background" --out bike.glb
  python3 comfy_client.py model3d --image ./roubaix.jpg --out bike.glb

いずれも成功時は最後の行に `{"ok": true, "output": "<保存先パス>", ...}` のJSONを1行で出力する。
失敗時は `{"ok": false, "error": "..."}`。
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

SERVER = os.environ.get("COMFY_SERVER", "127.0.0.1:8188")
SCRIPT_DIR = Path(__file__).resolve().parent
TRELLIS2_TEMPLATE = SCRIPT_DIR / "workflows" / "trellis2_pixal3d_template.json"


# ---- 低レベルHTTP ---------------------------------------------------------

def _post(path: str, payload: dict) -> dict:
    req = urllib.request.Request(
        f"http://{SERVER}{path}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        raise RuntimeError(f"HTTP {e.code} on {path}: {body[:3000]}") from None


def _get(path: str) -> dict:
    with urllib.request.urlopen(f"http://{SERVER}{path}", timeout=30) as r:
        return json.loads(r.read())


def server_ready() -> bool:
    try:
        _get("/system_stats")
        return True
    except (urllib.error.URLError, OSError):
        return False


def submit(graph: dict, client_id: str | None = None) -> str:
    client_id = client_id or str(uuid.uuid4())
    resp = _post("/prompt", {"prompt": graph, "client_id": client_id})
    if resp.get("node_errors"):
        raise RuntimeError(f"validation failed: {json.dumps(resp['node_errors'], ensure_ascii=False)[:2000]}")
    return resp["prompt_id"]


def wait(prompt_id: str, timeout: float = 600.0, poll: float = 2.0) -> dict:
    """完了まで待ち、history の outputs をそのまま返す。"""
    deadline = time.time() + timeout
    while time.time() < deadline:
        hist = _get(f"/history/{prompt_id}")
        entry = hist.get(prompt_id)
        if entry:
            status = entry.get("status", {})
            if status.get("status_str") == "error":
                raise RuntimeError(f"generation failed: {json.dumps(status.get('messages', []), ensure_ascii=False)[:2000]}")
            if status.get("completed"):
                return entry.get("outputs", {})
        time.sleep(poll)
    raise TimeoutError(f"timed out waiting for {prompt_id}")


def run(graph: dict, timeout: float = 600.0) -> dict:
    return wait(submit(graph), timeout=timeout)


def download(filename: str, subfolder: str = "", type_: str = "output", dest: str | Path = None) -> Path:
    from urllib.parse import urlencode
    qs = urlencode({"filename": filename, "subfolder": subfolder, "type": type_})
    with urllib.request.urlopen(f"http://{SERVER}/view?{qs}", timeout=120) as r:
        data = r.read()
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return dest


def upload_image(local_path: str | Path, subfolder: str = "") -> str:
    """ComfyUI の input/ フォルダへ画像をアップロードする（/upload/image、multipart）。
    Windows のファイルシステムに直接触らずに済む。戻り値はComfyUI側でのfilename。"""
    local_path = Path(local_path)
    boundary = uuid.uuid4().hex
    mime = mimetypes.guess_type(str(local_path))[0] or "application/octet-stream"
    data = local_path.read_bytes()

    parts = []
    parts.append(f"--{boundary}\r\n".encode())
    parts.append(
        f'Content-Disposition: form-data; name="image"; filename="{local_path.name}"\r\n'.encode()
    )
    parts.append(f"Content-Type: {mime}\r\n\r\n".encode())
    parts.append(data)
    parts.append(f"\r\n--{boundary}\r\n".encode())
    parts.append(b'Content-Disposition: form-data; name="subfolder"\r\n\r\n')
    parts.append(subfolder.encode())
    parts.append(f"\r\n--{boundary}\r\n".encode())
    parts.append(b'Content-Disposition: form-data; name="overwrite"\r\n\r\n')
    parts.append(b"true")
    parts.append(f"\r\n--{boundary}--\r\n".encode())
    body = b"".join(parts)

    req = urllib.request.Request(
        f"http://{SERVER}/upload/image",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        resp = json.loads(r.read())
    return resp["name"]


# ---- ワークフロー構築（検証済み） -----------------------------------------

def build_zimage_workflow(prompt: str, negative: str = "", width: int = 1024, height: int = 1024,
                           seed: int | None = None, filename_prefix: str = "gen") -> dict:
    """Z-Image Turbo (INT8) txt2img。8 step / cfg 1 で足りる（蒸留モデル）。"""
    seed = seed if seed is not None else int(time.time()) % 2**32
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "z_image_turbo_int8_convrot.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen_3_4b_fp8_mixed.safetensors", "type": "lumina2", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "z_image_ae.safetensors"}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": prompt}},
        "5": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["4", 0]}},
        "6": {"class_type": "EmptySD3LatentImage", "inputs": {"width": width, "height": height, "batch_size": 1}},
        "7": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["1", 0], "shift": 3}},
        "8": {"class_type": "KSampler", "inputs": {
            "model": ["7", 0], "positive": ["4", 0], "negative": ["5", 0], "latent_image": ["6", 0],
            "seed": seed, "steps": 8, "cfg": 1, "sampler_name": "res_multistep", "scheduler": "simple", "denoise": 1,
        }},
        "9": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
        "10": {"class_type": "SaveImage", "inputs": {"images": ["9", 0], "filename_prefix": filename_prefix}},
    }


def build_flux2klein_workflow(prompt: str, width: int = 1024, height: int = 1024,
                               seed: int | None = None, filename_prefix: str = "gen") -> dict:
    """FLUX.2 Klein 4B (distilled) txt2img。比較用の別エンジン。
    4 step / cfg 1 で足りる（蒸留モデル）。SamplerCustomAdvanced系のパイプライン
    （公式テンプレート image_flux2_klein_text_to_image.json の distilled subgraphを移植）。
    UNETLoaderのweight_dtypeをfp8_e4m3fnにしてVRAMを抑えている（12GB環境向け）。
    """
    seed = seed if seed is not None else int(time.time()) % 2**32
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "flux-2-klein-4b.safetensors", "weight_dtype": "fp8_e4m3fn"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen_3_4b_fp4_flux2.safetensors", "type": "flux2", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "flux2-vae.safetensors"}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": prompt}},
        "5": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["4", 0]}},
        "6": {"class_type": "EmptyFlux2LatentImage", "inputs": {"width": width, "height": height, "batch_size": 1}},
        "7": {"class_type": "Flux2Scheduler", "inputs": {"steps": 4, "width": width, "height": height}},
        "8": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
        "9": {"class_type": "CFGGuider", "inputs": {"model": ["1", 0], "positive": ["4", 0], "negative": ["5", 0], "cfg": 1}},
        "10": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
        "11": {"class_type": "SamplerCustomAdvanced", "inputs": {
            "noise": ["10", 0], "guider": ["9", 0], "sampler": ["8", 0], "sigmas": ["7", 0], "latent_image": ["6", 0],
        }},
        "12": {"class_type": "VAEDecode", "inputs": {"samples": ["11", 0], "vae": ["3", 0]}},
        "13": {"class_type": "SaveImage", "inputs": {"images": ["12", 0], "filename_prefix": filename_prefix}},
    }


def build_sd35large_workflow(prompt: str, negative: str = "", width: int = 1024, height: int = 1024,
                              seed: int | None = None, filename_prefix: str = "gen") -> dict:
    """SD3.5 Large (fp8 scaled, 単一チェックポイント14.9GB)。比較用の別エンジン。
    チェックポイント自体がVRAM(12GB)を超えるが、ComfyUIの自動RAMオフロードで動作する
    （実測30秒程度、クラッシュしない）。画質は3エンジン中最も高いが生成が遅く・重い。
    steps 20 / cfg 4.01 / euler / sgm_uniform が公式サンプル値。
    """
    seed = seed if seed is not None else int(time.time()) % 2**32
    return {
        "4": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "sd3.5_large_fp8_scaled.safetensors"}},
        "16": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["4", 1], "text": prompt}},
        "40": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["4", 1], "text": negative}},
        "53": {"class_type": "EmptySD3LatentImage", "inputs": {"width": width, "height": height, "batch_size": 1}},
        "3": {"class_type": "KSampler", "inputs": {
            "model": ["4", 0], "positive": ["16", 0], "negative": ["40", 0], "latent_image": ["53", 0],
            "seed": seed, "steps": 20, "cfg": 4.01, "sampler_name": "euler", "scheduler": "sgm_uniform", "denoise": 1,
        }},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
        "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0], "filename_prefix": filename_prefix}},
    }


def build_stable_audio_workflow(prompt: str, seconds: float = 1.0, seed: int | None = None,
                                 filename_prefix: str = "audio/gen") -> dict:
    """Stable Audio Open 1.0 text2audio。steps 50 / cfg 4.98 / dpmpp_3m_sde_gpu が既定推奨値。
    EmptyLatentAudio.seconds は下限1.0秒（それより短い単発ビープ等は生成後にトリムする）。"""
    seed = seed if seed is not None else int(time.time()) % 2**32
    seconds = max(1.0, seconds)
    return {
        "4": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "stable-audio-open-1.0.safetensors"}},
        "10": {"class_type": "CLIPLoader", "inputs": {"clip_name": "t5-base.safetensors", "type": "stable_audio", "device": "default"}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["10", 0], "text": prompt}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["10", 0], "text": ""}},
        "11": {"class_type": "EmptyLatentAudio", "inputs": {"seconds": seconds, "batch_size": 1}},
        "3": {"class_type": "KSampler", "inputs": {
            "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["11", 0],
            "seed": seed, "steps": 50, "cfg": 4.98, "sampler_name": "dpmpp_3m_sde_gpu", "scheduler": "exponential", "denoise": 1,
        }},
        "12": {"class_type": "VAEDecodeAudio", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
        "20": {"class_type": "SaveAudioAdvanced", "inputs": {"audio": ["12", 0], "filename_prefix": filename_prefix, "format": "flac"}},
    }


def build_trellis2_workflow(image_filename: str, seed: int | None = None,
                             filename_prefix: str = "3d/gen") -> dict:
    """TRELLIS.2 + Pixal3D image-to-3D。テンプレート(63ノード、動的コンボ/リンク解決済み)を
    ロードして LoadImage・seed・出力prefixだけ差し替える。
    ワークフロー自体の構造は変更しないこと（widgets_valuesの位置ずれ等で壊れるリスクが高い）。
    """
    graph = json.loads(TRELLIS2_TEMPLATE.read_text())["prompt"]
    graph["122"]["inputs"]["image"] = image_filename
    if seed is not None:
        for nid in ("3", "12", "18", "23"):
            if nid in graph:
                graph[nid]["inputs"]["seed"] = seed
    graph["322"]["inputs"]["filename_prefix"] = filename_prefix
    return graph


# ---- CLI -------------------------------------------------------------------

def _collect_outputs(outputs: dict, key: str) -> list[dict]:
    found = []
    for node_out in outputs.values():
        for item in node_out.get(key, []) or []:
            found.append(item)
    return found


def cmd_image(args):
    if args.engine == "flux2klein":
        graph = build_flux2klein_workflow(args.prompt, width=args.width, height=args.height,
                                           seed=args.seed, filename_prefix="skill-image-flux2klein")
    elif args.engine == "sd35large":
        graph = build_sd35large_workflow(args.prompt, negative=args.negative or "",
                                          width=args.width, height=args.height,
                                          seed=args.seed, filename_prefix="skill-image-sd35large")
    else:
        graph = build_zimage_workflow(args.prompt, negative=args.negative or "",
                                       width=args.width, height=args.height,
                                       seed=args.seed, filename_prefix="skill-image")
    timeout = 300 if args.engine == "sd35large" else 180
    outputs = run(graph, timeout=timeout)
    images = _collect_outputs(outputs, "images")
    if not images:
        raise RuntimeError(f"no image output: {outputs}")
    img = images[0]
    dest = download(img["filename"], img.get("subfolder", ""), img.get("type", "output"), args.out)
    print(json.dumps({"ok": True, "output": str(dest), "kind": "image", "engine": args.engine}, ensure_ascii=False))


def cmd_sfx(args):
    graph = build_stable_audio_workflow(args.prompt, seconds=args.seconds, seed=args.seed,
                                         filename_prefix="audio/skill-sfx")
    outputs = run(graph, timeout=180)
    audios = _collect_outputs(outputs, "audio")
    if not audios:
        raise RuntimeError(f"no audio output: {outputs}")
    a = audios[0]
    dest = download(a["filename"], a.get("subfolder", ""), a.get("type", "output"), args.out)
    print(json.dumps({"ok": True, "output": str(dest), "kind": "audio"}, ensure_ascii=False))


def cmd_model3d(args):
    if args.image:
        image_filename = upload_image(args.image)
        source_note = f"uploaded local image {args.image}"
    elif args.prompt:
        # 画像未指定ならまずZ-Image Turboでベース画像を生成（3D化しやすいよう単体・白背景を明示）
        img_prompt = f"{args.prompt}, single object centered, plain white background, product photo, studio lighting"
        img_graph = build_zimage_workflow(img_prompt, filename_prefix="skill-image-for-3d")
        img_outputs = run(img_graph, timeout=180)
        images = _collect_outputs(img_outputs, "images")
        if not images:
            raise RuntimeError(f"base image generation failed: {img_outputs}")
        base_img = images[0]
        # ComfyUIのoutputに出た画像を、input側にもコピー（LoadImageはinput/を見るため）
        tmp_local = Path("/tmp") / f"_3d_base_{uuid.uuid4().hex}.png"
        download(base_img["filename"], base_img.get("subfolder", ""), base_img.get("type", "output"), tmp_local)
        image_filename = upload_image(tmp_local)
        tmp_local.unlink(missing_ok=True)
        source_note = f"auto-generated base image from prompt: {args.prompt}"
    else:
        raise SystemExit("model3d には --image か --prompt のいずれかが必要です")

    graph = build_trellis2_workflow(image_filename, seed=args.seed, filename_prefix="3d/skill-model")
    outputs = run(graph, timeout=600)
    # Save3DAdvanced (node 322) の '3d' 出力を優先的に探す
    models = _collect_outputs(outputs, "3d") or _collect_outputs(outputs, "result")
    if not models:
        raise RuntimeError(f"no 3d output: {outputs}")
    m = models[0]
    if isinstance(m, dict):
        dest = download(m["filename"], m.get("subfolder", ""), m.get("type", "output"), args.out)
    else:
        raise RuntimeError(f"unexpected 3d output format: {m}")
    print(json.dumps({"ok": True, "output": str(dest), "kind": "model3d", "source": source_note}, ensure_ascii=False))


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("image", help="画像生成（Z-Image Turbo / FLUX.2 Klein / SD3.5 Large）")
    p.add_argument("prompt")
    p.add_argument("--negative", default="")
    p.add_argument("--engine", choices=["zimage", "flux2klein", "sd35large"], default="zimage",
                    help="zimage=Z-Image Turbo（既定）, flux2klein=FLUX.2 Klein 4B distilled, "
                         "sd35large=SD3.5 Large fp8（画質最高だがVRAM超過・生成が遅い、RAMオフロードで動作）")
    p.add_argument("--width", type=int, default=1024)
    p.add_argument("--height", type=int, default=1024)
    p.add_argument("--seed", type=int, default=None)
    p.add_argument("--out", required=True)
    p.set_defaults(func=cmd_image)

    p = sub.add_parser("sfx", help="Stable Audio Openで効果音生成")
    p.add_argument("prompt")
    p.add_argument("--seconds", type=float, default=1.0)
    p.add_argument("--seed", type=int, default=None)
    p.add_argument("--out", required=True)
    p.set_defaults(func=cmd_sfx)

    p = sub.add_parser("model3d", help="TRELLIS.2+Pixal3Dで画像から3Dモデル生成")
    p.add_argument("--image", default=None, help="ローカル画像パス（優先）")
    p.add_argument("--prompt", default=None, help="画像が無い場合、まずこれでベース画像を生成する")
    p.add_argument("--seed", type=int, default=None)
    p.add_argument("--out", required=True)
    p.set_defaults(func=cmd_model3d)

    args = ap.parse_args()

    if not server_ready():
        print(json.dumps({"ok": False, "error": f"ComfyUI ({SERVER}) に到達できません。起動しているか確認してください。"}))
        sys.exit(1)

    try:
        args.func(args)
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(e)[:4000]}, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
