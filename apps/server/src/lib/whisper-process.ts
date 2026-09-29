import { type ChildProcess, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AsrModel, AsrModelList } from '@minimalcorp/tsunagi-shared';
import {
  ASR_MODELS,
  findAsrModel,
  findAsrModelByRepo,
  getVoiceInputSettings,
  saveVoiceInputSettings,
} from './asr-models.js';
import { killProcessOnPort } from './process-port.js';
import {
  findPython,
  isVenvUpToDate,
  PYTHON_NOT_FOUND_MESSAGE,
  writeVenvMarker,
} from './python-venv.js';

const WHISPER_SERVER_URL = process.env.TSUNAGI_WHISPER_SERVER_URL || 'http://127.0.0.1:8765';
// run.shが待受けるポート固定値(host.docker.internal経由URLと違い、停止処理は
// 必ずこのNodeプロセスと同じホスト上のポートを対象にする必要があるため分けて持つ)。
const WHISPER_PORT = 8765;

// venv・モデルキャッシュとも ~/.tsunagi/whisper 配下にまとめる(run.shと同じ場所)。
const TSUNAGI_WHISPER_DIR = path.join(os.homedir(), '.tsunagi', 'whisper');
const VENV_DIR = path.join(TSUNAGI_WHISPER_DIR, 'venv');
const HF_CACHE_DIR = path.join(TSUNAGI_WHISPER_DIR, 'cache');

// starting_serverフェーズ(spawn後にhealthyになるまで待つ時間)の上限。
// 遅いマシンでのPython起動/import/Metal初期化に加え、Qwen3-ASRは起動時にモデル(最大約4GB)を
// メモリへ読み込むため、そのばらつきを吸収できるよう120秒に設定。
// プロセスが起動途中でクラッシュした場合はこのタイムアウトを待たず即座に検知する。
const STARTUP_TIMEOUT_MS = 120_000;
// モデル切り替え時、停止したサーバーのポートが空くまで待つ時間の上限。
const SHUTDOWN_TIMEOUT_MS = 15_000;
// クラッシュ時にエラーメッセージへ含めるstderrの上限文字数。
const STDERR_TAIL_MAX_CHARS = 4000;

// このファイルの位置から whisper-server を探す:
//   npm配布物: apps/cli/dist/server/lib → 2階層上 → apps/cli/dist/whisper-server
//   dev/build: apps/server/{src,dist}/lib → 3階層上 → apps/whisper-server
export function findWhisperServerDir(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, '..', '..', 'whisper-server'),
    path.join(here, '..', '..', '..', 'whisper-server'),
  ];
  return candidates.find((c) => fs.existsSync(path.join(c, 'run.sh'))) ?? null;
}

function venvPython(): string {
  return path.join(VENV_DIR, 'bin', 'python3');
}

// huggingface_hubのキャッシュ構成(hub/models--{owner}--{name})に合わせたモデルの保存先。
function modelCacheDir(repo: string): string {
  return path.join(HF_CACHE_DIR, 'hub', `models--${repo.replace('/', '--')}`);
}

function isModelReady(repo: string): boolean {
  const snapshotsDir = path.join(modelCacheDir(repo), 'snapshots');
  if (!fs.existsSync(snapshotsDir)) return false;
  return fs.readdirSync(snapshotsDir).length > 0;
}

export type WhisperServerStep =
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

export interface WhisperServerInfo {
  step: WhisperServerStep;
  serverDir: string | null;
  /** 起動中のサーバーが読み込んでいる(セットアップ中は読み込もうとしている)モデル */
  modelId: string | null;
  downloadProgress?: DownloadProgress;
  error?: string;
}

