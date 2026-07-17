import { type ChildProcess, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const LLM_SERVER_URL = process.env.TSUNAGI_LLM_SERVER_URL || 'http://127.0.0.1:8766';

// venv・モデルキャッシュとも ~/.tsunagi/llm 配下にまとめる(run.shと同じ場所)。
const TSUNAGI_LLM_DIR = path.join(os.homedir(), '.tsunagi', 'llm');
const VENV_DIR = path.join(TSUNAGI_LLM_DIR, 'venv');
const HF_CACHE_DIR = path.join(TSUNAGI_LLM_DIR, 'cache');
const MODEL_CACHE_DIR = path.join(
  HF_CACHE_DIR,
  'hub',
  'models--mlx-community--Qwen3-30B-A3B-Instruct-2507-4bit'
);
// 実測値(2026-07時点、4bit量子化された重み一式の合計)。多少の変動はあるがETA計算の目安として使う。
const EXPECTED_MODEL_BYTES = 17_200_000_000;

// このファイルは apps/server/src/lib (dev) または apps/cli/dist/server/lib
// (npm配布物) のいずれかにいる。どちらの場合も3階層上に llm-server が
// 兄弟ディレクトリとして存在するようレイアウトを揃えている
// (apps/server/dist/lib → apps/server → apps → apps/llm-server,
//  apps/cli/dist/server/lib → apps/cli/dist → apps/cli → apps/cli/llm-server)。
export function findLlmServerDir(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidate = path.join(here, '..', '..', '..', 'llm-server');
  return fs.existsSync(path.join(candidate, 'run.sh')) ? candidate : null;
}

function venvPython(): string {
  return path.join(VENV_DIR, 'bin', 'python3');
}

function isVenvReady(): boolean {
  return fs.existsSync(venvPython());
}

function isModelReady(): boolean {
  const snapshotsDir = path.join(MODEL_CACHE_DIR, 'snapshots');
  if (!fs.existsSync(snapshotsDir)) return false;
  return fs.readdirSync(snapshotsDir).length > 0;
}

export type LlmServerStep =
  | 'not_running'
  | 'installing_deps'
  | 'downloading_model'
  | 'starting_server'
  | 'running'
  | 'running_external'
  | 'error';

export interface DownloadProgress {
  downloadedBytes: number;
  totalBytes: number;
  etaSeconds: number | null;
}

export interface LlmServerInfo {
  step: LlmServerStep;
  serverDir: string | null;
  downloadProgress?: DownloadProgress;
  error?: string;
}

let currentStep: LlmServerStep = 'not_running';
let downloadProgress: DownloadProgress | undefined;
let lastError: string | undefined;
let managedProcess: ChildProcess | null = null;
let setupPromise: Promise<void> | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${LLM_SERVER_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function getLlmServerStatus(): Promise<LlmServerInfo> {
  const serverDir = findLlmServerDir();

  // セットアップ/起動フロー進行中はそのステップをそのまま報告する。
  if (setupPromise) {
    return { step: currentStep, serverDir, downloadProgress, error: lastError };
  }

  const healthy = await checkHealth();
  if (healthy) {
    return { step: managedProcess ? 'running' : 'running_external', serverDir };
  }
  return { step: lastError ? 'error' : 'not_running', serverDir, error: lastError };
}

function runStep(cmd: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: 'ignore', env: env ?? process.env });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(cmd)} ${args.join(' ')} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

