import { type ChildProcess, execFile, spawn } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { SearxngSettings, SearxngState, SearxngStatus } from '@minimalcorp/tsunagi-shared';
import { readAppSetting, writeAppSetting } from './local-llm-env.js';
import { getOllamaSettings } from './ollama-settings.js';
import { getLmStudioSettings } from './lmstudio.js';

/**
 * ローカル検索用の SearXNG をホスト上で1プロセスだけ管理する。
 * Ollama / LM Studio のどちらかが有効なら tsunagi 起動時・有効化時に自動起動し、
 * 両方無効化・tsunagi 終了時に止める。インストールは利用者が行う（searxng-run）。
 * 失敗しても例外は外に出さず状態として記録するだけにし、tsunagi 本体の起動を妨げない。
 */

const SETTING_KEY = 'searxng';

// 電話のキーパッドで s=7 x=9 n=6 g=4
const DEFAULT_PORT = 7964;

const SEARXNG_DIR = path.join(os.homedir(), '.tsunagi', 'searxng');
const GENERATED_SETTINGS_PATH = path.join(SEARXNG_DIR, 'settings.yml');
// 強制終了で残ったプロセスを次回起動時に片付けるための記録
const PID_FILE = path.join(SEARXNG_DIR, 'searxng.pid');

const STARTUP_TIMEOUT_MS = 60_000;
const STDERR_TAIL_MAX_CHARS = 4000;

// JSON 形式（API）の結果を返せるようにする。secret_key は起動時に SEARXNG_SECRET で渡す
const GENERATED_SETTINGS = `# tsunagi が生成した SearXNG の設定（起動のたびに上書きされる）
use_default_settings: true
server:
  secret_key: "overridden-by-SEARXNG_SECRET"
  limiter: false
  image_proxy: false
search:
  formats:
    - html
    - json
`;

export function defaultSearxngSettings(): SearxngSettings {
  return { port: DEFAULT_PORT, binPath: '', settingsPath: '' };
}

export async function getSearxngSettings(): Promise<SearxngSettings> {
  return readAppSetting(SETTING_KEY, defaultSearxngSettings());
}

export async function saveSearxngSettings(settings: SearxngSettings): Promise<SearxngSettings> {
  return writeAppSetting(SETTING_KEY, settings);
}

export function parseSearxngSettings(
  body: unknown
): { settings: SearxngSettings } | { error: string } {
  if (typeof body !== 'object' || body === null) return { error: 'Invalid body' };
  const b = body as Record<string, unknown>;
  const port = Number(b.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { error: 'port must be an integer between 1 and 65535' };
  }
  if (typeof b.binPath !== 'string') return { error: 'binPath must be string' };
  if (typeof b.settingsPath !== 'string') return { error: 'settingsPath must be string' };
  return {
    settings: { port, binPath: b.binPath.trim(), settingsPath: b.settingsPath.trim() },
  };
}

let state: SearxngState = 'stopped';
let lastError: string | undefined;
let managedProcess: ChildProcess | null = null;
// 起動・停止の同時実行を直列化する
let queue: Promise<void> = Promise.resolve();

function serialize(task: () => Promise<void>): Promise<void> {
  queue = queue.then(task).catch((error: unknown) => {
    state = 'error';
    lastError = error instanceof Error ? error.message : String(error);
  });
  return queue;
}

function baseUrl(settings: SearxngSettings): string {
  return `http://127.0.0.1:${settings.port}`;
}

