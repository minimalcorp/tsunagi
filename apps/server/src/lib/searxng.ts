import { type ChildProcess, execFile, execFileSync, spawn } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  SearxngRunner,
  SearxngSettings,
  SearxngState,
  SearxngStatus,
} from '@minimalcorp/tsunagi-shared';
import { readAppSetting, writeAppSetting } from './local-llm-env.js';
import { getOllamaSettings } from './ollama-settings.js';
import { getLmStudioSettings } from './lmstudio.js';

/**
 * ローカル検索用の SearXNG を1つだけ管理する。起動方法は2通り:
 * - process: searxng-run を子プロセスとして起動する（インストールは利用者が行う）
 * - docker: 公式イメージのコンテナを起動する（コンテナが無ければ作成する）
 * Ollama / LM Studio のどちらかが有効なら tsunagi 起動時・有効化時に自動起動し、
 * 両方無効化・tsunagi 終了時に止める。止めるのは tsunagi が起動したものだけ。
 * 失敗しても例外は外に出さず状態として記録するだけにし、tsunagi 本体の起動を妨げない。
 */

const SETTING_KEY = 'searxng';

// 電話のキーパッドで s=7 x=9 n=6 g=4
const DEFAULT_PORT = 7964;

const SEARXNG_DIR = path.join(os.homedir(), '.tsunagi', 'searxng');
const GENERATED_SETTINGS_PATH = path.join(SEARXNG_DIR, 'settings.yml');
// 強制終了で残ったプロセスを次回起動時に片付けるための記録
const PID_FILE = path.join(SEARXNG_DIR, 'searxng.pid');
// tsunagi が docker で起動したコンテナ名の記録（強制終了後の次回起動で引き継いで止められるように）
const DOCKER_MARKER_FILE = path.join(SEARXNG_DIR, 'docker-started');

const DEFAULT_DOCKER_CONTAINER = 'searxng';
const DOCKER_IMAGE = 'docker.io/searxng/searxng:latest';
// コンテナ内で SearXNG が待ち受けるポート
const DOCKER_CONTAINER_PORT = 8080;
// 初回はイメージ取得があるため長めに待つ
const DOCKER_PULL_TIMEOUT_MS = 10 * 60_000;
const DOCKER_COMMAND_TIMEOUT_MS = 60_000;
// PATH に無いときに探す場所（Docker Desktop / Homebrew）
const DOCKER_BIN_CANDIDATES = [
  '/usr/local/bin/docker',
  '/opt/homebrew/bin/docker',
  '/Applications/Docker.app/Contents/Resources/bin/docker',
];

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
  return {
    port: DEFAULT_PORT,
    method: 'auto',
    binPath: '',
    settingsPath: '',
    dockerContainer: DEFAULT_DOCKER_CONTAINER,
  };
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
  const method = b.method ?? 'auto';
  if (method !== 'auto' && method !== 'process' && method !== 'docker') {
    return { error: 'method must be auto, process or docker' };
  }
  if (typeof b.binPath !== 'string') return { error: 'binPath must be string' };
  if (typeof b.settingsPath !== 'string') return { error: 'settingsPath must be string' };
  const dockerContainer =
    typeof b.dockerContainer === 'string' && b.dockerContainer.trim()
      ? b.dockerContainer.trim()
      : DEFAULT_DOCKER_CONTAINER;
  // docker のコンテナ名に使える文字（先頭は英数字）
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(dockerContainer)) {
    return { error: 'dockerContainer must match [a-zA-Z0-9][a-zA-Z0-9_.-]*' };
  }
  return {
    settings: {
      port,
      method,
      binPath: b.binPath.trim(),
      settingsPath: b.settingsPath.trim(),
      dockerContainer,
    },
  };
}

let state: SearxngState = 'stopped';
let lastError: string | undefined;
// 起動中の進捗（イメージ取得中など）
let progressMessage: string | undefined;
let managedProcess: ChildProcess | null = null;
// tsunagi が docker で起動したコンテナ名（止める対象）
let managedContainer: string | null = null;
// 起動・停止の同時実行を直列化する
let queue: Promise<void> = Promise.resolve();

function serialize(task: () => Promise<void>): Promise<void> {
  queue = queue.then(task).catch((error: unknown) => {
    state = 'error';
    progressMessage = undefined;
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

/** docker コマンドを探す（PATH → Docker Desktop / Homebrew の既定の場所）。見つからなければ null */
export function findDockerBin(): string | null {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const candidate = path.join(dir, 'docker');
    if (dir && isExecutable(candidate)) return candidate;
  }
  return DOCKER_BIN_CANDIDATES.find(isExecutable) ?? null;
}

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runDocker(bin: string, args: string[], timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: timeoutMs }, (error, stdout, stderr) => {
      const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
      resolve({ code, stdout: stdout.trim(), stderr: (stderr || error?.message || '').trim() });
    });
  });
}

interface ContainerInfo {
  exists: boolean;
  running: boolean;
  /** コンテナの SearXNG を公開しているホスト側のポート */
  hostPort?: string;
}

