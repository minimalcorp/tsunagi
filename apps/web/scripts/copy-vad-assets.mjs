#!/usr/bin/env node
/**
 * 音声入力のVAD(@ricky0123/vad-web)が実行時にfetchするアセットを public/vad/ へコピーする。
 *
 * モデル(.onnx)・AudioWorklet・onnxruntime-webのwasmはバンドラーを通さずURLで読み込まれるため、
 * 静的ファイルとして配信する必要がある。CDNに頼らずローカルで完結させるため node_modules から
 * コピーする（生成物なので public/vad/ は git 管理しない）。predev / prebuild から呼ばれる。
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(WEB_DIR, 'public/vad');
const require = createRequire(import.meta.url);

const vadDist = path.dirname(require.resolve('@ricky0123/vad-web'));
const ortDist = path.dirname(
  require.resolve('onnxruntime-web', { paths: [path.dirname(vadDist)] })
);

const ASSETS = [
  [vadDist, 'silero_vad_v5.onnx'],
  [vadDist, 'vad.worklet.bundle.min.js'],
  [ortDist, 'ort-wasm-simd-threaded.mjs'],
  [ortDist, 'ort-wasm-simd-threaded.wasm'],
];

await fs.mkdir(OUT_DIR, { recursive: true });
for (const [dir, file] of ASSETS) {
  await fs.copyFile(path.join(dir, file), path.join(OUT_DIR, file));
}
console.log(`[copy-vad-assets] copied ${ASSETS.length} files → ${path.relative(WEB_DIR, OUT_DIR)}`);