// モデルDL中(huggingface_hubがblobs/配下に *.incomplete を書き続ける)のファイルサイズを
// 定期的にポーリングし、進捗(%)と直近の転送速度からのETAを算出する。
async function trackModelDownload(child: ChildProcess): Promise<void> {
  const blobsDir = path.join(MODEL_CACHE_DIR, 'blobs');
  let lastBytes = 0;
  let lastTime = Date.now();
  let stopped = false;
  child.on('exit', () => {
    stopped = true;
  });

  while (!stopped) {
    await sleep(1000);
    let downloaded = 0;
    try {
      for (const f of fs.readdirSync(blobsDir)) {
        if (!f.endsWith('.incomplete')) continue;
        downloaded += fs.statSync(path.join(blobsDir, f)).size;
      }
    } catch {
      // blobsDir がまだ作られていない場合は0のまま次のポーリングへ
    }

    const now = Date.now();
    const elapsedSec = (now - lastTime) / 1000;
    const bytesPerSec = elapsedSec > 0 ? (downloaded - lastBytes) / elapsedSec : 0;
    const remaining = EXPECTED_MODEL_BYTES - downloaded;
    const etaSeconds = bytesPerSec > 0 ? Math.max(0, Math.round(remaining / bytesPerSec)) : null;

    downloadProgress = {
      downloadedBytes: downloaded,
      totalBytes: EXPECTED_MODEL_BYTES,
      etaSeconds,
    };
    lastBytes = downloaded;
    lastTime = now;
  }
}

async function runSetupAndStart(dir: string): Promise<void> {
  const hfEnv = { ...process.env, HF_HOME: HF_CACHE_DIR, HF_HUB_DISABLE_XET: '1' };

  if (!isVenvReady()) {
    currentStep = 'installing_deps';
    fs.mkdirSync(TSUNAGI_LLM_DIR, { recursive: true });
    await runStep('python3', ['-m', 'venv', VENV_DIR], dir);
    await runStep(venvPython(), ['-m', 'pip', 'install', '-r', 'requirements.txt'], dir);
  }

  if (!isModelReady()) {
    currentStep = 'downloading_model';
    downloadProgress = { downloadedBytes: 0, totalBytes: EXPECTED_MODEL_BYTES, etaSeconds: null };
    await new Promise<void>((resolve, reject) => {
      const child = spawn(venvPython(), ['download_model.py'], {
        cwd: dir,
        stdio: 'ignore',
        env: hfEnv,
      });
      void trackModelDownload(child);
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`download_model.py exited with code ${code}`));
      });
      child.on('error', reject);
    });
    downloadProgress = undefined;
  }

  currentStep = 'starting_server';
  const child = spawn(
    venvPython(),
    [
      '-m',
      'mlx_lm.server',
      '--model',
      'mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit',
      '--host',
      '127.0.0.1',
      '--port',
      '8766',
    ],
    { cwd: dir, stdio: 'ignore', env: hfEnv }
  );
  child.on('exit', () => {
    if (managedProcess === child) managedProcess = null;
  });
  child.on('error', () => {
    if (managedProcess === child) managedProcess = null;
  });
  managedProcess = child;

  // MoEで実計算はアクティブパラメータ(~3B)分のみだが、4bit量子化でも~17GBの
  // 重みファイル自体はメモリへ展開する必要があるため、whisperより長めに待つ。
  const start = Date.now();
  while (Date.now() - start < 90000) {
    if (await checkHealth()) return;
    await sleep(1000);
  }
  throw new Error('Server did not become healthy within 90s of starting');
}

export function startLlmServer(): { started: boolean; error?: string } {
  if (setupPromise || managedProcess) {
    return { started: false, error: 'Already starting/running' };
  }

  const dir = findLlmServerDir();
  if (!dir) {
    return { started: false, error: 'llm-server directory not found' };
  }

  lastError = undefined;
  setupPromise = runSetupAndStart(dir)
    .catch((error) => {
      currentStep = 'error';
      lastError = error instanceof Error ? error.message : String(error);
    })
    .finally(() => {
      setupPromise = null;
    });

  return { started: true };
}

export function stopLlmServer(): { stopped: boolean; error?: string } {
  if (!managedProcess) {
    return { stopped: false, error: 'Not started by tsunagi (nothing to stop)' };
  }
  managedProcess.kill();
  managedProcess = null;
  currentStep = 'not_running';
  return { stopped: true };
}

// tsunagi本体プロセスの終了時(Ctrl+C等)に、自分が起動したllm-serverも
// 道連れで停止する。ユーザーが手動で起動したもの(running_external)には触れない。
export function stopLlmServerOnExit(): void {
  managedProcess?.kill();
  managedProcess = null;
}