let currentStep: WhisperServerStep = 'not_running';
let downloadProgress: DownloadProgress | undefined;
let lastError: string | undefined;
let managedProcess: ChildProcess | null = null;
let setupPromise: Promise<void> | null = null;
// セットアップ中・tsunagi管理で起動中のモデル
let targetModel: AsrModel | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 起動していれば読み込み中のモデルのリポジトリIDを返す(未起動ならnull)。
// tsunagi外で起動されたサーバーでも、どのモデルで動いているかを知るために/healthから取る。
async function checkHealth(): Promise<{ repo: string | null } | null> {
  try {
    const response = await fetch(`${WHISPER_SERVER_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return null;
    const body = (await response.json().catch(() => ({}))) as { model?: unknown };
    return { repo: typeof body.model === 'string' ? body.model : null };
  } catch {
    return null;
  }
}

export async function getWhisperServerStatus(): Promise<WhisperServerInfo> {
  const serverDir = findWhisperServerDir();

  // セットアップ/起動フロー進行中はそのステップをそのまま報告する。
  if (setupPromise) {
    return {
      step: currentStep,
      serverDir,
      modelId: targetModel?.id ?? null,
      downloadProgress,
      error: lastError,
    };
  }

  const health = await checkHealth();
  if (health) {
    return {
      step: managedProcess ? 'running' : 'running_external',
      serverDir,
      modelId: (health.repo && findAsrModelByRepo(health.repo)?.id) ?? null,
    };
  }
  return {
    step: lastError ? 'error' : 'not_running',
    serverDir,
    modelId: null,
    error: lastError,
  };
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
async function trackModelDownload(child: ChildProcess, model: AsrModel): Promise<void> {
  const blobsDir = path.join(modelCacheDir(model.repo), 'blobs');
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
    const remaining = model.expectedBytes - downloaded;
    // 転送が一時的に止まって見える(ポーリング間隔とディスク書き込みのタイミングがずれる)だけで
    // 速度0になることがあるため、その場合は直前のETAを維持し「計算中...」への逆戻りを防ぐ。
    const etaSeconds =
      bytesPerSec > 0
        ? Math.max(0, Math.round(remaining / bytesPerSec))
        : (downloadProgress?.etaSeconds ?? null);

    downloadProgress = {
      downloadedBytes: downloaded,
      totalBytes: model.expectedBytes,
      etaSeconds,
    };
    lastBytes = downloaded;
    lastTime = now;
  }
}

async function runSetupAndStart(dir: string, model: AsrModel): Promise<void> {
  const hfEnv = {
    ...process.env,
    HF_HOME: HF_CACHE_DIR,
    HF_HUB_DISABLE_XET: '1',
    TSUNAGI_ASR_ENGINE: model.engine,
    TSUNAGI_ASR_MODEL: model.repo,
  };
  const requirementsFile = path.join(dir, 'requirements.txt');

  if (!isVenvUpToDate(VENV_DIR, requirementsFile)) {
    currentStep = 'installing_deps';
    const pythonBin = findPython();
    if (!pythonBin) throw new Error(PYTHON_NOT_FOUND_MESSAGE);
    fs.mkdirSync(TSUNAGI_WHISPER_DIR, { recursive: true });
    fs.rmSync(VENV_DIR, { recursive: true, force: true });
    await runStep(pythonBin, ['-m', 'venv', VENV_DIR], dir);
    await runStep(venvPython(), ['-m', 'pip', 'install', '-r', 'requirements.txt'], dir);
    writeVenvMarker(VENV_DIR, requirementsFile);
  }

  if (!isModelReady(model.repo)) {
    currentStep = 'downloading_model';
    downloadProgress = { downloadedBytes: 0, totalBytes: model.expectedBytes, etaSeconds: null };
    await new Promise<void>((resolve, reject) => {
      const child = spawn(venvPython(), ['download_model.py', model.repo], {
        cwd: dir,
        stdio: 'ignore',
        env: hfEnv,
      });
      void trackModelDownload(child, model);
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
    ['-m', 'uvicorn', 'server:app', '--host', '127.0.0.1', '--port', '8765'],
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
        `whisper-server crashed while starting (${exitInfo})${stderrTail ? `\n${stderrTail}` : ''}`
      );
    }
    if (await checkHealth()) return;
    await sleep(1000);
  }
  throw new Error(`Server did not become healthy within ${STARTUP_TIMEOUT_MS / 1000}s of starting`);
}

// 設定で選択中のモデルでセットアップ・起動する。
export async function startWhisperServer(): Promise<{ started: boolean; error?: string }> {
  if (setupPromise || managedProcess) {
    return { started: false, error: 'Already starting/running' };
  }

  const dir = findWhisperServerDir();
  if (!dir) {
    return { started: false, error: 'whisper-server directory not found' };
  }

  const { modelId } = await getVoiceInputSettings();
  // getVoiceInputSettingsが一覧にあるIDだけを返すため必ず見つかる
  const model = findAsrModel(modelId) as AsrModel;

  // 設定の読み込みを待つ間に別のリクエストで起動が始まった場合に備えて再確認する
  if (setupPromise || managedProcess) {
    return { started: false, error: 'Already starting/running' };
  }

  lastError = undefined;
  targetModel = model;
  setupPromise = runSetupAndStart(dir, model)
    .catch((error) => {
      currentStep = 'error';
      lastError = error instanceof Error ? error.message : String(error);
    })
    .finally(() => {
      setupPromise = null;
    });

  return { started: true };
}

export async function stopWhisperServer(): Promise<{ stopped: boolean; error?: string }> {
  if (managedProcess) {
    managedProcess.kill();
    managedProcess = null;
    targetModel = null;
    currentStep = 'not_running';
    return { stopped: true };
  }

  // tsunagi外(make whisper等)で起動された場合はchild_processのハンドルを
  // 持たないため、ポート番号を手がかりにOS側から見つけて停止する。
  const killed = await killProcessOnPort(WHISPER_PORT);
  if (!killed) {
    return {
      stopped: false,
      error: `ポート${WHISPER_PORT}で待ち受けているプロセスが見つかりませんでした`,
    };
  }
  currentStep = 'not_running';
  return { stopped: true };
}

// tsunagi本体プロセスの終了時(Ctrl+C等)に、自分が起動したwhisper-serverも
// 道連れで停止する。ユーザーが手動で起動したもの(running_external)には触れない。
export function stopWhisperServerOnExit(): void {
  managedProcess?.kill();
  managedProcess = null;
}

async function waitUntilStopped(): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < SHUTDOWN_TIMEOUT_MS) {
    if (!(await checkHealth())) return true;
    await sleep(500);
  }
  return false;
}

export async function listAsrModels(): Promise<AsrModelList> {
  const { modelId } = await getVoiceInputSettings();
  return {
    models: ASR_MODELS.map((m) => ({ ...m, installed: isModelReady(m.repo) })),
    selectedModelId: modelId,
  };
}

// 使用するモデルを切り替える。サーバーが別のモデルで起動中なら、停止して
// 新しいモデルで起動し直す(未ダウンロードならダウンロードから行う)。
// 停止中の場合は設定の保存のみ行い、次回起動時にそのモデルを読み込む。
export async function selectAsrModel(
  modelId: string
): Promise<{ ok: true; restarted: boolean } | { ok: false; error: string }> {
  if (!findAsrModel(modelId)) return { ok: false, error: `Unknown model: ${modelId}` };
  if (setupPromise) {
    return { ok: false, error: 'サーバーのセットアップ中はモデルを切り替えられません' };
  }

  await saveVoiceInputSettings({ modelId });

  const status = await getWhisperServerStatus();
  const running = status.step === 'running' || status.step === 'running_external';
  if (!running || status.modelId === modelId) return { ok: true, restarted: false };

  const stopped = await stopWhisperServer();
  if (!stopped.stopped)
    return { ok: false, error: stopped.error ?? 'サーバーを停止できませんでした' };
  if (!(await waitUntilStopped())) {
    return { ok: false, error: 'サーバーの停止を確認できませんでした' };
  }
  const started = await startWhisperServer();
  if (!started.started)
    return { ok: false, error: started.error ?? 'サーバーを起動できませんでした' };
  return { ok: true, restarted: true };
}

// ダウンロード済みのモデルを削除してディスク容量を空ける。
// 使用中(セットアップ中・起動中)のモデルは削除できない。
export async function deleteAsrModel(
  modelId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const model = findAsrModel(modelId);
  if (!model) return { ok: false, error: `Unknown model: ${modelId}` };

  const status = await getWhisperServerStatus();
  if (status.modelId === modelId) {
    return { ok: false, error: '使用中のモデルは削除できません。先にサーバーを停止してください' };
  }

  fs.rmSync(modelCacheDir(model.repo), { recursive: true, force: true });
  return { ok: true };
}
