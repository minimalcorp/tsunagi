import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { AutoUpdateStatus, RestartBlocker } from '@minimalcorp/tsunagi-shared';
import { ptyManager } from '../pty-manager.js';
import { getTsunagiDataDir } from './data-path.js';
import { prisma } from './db.js';

/**
 * 新しいバージョンを ~/.tsunagi/versions/<version>/ に `npm install --prefix` で用意し、
 * state.json の next に書く。再起動（requestRestart）で entry が next の版を起動する。
 * ディレクトリ構成と entry との取り決めは apps/cli/src/versions.ts と合わせること。
 */

const PACKAGE_NAME = '@minimalcorp/tsunagi';
const COMPLETE_MARKER = '.complete';
const STDERR_TAIL_MAX_CHARS = 2000;

// entry 経由かつ npm でインストールされた tsunagi のときだけ apps/cli が設定する
const enabled = process.env.TSUNAGI_AUTO_UPDATE === '1' && !!process.env.TSUNAGI_VERSION;

/** entry が古く、再インストールしてほしいか（apps/cli/src/update-lifecycle.ts が判定する） */
export function isEntryOutdated(): boolean {
  return process.env.TSUNAGI_ENTRY_OUTDATED === '1';
}

let status: AutoUpdateStatus = { state: enabled ? 'idle' : 'disabled', version: null, error: null };
let installer: ChildProcess | null = null;
let onChange: (() => void) | null = null;

export function getAutoUpdateStatus(): AutoUpdateStatus {
  return { ...status };
}

/** 状態が変わったときに呼ぶ（update-check が Web へ通知する） */
export function onAutoUpdateChange(listener: () => void): void {
  onChange = listener;
}

function setStatus(next: AutoUpdateStatus): void {
  status = next;
  onChange?.();
}

function getVersionDir(version: string): string {
  return path.join(getTsunagiDataDir(), 'versions', version);
}

function getPackageRoot(version: string): string {
  return path.join(getVersionDir(version), 'node_modules', ...PACKAGE_NAME.split('/'));
}

function getStatePath(): string {
  return path.join(getTsunagiDataDir(), 'versions', 'state.json');
}

function readState(): Record<string, unknown> {
  try {
    const state = JSON.parse(fs.readFileSync(getStatePath(), 'utf-8')) as unknown;
    return state && typeof state === 'object' ? (state as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** 起動に失敗して entry がロールバックしたバージョン */
function readBrokenVersions(): string[] {
  const { broken } = readState();
  return Array.isArray(broken) ? broken.filter((v) => typeof v === 'string') : [];
}

/** 次の再起動で起動するバージョンを entry に伝える。他のフィールドは残し、rename で置き換える */
function setNextVersion(version: string): void {
  const statePath = getStatePath();
  const tmpPath = `${statePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify({ ...readState(), next: version }, null, 2), 'utf-8');
  fs.renameSync(tmpPath, statePath);
}

/** インストール結果が起動できる形か（entry が起動する dist/app.js があるか） */
function verifyInstall(version: string): boolean {
  const root = getPackageRoot(version);
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8')) as {
      version?: unknown;
    };
    return (
      pkg.version === version &&
      fs.existsSync(path.join(root, 'dist', 'cli.js')) &&
      fs.existsSync(path.join(root, 'dist', 'app.js'))
    );
  } catch {
    return false;
  }
}

/** 実行中の node と同じ場所の npm を優先する（nvm 等で PATH の npm と食い違わないように） */
function npmCommand(): string {
  const candidate = path.join(path.dirname(process.execPath), 'npm');
  return fs.existsSync(candidate) ? candidate : 'npm';
}

/** npx 経由で起動した場合の npm_config_* 等が install に影響しないよう取り除く */
function installEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (/^npm_/i.test(key) || key === 'NODE_ENV' || key.startsWith('TSUNAGI_')) continue;
    env[key] = value;
  }
  return env;
}

function install(version: string): void {
  const dir = getVersionDir(version);
  // 前回途中で止まったインストールが残っていれば消してからやり直す
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  setStatus({ state: 'installing', version, error: null });

  const child = spawn(
    npmCommand(),
    [
      'install',
      '--prefix',
      dir,
      '--no-audit',
      '--no-fund',
      '--no-update-notifier',
      '--loglevel=error',
      ...(process.env.TSUNAGI_NPM_REGISTRY ? ['--registry', process.env.TSUNAGI_NPM_REGISTRY] : []),
      `${PACKAGE_NAME}@${version}`,
    ],
    { cwd: dir, env: installEnv(), stdio: ['ignore', 'ignore', 'pipe'] }
  );
  installer = child;

  let stderrTail = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-STDERR_TAIL_MAX_CHARS);
  });

  let finished = false;
  const finish = (error: string | null) => {
    if (finished) return;
    finished = true;
    if (installer === child) installer = null;
    // stopAutoUpdate で止めた場合は状態を変えない（サーバー終了中）
    if (status.state !== 'installing' || status.version !== version) return;

    if (!error && verifyInstall(version)) {
      fs.writeFileSync(path.join(dir, COMPLETE_MARKER), new Date().toISOString(), 'utf-8');
      setNextVersion(version);
      setStatus({ state: 'ready', version, error: null });
      return;
    }
    fs.rmSync(dir, { recursive: true, force: true });
    setStatus({
      state: 'error',
      version,
      error: error ?? 'The installed package is incomplete',
    });
  };

  child.on('error', (err) => finish(`Failed to run npm: ${err.message}`));
  child.on('exit', (code, signal) => {
    if (code === 0) finish(null);
    else
      finish(
        `npm install failed (${signal ?? `code ${code}`})${stderrTail ? `\n${stderrTail}` : ''}`
      );
  });
}

/**
 * version を再起動で適用できるよう用意する（update-check が新しいバージョンを見つけるたびに呼ぶ）。
 * インストール中は何もしない。より新しいバージョンは次回の確認で用意する。
 */
export function prepareUpdate(version: string): void {
  if (!enabled || installer) return;
  if (status.state === 'ready' && status.version === version) return;

  if (readBrokenVersions().includes(version)) {
    fs.rmSync(getVersionDir(version), { recursive: true, force: true });
    setStatus({
      state: 'error',
      version,
      error: `v${version} failed to start and was rolled back`,
    });
    return;
  }
  if (fs.existsSync(path.join(getVersionDir(version), COMPLETE_MARKER))) {
    setNextVersion(version);
    setStatus({ state: 'ready', version, error: null });
    return;
  }
  try {
    install(version);
  } catch (err) {
    setStatus({
      state: 'error',
      version,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** サーバー終了時にインストールを止める。途中のディレクトリは次回の install で消す */
export function stopAutoUpdate(): void {
  if (!installer) return;
  try {
    installer.kill('SIGTERM');
  } catch {
    // 既に終了している
  }
  installer = null;
}

/**
 * 再起動すると止まってしまう実行中（running / waiting）のタスク。
 * PTY が残っていないタブは、前回終了時の status が残っているだけなので除く。
 */
export async function findRestartBlockers(): Promise<RestartBlocker[]> {
  const tabs = await prisma.tab.findMany({
    where: { status: { in: ['running', 'waiting'] } },
    include: { task: true },
  });
  const blockers = new Map<string, RestartBlocker>();
  for (const tab of tabs) {
    if (!ptyManager.getSession(tab.tabId)) continue;
    blockers.set(tab.taskId, { taskId: tab.taskId, title: tab.task.title });
  }
  return [...blockers.values()];
}
