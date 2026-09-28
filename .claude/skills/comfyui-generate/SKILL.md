---
name: comfyui-generate
description: ローカルのComfyUI（Windowsネイティブ、http://localhost:8188）を使って画像・3Dモデル・効果音を生成する。ユーザーから「画像を生成して」「3Dモデルを作って」「効果音/SFXを作って」等の依頼があった時に使用する。
---

## 前提

- ComfyUIはWindowsネイティブ側で1サーバーとして稼働している（画像・3D・音声を同じサーバーが処理する。別々のサーバーではない）
- WSL2からは`http://localhost:8188`にHTTP到達できる（`.wslconfig`の`networkingMode=mirrored`のおかげ、ポートフォワード不要）
- 詳しい経緯・検証結果はプロジェクトの`CLAUDE.md`の「ローカル生成AI（画像・3D・効果音）との連携」を参照

## 必ず守ること：生成処理は直接行わず、`comfyui-worker` subagentに委譲する

このスキルの役割は「委譲するかどうかの判断」と「何を依頼するかの整理」のみ。ワークフローJSONの構築・APIへの投入・完了までのポーリング・バリデーションエラー時の修正といった**ノイズの多い工程はメインセッションで直接行わない**。必ず`comfyui-worker` subagentを起動すること（Agentツール、`subagent_type: "comfyui-worker"`）。

理由: 3Dモデル生成は60ノード超のワークフローで、生成に数分かかり、途中のJSON payload・エラーメッセージ・ポーリングログがそのままだとメインセッションのコンテキストを大量に消費する。これらはsubagent内に閉じ込め、メインセッションには「生成物のパス＋成否」だけを返す。

## comfyui-worker への依頼の書き方

以下を明記してプロンプトに含めること:

1. **種別**: `image`（画像） / `sfx`（効果音） / `model3d`（3Dモデル）
2. **内容**: 生成したいものの具体的な説明（英語プロンプトが望ましいが日本語でも良い。worker側で翻訳・整形する）
3. **出力先**: worktree内の保存先パス。原則 `.claude/skills/comfyui-generate/output/<種別>/<わかりやすいファイル名>` を使う（`.gitignore`済み）
4. **model3dの場合の追加情報**: 既存の画像ファイル（worktree内のパス）があればそれを渡す。無ければテキスト説明だけで良い（workerが自動でベース画像を生成してから3D化する。数分かかる旨をユーザーに伝えること）
5. **imageの場合、エンジン指定を省略可能**: 特に指定がなければ既定の`zimage`（Z-Image Turbo）を使う。ユーザーが明示的に別エンジンを指定した場合、または`zimage`の結果に何らかの問題（ロゴ・文字の写り込み、形状の歪み等）があり別エンジンで試したい場合のみ`--engine`を変える（下記「対応している画像生成エンジン」参照）

## 対応している生成の種類

| 種別    | モデル                         | 特徴・制約                                                                                                                                              |
| ------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| image   | 複数エンジンから選択可（下表） | 既定は`zimage`(Z-Image Turbo)                                                                                                                           |
| sfx     | Stable Audio Open 1.0          | 最短1.0秒（それより短い単発音は生成後にffmpeg等でトリムする方針で依頼する）                                                                             |
| model3d | TRELLIS.2 + Pixal3D            | 画像1枚が入力。数分かかる。出力はGLB(PBRテクスチャ付き、数十MB)。人物+乗り物のようなアニメーション付与は別工程（Blender等）が必要で、このスキルの対象外 |

## 対応している画像生成エンジン（`image --engine <name>`）

| engine値         | モデル                                               | ライセンス                                          | 特徴・使い分け                                                                                                                                                                                                                                                                                    |
| ---------------- | ---------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `zimage`（既定） | Z-Image Turbo (INT8)                                 | Apache 2.0（商用可）                                | 8 step、数秒〜十数秒。**基本はこれを使う**                                                                                                                                                                                                                                                        |
| `flux2klein`     | FLUX.2 Klein 4B (distilled, fp8)                     | Apache 2.0（商用可、無条件）                        | 4 step。ブランドロゴ的な写り込みが出にくい傾向を確認済みだが、フレーム形状にわずかな歪みが出ることがある（ユーザー評価済み）                                                                                                                                                                      |
| `sd35large`      | SD3.5 Large (fp8 scaled、単一チェックポイント14.9GB) | Stability AI Community License（年商$1M未満は無償） | 画質は3エンジン中最も高い（写真としての説得力が高い）が、チェックポイント自体がVRAM(12GB)を超えるためRAMオフロードが発生し生成が遅い（実測30秒程度）。プロンプトの書き方次第で背景・情景まで描写されやすい傾向があるので、単体を撮りたい場合は「plain background, product photo」等を明示すること |

いずれのエンジンでも、ロードバイクのようなブランド性の強い製品を描くと**ダウンチューブに架空ロゴが写り込む傾向**がモデルを問わず共通して見られる（Z-Image Turbo/SD3.5 Largeで確認済み）。プロンプトで強く「no logo」を指定しても解消しないことが多いので、気にする用途では期待値を調整すること。

新しいエンジンを追加する場合は`comfy_client.py`に`build_<engine>_workflow()`を追加し、`cmd_image`の分岐と`--engine`の`choices`に加える。

## 実装

実体は`.claude/skills/comfyui-generate/scripts/comfy_client.py`（標準ライブラリのみ、WSL2のplain python3で動く）。`comfyui-worker`がこれを呼び出す。

```
python3 <このディレクトリ>/scripts/comfy_client.py image "<prompt>" --out <path>
python3 <このディレクトリ>/scripts/comfy_client.py image "<prompt>" --engine flux2klein --out <path>
python3 <このディレクトリ>/scripts/comfy_client.py sfx "<prompt>" --seconds 1.0 --out <path>
python3 <このディレクトリ>/scripts/comfy_client.py model3d --image <path> --out <path>
python3 <このディレクトリ>/scripts/comfy_client.py model3d --prompt "<prompt>" --out <path>
```

成功時は`{"ok": true, "output": "<path>", ...}`を1行のJSONで標準出力に返す。失敗時は`{"ok": false, "error": "..."}`。

## ComfyUIが起動していない場合

`curl -s http://localhost:8188/system_stats`で確認できる。到達できない場合、**Claude Codeから起動を試みない**（Windows側の既存プロセスを誤って操作するリスクがあるため）。ユーザーに「ComfyUIが起動していないようです、Windows側で起動してください」と伝える。