async function isHealthy(settings: SearxngSettings): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl(settings)}/healthz`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

function isExecutable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** searxng-run を探す（設定値 → PATH）。見つからなければ null */
export function findSearxngBin(settings: SearxngSettings): string | null {
  if (settings.binPath) return isExecutable(settings.binPath) ? settings.binPath : null;
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const candidate = path.join(dir, 'searxng-run');
    if (dir && isExecutable(candidate)) return candidate;
  }
  return null;
}

/** Ollama / LM Studio のどちらかが有効か（= SearXNG を動かしておく必要があるか） */
async function isRequired(): Promise<boolean> {
  const [ollama, lmstudio] = await Promise.all([getOllamaSettings(), getLmStudioSettings()]);
  return ollama.enabled || lmstudio.enabled;
}

function commandOf(pid: number): Promise<string> {
  return new Promise((resolve) => {
    execFile('ps', ['-p', String(pid), '-o', 'command='], (_error, stdout) =>
      resolve((stdout || '').trim())
    );
  });
}

// 残ったプロセスを止めてからポートが空くまで待つ上限
const STALE_EXIT_TIMEOUT_MS = 10_000;

/** 前回 tsunagi が強制終了されて残った SearXNG を止める */
async function killStaleProcess(settings: SearxngSettings): Promise<void> {
  let pid: number;
  try {
    pid = Number(fs.readFileSync(PID_FILE, 'utf8').trim());
  } catch {
    return;
  }
  fs.rmSync(PID_FILE, { force: true });
  if (!Number.isInteger(pid) || pid <= 0) return;
  // pid が別プロセスに再利用されている可能性があるため、SearXNG のときだけ止める
  if (!/searx/i.test(await commandOf(pid))) return;
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // 既に終了している
    return;
  }
  // 終了前に応答が返ると「外部で起動済み」と誤判定するため、応答しなくなるまで待つ
  const startedAt = Date.now();
  while (Date.now() - startedAt < STALE_EXIT_TIMEOUT_MS && (await isHealthy(settings))) {
    await sleep(300);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function start(settings: SearxngSettings): Promise<void> {
  if (managedProcess) return;
  await killStaleProcess(settings);
  if (await isHealthy(settings)) {
    state = 'external';
    lastError = undefined;
    return;
  }

  const bin = findSearxngBin(settings);
  if (!bin) {
    state = 'not-installed';
    lastError = undefined;
    return;
  }

  fs.mkdirSync(SEARXNG_DIR, { recursive: true });
  let settingsPath = settings.settingsPath;
  if (!settingsPath) {
    fs.writeFileSync(GENERATED_SETTINGS_PATH, GENERATED_SETTINGS);
    settingsPath = GENERATED_SETTINGS_PATH;
  }

  state = 'starting';
  lastError = undefined;
  const child = spawn(bin, [], {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: {
      ...process.env,
      SEARXNG_SETTINGS_PATH: settingsPath,
      SEARXNG_PORT: String(settings.port),
      SEARXNG_BIND_ADDRESS: '127.0.0.1',
      SEARXNG_SECRET: crypto.randomBytes(32).toString('hex'),
    },
  });
  let stderrTail = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-STDERR_TAIL_MAX_CHARS);
  });
  let exitInfo: string | null = null;
  child.on('exit', (code, signal) => {
    exitInfo = `exit code=${code} signal=${signal}`;
    if (managedProcess !== child) return;
    managedProcess = null;
    fs.rmSync(PID_FILE, { force: true });
    // 停止操作以外で落ちた場合はエラーとして残す（自動での再起動はしない）
    if (state === 'running' || state === 'starting') {
      state = 'error';
      lastError = `SearXNG が終了しました (${exitInfo})${stderrTail ? `\n${stderrTail}` : ''}`;
    }
  });
  child.on('error', (err) => {
    exitInfo = `spawn error: ${err.message}`;
  });
  managedProcess = child;
  if (child.pid) fs.writeFileSync(PID_FILE, String(child.pid));

  const startedAt = Date.now();
  while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
    if (exitInfo) {
      managedProcess = null;
      throw new Error(
        `SearXNG の起動に失敗しました (${exitInfo})${stderrTail ? `\n${stderrTail}` : ''}`
      );
    }
    if (await isHealthy(settings)) {
      state = 'running';
      return;
    }
    await sleep(500);
  }
  child.kill();
  managedProcess = null;
  throw new Error(`SearXNG が ${STARTUP_TIMEOUT_MS / 1000} 秒以内に応答しませんでした`);
}

function stop(): void {
  if (managedProcess) {
    // exit ハンドラでエラー扱いしないよう先に状態を変える
    state = 'stopped';
    managedProcess.kill();
    managedProcess = null;
    fs.rmSync(PID_FILE, { force: true });
  } else if (state !== 'external') {
    state = 'stopped';
  }
}

/** Ollama / LM Studio の有効状態に合わせて起動・停止する。失敗しても例外は投げない */
export function syncSearxng(): Promise<void> {
  return serialize(async () => {
    const settings = await getSearxngSettings();
    if (await isRequired()) {
      await start(settings);
    } else {
      stop();
    }
  });
}

/** 手動での再起動（設定変更後やエラーからの復帰） */
export function restartSearxng(): Promise<void> {
  return serialize(async () => {
    stop();
    lastError = undefined;
    await start(await getSearxngSettings());
  });
}

export function stopSearxng(): Promise<void> {
  return serialize(async () => stop());
}

/** tsunagi 終了時に、自分が起動した SearXNG だけ止める（'exit' でも呼べるよう同期処理） */
export function stopSearxngOnExit(): void {
  if (!managedProcess) return;
  managedProcess.kill();
  managedProcess = null;
  fs.rmSync(PID_FILE, { force: true });
}

export async function getSearxngStatus(): Promise<SearxngStatus> {
  const settings = await getSearxngSettings();
  const required = await isRequired();
  let current = state;
  // 外部で起動・停止された場合に追従する
  if (current === 'external' || current === 'stopped' || current === 'not-installed') {
    if (await isHealthy(settings)) current = 'external';
    else if (current === 'external') current = 'stopped';
    state = current;
  }
  return {
    state: current,
    url: baseUrl(settings),
    required,
    binPath: findSearxngBin(settings),
    error: current === 'error' ? lastError : undefined,
  };
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

/** SearXNG で検索する。使えない状態なら理由をエラーにする */
export async function searchWeb(query: string, maxResults: number): Promise<WebSearchResult[]> {
  const settings = await getSearxngSettings();
  if (!(await isHealthy(settings))) {
    const { state: current } = await getSearxngStatus();
    const reason =
      current === 'not-installed'
        ? 'SearXNG がインストールされていません（searxng-run が見つかりません）'
        : current === 'starting'
          ? 'SearXNG を起動中です。少し待ってから再試行してください'
          : 'SearXNG が起動していません。tsunagi の Settings から起動してください';
    throw new Error(reason);
  }
  const url = `${baseUrl(settings)}/search?${new URLSearchParams({ q: query, format: 'json' })}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (res.status === 403) {
    throw new Error(
      'SearXNG が JSON 形式を許可していません（settings.yml の search.formats に json が必要）'
    );
  }
  if (!res.ok) throw new Error(`SearXNG responded ${res.status}`);
  const json = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  return (json.results ?? []).slice(0, maxResults).map((r) => ({
    title: r.title ?? '',
    url: r.url ?? '',
    snippet: r.content ?? '',
  }));
}
