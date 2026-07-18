import { type ChildProcess, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { killProcessOnPort } from './process-port.js';

export type LlmProfile = 'instruct' | 'thinking';

interface ProfileConfig {
  model: string;
  port: number;
  cacheDirName: string;
  expectedModelBytes: number;
  envUrlKey: string;
}

// 実測値(2026-07時点、4bit量子化された重み一式の合計)。多少の変動はあるがETA計算の目安として使う。
const PROFILE_CONFIG: Record<LlmProfile, ProfileConfig> = {
  instruct: {
    model: 'mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit',
    port: 8766,
    cacheDirName: 'models--mlx-community--Qwen3-30B-A3B-Instruct-2507-4bit',
    expectedModelBytes: 17_200_000_000,
    envUrlKey: 'TSUNAGI_LLM_SERVER_URL_INSTRUCT',
  },
  thinking: {
    model: 'mlx-community/Qwen3-30B-A3B-Thinking-2507-4bit',
    port: 8767,
    cacheDirName: 'models--mlx-community--Qwen3-30B-A3B-Thinking-2507-4bit',
    expectedModelBytes: 17_200_000_000,
    envUrlKey: 'TSUNAGI_LLM_SERVER_URL_THINKING',
  },
};

export function getLlmServerUrl(profile: LlmProfile): string {
  const cfg = PROFILE_CONFIG[profile];
  return process.env[cfg.envUrlKey] || `http://127.0.0.1:${cfg.port}`;
}

// venv・モデルキャッシュとも ~/.tsunagi/llm 配下にまとめる(run.shと同じ場所)。
// venvはinstruct/thinkingで共有する(同じmlx-lmパッケージを使うため)。
const TSUNAGI_LLM_DIR = path.join(os.homedir(), '.tsunagi', 'llm');
const VENV_DIR = path.join(TSUNAGI_LLM_DIR, 'venv');
const HF_CACHE_DIR = path.join(TSUNAGI_LLM_DIR, 'cache');

function modelCacheDir(profile: LlmProfile): string {
  return path.join(HF_CACHE_DIR, 'hub', PROFILE_CONFIG[profile].cacheDirName);
}

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

function isModelReady(profile: LlmProfile): boolean {
  const snapshotsDir = path.join(modelCacheDir(profile), 'snapshots');
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

interface ProfileState {
  currentStep: LlmServerStep;
  downloadProgress?: DownloadProgress;
  lastError?: string;
  managedProcess: ChildProcess | null;
  setupPromise: Promise<void> | null;
}

function createProfileState(): ProfileState {
  return { currentStep: 'not_running', managedProcess: null, setupPromise: null };
}

const STATE: Record<LlmProfile, ProfileState> = {
  instruct: createProfileState(),
  thinking: createProfileState(),
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkHealth(profile: LlmProfile): Promise<boolean> {
  try {
    const response = await fetch(`${getLlmServerUrl(profile)}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function getLlmServerStatus(profile: LlmProfile): Promise<LlmServerInfo> {
  const state = STATE[profile];
  const serverDir = findLlmServerDir();

  // セットアップ/起動フロー進行中はそのステップをそのまま報告する。
  if (state.setupPromise) {
    return {
      step: state.currentStep,
      serverDir,
      downloadProgress: state.downloadProgress,
      error: state.lastError,
    };
  }

  const healthy = await checkHealth(profile);
  if (healthy) {
    return { step: state.managedProcess ? 'running' : 'running_external', serverDir };
  }
  return { step: state.lastError ? 'error' : 'not_running', serverDir, error: state.lastError };
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
async function trackModelDownload(profile: LlmProfile, child: ChildProcess): Promise<void> {
  const state = STATE[profile];
  const expectedBytes = PROFILE_CONFIG[profile].expectedModelBytes;
  const blobsDir = path.join(modelCacheDir(profile), 'blobs');
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
    const remaining = expectedBytes - downloaded;
    const etaSeconds = bytesPerSec > 0 ? Math.max(0, Math.round(remaining / bytesPerSec)) : null;

    state.downloadProgress = {
      downloadedBytes: downloaded,
      totalBytes: expectedBytes,
      etaSeconds,
    };
    lastBytes = downloaded;
    lastTime = now;
  }
}

async function runSetupAndStart(profile: LlmProfile, dir: string): Promise<void> {
  const state = STATE[profile];
  const cfg = PROFILE_CONFIG[profile];
  const hfEnv = { ...process.env, HF_HOME: HF_CACHE_DIR, HF_HUB_DISABLE_XET: '1' };

  if (!isVenvReady()) {
    state.currentStep = 'installing_deps';
    fs.mkdirSync(TSUNAGI_LLM_DIR, { recursive: true });
    await runStep('python3', ['-m', 'venv', VENV_DIR], dir);
    await runStep(venvPython(), ['-m', 'pip', 'install', '-r', 'requirements.txt'], dir);
  }

  if (!isModelReady(profile)) {
    state.currentStep = 'downloading_model';
    state.downloadProgress = {
      downloadedBytes: 0,
      totalBytes: cfg.expectedModelBytes,
      etaSeconds: null,
    };
    await new Promise<void>((resolve, reject) => {
      const child = spawn(venvPython(), ['download_model.py', cfg.model], {
        cwd: dir,
        stdio: 'ignore',
        env: hfEnv,
      });
      void trackModelDownload(profile, child);
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`download_model.py exited with code ${code}`));
      });
      child.on('error', reject);
    });
    state.downloadProgress = undefined;
  }

  state.currentStep = 'starting_server';
  const child = spawn(
    venvPython(),
    [
      '-m',
      'mlx_lm.server',
      '--model',
      cfg.model,
      '--host',
      '127.0.0.1',
      '--port',
      String(cfg.port),
    ],
    { cwd: dir, stdio: 'ignore', env: hfEnv }
  );
  child.on('exit', () => {
    if (state.managedProcess === child) state.managedProcess = null;
  });
  child.on('error', () => {
    if (state.managedProcess === child) state.managedProcess = null;
  });
  state.managedProcess = child;

  // MoEで実計算はアクティブパラメータ(~3B)分のみだが、4bit量子化でも~17GBの
  // 重みファイル自体はメモリへ展開する必要があるため、whisperより長めに待つ。
  const start = Date.now();
  while (Date.now() - start < 90000) {
    if (await checkHealth(profile)) return;
    await sleep(1000);
  }
  throw new Error('Server did not become healthy within 90s of starting');
}

export function startLlmServer(profile: LlmProfile): { started: boolean; error?: string } {
  const state = STATE[profile];
  if (state.setupPromise || state.managedProcess) {
    return { started: false, error: 'Already starting/running' };
  }

  const dir = findLlmServerDir();
  if (!dir) {
    return { started: false, error: 'llm-server directory not found' };
  }

  state.lastError = undefined;
  state.setupPromise = runSetupAndStart(profile, dir)
    .catch((error) => {
      state.currentStep = 'error';
      state.lastError = error instanceof Error ? error.message : String(error);
    })
    .finally(() => {
      state.setupPromise = null;
    });

  return { started: true };
}

export async function stopLlmServer(
  profile: LlmProfile
): Promise<{ stopped: boolean; error?: string }> {
  const state = STATE[profile];
  if (state.managedProcess) {
    state.managedProcess.kill();
    state.managedProcess = null;
    state.currentStep = 'not_running';
    return { stopped: true };
  }

  // tsunagi外(make llm/make llm-thinking等)で起動された場合はchild_processの
  // ハンドルを持たないため、ポート番号を手がかりにOS側から見つけて停止する。
  const port = PROFILE_CONFIG[profile].port;
  const killed = await killProcessOnPort(port);
  if (!killed) {
    return { stopped: false, error: `ポート${port}で待ち受けているプロセスが見つかりませんでした` };
  }
  state.currentStep = 'not_running';
  return { stopped: true };
}

export interface LlmChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// mlx_lm.serverへストリーミングなしで1回だけ問い合わせ、最終テキストのみを返す。
// 音声入力の文字起こし結果の整形など、対話UIを介さずLLMの出力だけ欲しい場面で使う。
export async function generateLlmCompletion(
  profile: LlmProfile,
  messages: LlmChatMessage[],
  maxTokens: number
): Promise<string> {
  const response = await fetch(`${getLlmServerUrl(profile)}/v1/chat/completions`, {
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

// tsunagi本体プロセスの終了時(Ctrl+C等)に、自分が起動したllm-serverも
// 道連れで停止する。ユーザーが手動で起動したもの(running_external)には触れない。
export function stopLlmServerOnExit(): void {
  for (const profile of Object.keys(STATE) as LlmProfile[]) {
    const state = STATE[profile];
    state.managedProcess?.kill();
    state.managedProcess = null;
  }
}