/** コンテナの状態。Docker が応答しなければ null */
async function inspectContainer(bin: string, name: string): Promise<ContainerInfo | null> {
  const format = `{{.State.Running}} {{with index .HostConfig.PortBindings "${DOCKER_CONTAINER_PORT}/tcp"}}{{(index . 0).HostPort}}{{end}}`;
  const result = await runDocker(
    bin,
    ['inspect', '--type', 'container', '--format', format, name],
    DOCKER_COMMAND_TIMEOUT_MS
  );
  if (result.code === 0) {
    const [running, hostPort] = result.stdout.split(' ');
    return { exists: true, running: running === 'true', hostPort: hostPort || undefined };
  }
  if (/no such (container|object)/i.test(result.stderr)) return { exists: false, running: false };
  return null;
}

// 状態表示（3秒ごとのポーリング）のたびに docker を叩かないよう短時間キャッシュする
const INSPECT_CACHE_MS = 5000;
let inspectCache: { key: string; at: number; info: ContainerInfo | null } | null = null;

async function inspectContainerCached(bin: string, name: string): Promise<ContainerInfo | null> {
  const key = `${bin}:${name}`;
  if (inspectCache && inspectCache.key === key && Date.now() - inspectCache.at < INSPECT_CACHE_MS) {
    return inspectCache.info;
  }
  const info = await inspectContainer(bin, name);
  inspectCache = { key, at: Date.now(), info };
  return info;
}

/** 起動方法を決める（設定が auto なら searxng-run → Docker の順）。使えるものが無ければ null */
function resolveRunner(settings: SearxngSettings): SearxngRunner | null {
  if (settings.method === 'process') return findSearxngBin(settings) ? 'process' : null;
  if (settings.method === 'docker') return findDockerBin() ? 'docker' : null;
  if (findSearxngBin(settings)) return 'process';
  return findDockerBin() ? 'docker' : null;
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

/**
 * 前回 tsunagi が docker で起動したまま強制終了していれば、そのコンテナを引き継ぐ
 * （tsunagi が起動したものとして扱い、停止・終了時に止める）
 */
async function adoptStaleContainer(): Promise<void> {
  let name: string;
  try {
    name = fs.readFileSync(DOCKER_MARKER_FILE, 'utf8').trim();
  } catch {
    return;
  }
  const bin = findDockerBin();
  const info = bin && name ? await inspectContainer(bin, name) : null;
  if (info?.running) {
    managedContainer = name;
  } else {
    fs.rmSync(DOCKER_MARKER_FILE, { force: true });
  }
}

/** 応答するまで待つ。timeoutMs 以内に応答しなければ false */
async function waitHealthy(settings: SearxngSettings, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isHealthy(settings)) return true;
    await sleep(500);
  }
  return false;
}

/** 公式イメージでコンテナを作成して起動する。設定ファイルは ~/.tsunagi/searxng/docker/<name>/ に置く */
async function createContainer(bin: string, settings: SearxngSettings): Promise<void> {
  const name = settings.dockerContainer;
  const dir = path.join(SEARXNG_DIR, 'docker', name);
  const configDir = path.join(dir, 'config');
  const dataDir = path.join(dir, 'data');
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  // 既にあれば利用者が編集したものとして残す（公式イメージは無ければ JSON 形式が無効な既定を生成する）
  const configFile = path.join(configDir, 'settings.yml');
  if (!fs.existsSync(configFile)) fs.writeFileSync(configFile, GENERATED_SETTINGS);

  progressMessage = 'SearXNG のイメージを取得中';
  const pulled = await runDocker(bin, ['pull', DOCKER_IMAGE], DOCKER_PULL_TIMEOUT_MS);
  if (pulled.code !== 0) {
    throw new Error(`SearXNG のイメージを取得できませんでした\n${pulled.stderr}`);
  }

  progressMessage = `コンテナ ${name} を作成中`;
  const created = await runDocker(
    bin,
    [
      'run',
      '-d',
      '--name',
      name,
      '-p',
      `127.0.0.1:${settings.port}:${DOCKER_CONTAINER_PORT}`,
      '-v',
      `${configDir}:/etc/searxng/`,
      '-v',
      `${dataDir}:/var/cache/searxng/`,
      '-e',
      `SEARXNG_SECRET=${crypto.randomBytes(32).toString('hex')}`,
      DOCKER_IMAGE,
    ],
    DOCKER_COMMAND_TIMEOUT_MS
  );
  if (created.code !== 0) {
    throw new Error(`コンテナ ${name} を作成できませんでした\n${created.stderr}`);
  }
}

