import { type ChildProcess, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { killProcessOnPort } from './process-port.js';

const MODEL = 'mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit';

const LLM_SERVER_URL = process.env.TSUNAGI_LLM_SERVER_URL || 'http://127.0.0.1:8766';
// run.shが待受けるポート固定値(host.docker.internal経由URLと違い、停止処理は
// 必ずこのNodeプロセスと同じホスト上のポートを対象にする必要があるため分けて持つ)。
const LLM_PORT = 8766;

export function getLlmServerUrl(): string {
  return LLM_SERVER_URL;
}

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

// starting_serverフェーズ(spawn後にhealthyになるまで待つ時間)の上限。
// mlx_lm.serverは/healthをモデル本体のロード完了を待たずに返す(ロードはバックグラウンド
// スレッドで進む)ため、この待ち時間の大半はPython起動/import初期化のばらつきに対する
// マージン。whisperより依存関係が重いぶん長めの90秒を維持する。
// プロセスが起動途中でクラッシュした場合はこのタイムアウトを待たず即座に検知する。
const STARTUP_TIMEOUT_MS = 90_000;
// クラッシュ時にエラーメッセージへ含めるstderrの上限文字数。
const STDERR_TAIL_MAX_CHARS = 4000;

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
    // 転送が一時的に止まって見える(ポーリング間隔とディスク書き込みのタイミングがずれる)だけで
    // 速度0になることがあるため、その場合は直前のETAを維持し「計算中...」への逆戻りを防ぐ。
    const etaSeconds =
      bytesPerSec > 0
        ? Math.max(0, Math.round(remaining / bytesPerSec))
        : (downloadProgress?.etaSeconds ?? null);

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
    ['-m', 'mlx_lm.server', '--model', MODEL, '--host', '127.0.0.1', '--port', String(LLM_PORT)],
    { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'], env: hfEnv }
  );
  let stderrTail = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-STDERR_TAIL_MAX_CHARS);
  });
  // healthポーリングとは別に、プロセスが起動途中で終了したことをタイムアウトを待たず検知する。
  let exitInfo: string | null = null;
  child.on('exit', (code, signal) => {
    exitInfo = `exit code=${code} signal=${signal}`;
    if (managedProcess === child) managedProcess = null;
  });
  child.on('error', (err) => {
    exitInfo = `spawn error: ${err.message}`;
    if (managedProcess === child) managedProcess = null;
  });
  managedProcess = child;

  const start = Date.now();
  while (Date.now() - start < STARTUP_TIMEOUT_MS) {
    if (exitInfo) {
      throw new Error(
        `llm-server crashed while starting (${exitInfo})${stderrTail ? `\n${stderrTail}` : ''}`
      );
    }
    if (await checkHealth()) return;
    await sleep(1000);
  }
  throw new Error(`Server did not become healthy within ${STARTUP_TIMEOUT_MS / 1000}s of starting`);
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

export async function stopLlmServer(): Promise<{ stopped: boolean; error?: string }> {
  if (managedProcess) {
    managedProcess.kill();
    managedProcess = null;
    currentStep = 'not_running';
    return { stopped: true };
  }

  // tsunagi外(make llm等)で起動された場合はchild_processのハンドルを
  // 持たないため、ポート番号を手がかりにOS側から見つけて停止する。
  const killed = await killProcessOnPort(LLM_PORT);
  if (!killed) {
    return {
      stopped: false,
      error: `ポート${LLM_PORT}で待ち受けているプロセスが見つかりませんでした`,
    };
  }
  currentStep = 'not_running';
  return { stopped: true };
}

// tsunagi本体プロセスの終了時(Ctrl+C等)に、自分が起動したllm-serverも
// 道連れで停止する。ユーザーが手動で起動したもの(running_external)には触れない。
export function stopLlmServerOnExit(): void {
  managedProcess?.kill();
  managedProcess = null;
}

export interface LlmChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// mlx_lm.serverへストリーミングなしで1回だけ問い合わせ、最終テキストのみを返す。
// 音声入力の文字起こし結果の整形など、対話UIを介さずLLMの出力だけ欲しい場面で使う。
export async function generateLlmCompletion(
  messages: LlmChatMessage[],
  maxTokens: number
): Promise<string> {
  const response = await fetch(`${LLM_SERVER_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages, stream: false, max_tokens: maxTokens }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new Error(`llm-server responded with ${response.status}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('Unexpected response shape from llm-server');
  }
  return content;
}