async function startDocker(settings: SearxngSettings): Promise<void> {
  const bin = findDockerBin();
  if (!bin) {
    state = 'not-installed';
    return;
  }
  const name = settings.dockerContainer;
  const info = await inspectContainer(bin, name);
  if (!info) {
    throw new Error('Docker が応答しません。Docker Desktop が起動しているか確認してください');
  }
  if (info.exists && info.hostPort && info.hostPort !== String(settings.port)) {
    throw new Error(
      `コンテナ ${name} はポート ${info.hostPort} で公開されています（設定は ${settings.port}）。` +
        '詳細設定のポートかコンテナ名を変更してください'
    );
  }

  state = 'starting';
  lastError = undefined;
  if (!info.exists) {
    await createContainer(bin, settings);
  } else if (!info.running) {
    progressMessage = `コンテナ ${name} を起動中`;
    const started = await runDocker(bin, ['start', name], DOCKER_COMMAND_TIMEOUT_MS);
    if (started.code !== 0) {
      throw new Error(`コンテナ ${name} を起動できませんでした\n${started.stderr}`);
    }
  }
  // 既に動いていたコンテナは tsunagi 外で起動したものなので止めない
  const startedByTsunagi = !info.running;
  if (startedByTsunagi) {
    managedContainer = name;
    fs.mkdirSync(SEARXNG_DIR, { recursive: true });
    fs.writeFileSync(DOCKER_MARKER_FILE, name);
  }
  inspectCache = null;

  progressMessage = 'SearXNG の応答を待機中';
  if (!(await waitHealthy(settings, STARTUP_TIMEOUT_MS))) {
    const logs = await runDocker(bin, ['logs', '--tail', '30', name], DOCKER_COMMAND_TIMEOUT_MS);
    throw new Error(
      `SearXNG が ${STARTUP_TIMEOUT_MS / 1000} 秒以内に応答しませんでした（コンテナ ${name}）` +
        `${logs.stdout || logs.stderr ? `\n${(logs.stdout + '\n' + logs.stderr).trim().slice(-STDERR_TAIL_MAX_CHARS)}` : ''}`
    );
  }
  progressMessage = undefined;
  state = startedByTsunagi ? 'running' : 'external';
}

async function start(settings: SearxngSettings): Promise<void> {
  if (managedProcess || managedContainer) return;
  await killStaleProcess(settings);
  await adoptStaleContainer();
  if (await isHealthy(settings)) {
    state = managedContainer ? 'running' : 'external';
    lastError = undefined;
    return;
  }
  // 引き継いだコンテナが応答しない場合は起動し直す
  managedContainer = null;

  const runner = resolveRunner(settings);
  if (!runner) {
    state = 'not-installed';
    lastError = undefined;
    return;
  }
  if (runner === 'docker') {
    await startDocker(settings);
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

async function stop(): Promise<void> {
  progressMessage = undefined;
  if (managedProcess) {
    // exit ハンドラでエラー扱いしないよう先に状態を変える
    state = 'stopped';
    managedProcess.kill();
    managedProcess = null;
    fs.rmSync(PID_FILE, { force: true });
  } else if (managedContainer) {
    const name = managedContainer;
    const bin = findDockerBin();
    managedContainer = null;
    fs.rmSync(DOCKER_MARKER_FILE, { force: true });
    inspectCache = null;
    state = 'stopped';
    if (bin) {
      const result = await runDocker(bin, ['stop', name], DOCKER_COMMAND_TIMEOUT_MS);
      if (result.code !== 0) {
        throw new Error(`コンテナ ${name} を停止できませんでした\n${result.stderr}`);
      }
    }
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
      await stop();
    }
  });
}

/** 手動での再起動（設定変更後やエラーからの復帰） */
export function restartSearxng(): Promise<void> {
  return serialize(async () => {
    await stop();
    lastError = undefined;
    await start(await getSearxngSettings());
  });
}

export function stopSearxng(): Promise<void> {
  return serialize(() => stop());
}

/** tsunagi 終了時に、自分が起動した SearXNG だけ止める（'exit' でも呼べるよう同期処理） */
export function stopSearxngOnExit(): void {
  if (managedProcess) {
    managedProcess.kill();
    managedProcess = null;
    fs.rmSync(PID_FILE, { force: true });
  }
  if (managedContainer) {
    const name = managedContainer;
    managedContainer = null;
    const bin = findDockerBin();
    try {
      if (bin) execFileSync(bin, ['stop', name], { timeout: 15_000, stdio: 'ignore' });
      fs.rmSync(DOCKER_MARKER_FILE, { force: true });
    } catch {
      // 止められなければ記録を残し、次回起動時に引き継ぐ
    }
  }
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
  // 表示する起動方法: tsunagi が起動したもの > 次に起動するときに使うもの
  let runner: SearxngRunner | null = managedProcess
    ? 'process'
    : managedContainer
      ? 'docker'
      : resolveRunner(settings);
  const dockerBin = findDockerBin();
  const container = managedContainer ?? settings.dockerContainer;
  const info = dockerBin ? await inspectContainerCached(dockerBin, container) : null;
  // tsunagi 外で起動したもの: 対象コンテナが動いていれば Docker、それ以外は方法不明
  if (current === 'external') runner = info?.running ? 'docker' : null;
  return {
    state: current,
    url: baseUrl(settings),
    required,
    binPath: findSearxngBin(settings),
    runner,
    docker: { binPath: dockerBin, container, containerExists: info ? info.exists : null },
    message: current === 'starting' ? progressMessage : undefined,
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
