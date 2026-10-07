#!/usr/bin/env node
import { ChildProcess, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireSingleInstanceLock } from './single-instance-lock.js';
import {
  ENTRY_PROTOCOL,
  RESTART_EXIT_CODE,
  compareVersions,
  getBrokenVersions,
  getPackageRootOf,
  isInstalled,
  readEntryState,
  restoreSnapshot,
  updateEntryState,
  type EntryState,
} from './versions.js';

/**
 * Entry: the `tsunagi` bin of @minimalcorp/tsunagi.
 *
 * This file stays on the user's machine until they reinstall the package,
 * while the app (dist/app.js) is replaced by every auto-update. So it only
 * starts the app and starts it again; every other decision belongs to the app.
 * Follow the contract in versions.ts when changing anything here.
 *
 * - Holds the single-instance lock and forwards SIGINT / SIGTERM / SIGHUP.
 * - Runs the app of `next` (or `lastGood`) from ~/.tsunagi/versions/, or of
 *   this package when it is newer (reinstalled by hand).
 * - Runs the app in its own process group and kills what is left of the
 *   group after the app exits.
 * - Starts the app again when it exits with RESTART_EXIT_CODE.
 * - When a version other than `lastGood` exits before `ready`, marks it broken,
 *   restores the DB snapshot the app took, and starts `lastGood` again.
 */

if (process.platform !== 'darwin' && process.platform !== 'linux') {
  console.error(`[tsunagi] Unsupported platform: ${process.platform}`);
  console.error('[tsunagi] Tsunagi currently supports macOS and Linux only.');
  process.exit(1);
}

acquireSingleInstanceLock();

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readPackageVersion(root: string): string | null {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : null;
  } catch {
    return null;
  }
}

const ownVersion = readPackageVersion(PACKAGE_ROOT) ?? '0.0.0';

// npm でインストールされた tsunagi だけを自動更新する。
// リポジトリから build して直接実行している場合（docker/compose.prd.yml 等）はこのパッケージだけを使う
const useInstalledVersions =
  PACKAGE_ROOT.split(path.sep).includes('node_modules') &&
  process.env.TSUNAGI_DISABLE_AUTO_UPDATE !== '1';

interface AppCandidate {
  version: string;
  root: string;
}

function resolveApp(state: EntryState): AppCandidate {
  const own: AppCandidate = { version: ownVersion, root: PACKAGE_ROOT };
  if (!useInstalledVersions) return own;

  const broken = getBrokenVersions(state);
  const installed = [state.next, state.lastGood].find(
    (version): version is string =>
      typeof version === 'string' && !broken.includes(version) && isInstalled(version)
  );
  if (!installed) return own;
  // 手動で入れ直したこのパッケージの方が新しければ、そちらを使う
  if (!broken.includes(own.version) && compareVersions(own.version, installed) >= 0) return own;
  return { version: installed, root: getPackageRootOf(installed) };
}

let current: ChildProcess | null = null;
let stopping = false;

/** app のプロセスグループに残ったプロセスを止める */
function killProcessGroup(pid: number | undefined): void {
  if (!pid) return;
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    // グループに誰も残っていない
  }
}

function runApp(
  app: AppCandidate,
  options: { restarted: boolean; lastGood: string | null }
): Promise<{ code: number; ready: boolean }> {
  return new Promise((resolve) => {
    let ready = false;
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      TSUNAGI_ENTRY_PROTOCOL: String(ENTRY_PROTOCOL),
      TSUNAGI_ENTRY_PACKAGE_ROOT: PACKAGE_ROOT,
    };
    if (useInstalledVersions) env.TSUNAGI_AUTO_UPDATE = '1';
    if (options.lastGood) env.TSUNAGI_LAST_GOOD = options.lastGood;
    if (options.restarted) env.TSUNAGI_RESTARTED = '1';

    // detached: app と子孫を独立したプロセスグループにし、終了後にまとめて止められるようにする。
    // 端末の Ctrl+C は entry だけが受け、app には SIGTERM で伝える
    const child = spawn(process.execPath, [path.join(app.root, 'dist', 'app.js')], {
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      cwd: app.root,
      env,
      detached: true,
    });
    current = child;

    child.on('message', (message: unknown) => {
      if ((message as { type?: unknown } | null)?.type !== 'ready' || ready) return;
      ready = true;
      try {
        updateEntryState((state) => ({
          ...state,
          lastGood: app.version,
          broken: getBrokenVersions(state).filter((version) => version !== app.version),
          snapshot: null,
        }));
      } catch (error) {
        console.error('[tsunagi] Failed to record the running version:', error);
      }
    });
    child.on('error', (error) => {
      console.error('[tsunagi] Failed to start the app:', error);
    });
    child.on('exit', (code, signal) => {
      killProcessGroup(child.pid);
      current = null;
      resolve({ code: code ?? (signal ? 1 : 0), ready });
    });
  });
}

function stop(): void {
  if (stopping) {
    // 2回目の Ctrl+C: 待たずに止める
    killProcessGroup(current?.pid);
    process.exit(130);
  }
  stopping = true;
  if (!current) process.exit(0);
  try {
    current.kill('SIGTERM');
  } catch {
    // 既に終了している
  }
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('SIGHUP', stop);
process.on('uncaughtException', (error) => {
  console.error('[tsunagi] Uncaught exception:', error);
  killProcessGroup(current?.pid);
  process.exit(1);
});

function setBroken(version: string, broken: boolean): void {
  updateEntryState((state) => {
    const others = getBrokenVersions(state).filter((v) => v !== version);
    return { ...state, broken: broken ? [...others, version] : others };
  });
}

async function main(): Promise<void> {
  let restarted = false;
  // ロールバックの原因になったバージョン。戻した版も起動できなければ環境側の問題なので記録を取り消す
  let rolledBackFrom: string | null = null;
  for (;;) {
    const state = readEntryState();
    const lastGood = typeof state.lastGood === 'string' ? state.lastGood : null;
    const app = resolveApp(state);

    const result = await runApp(app, { restarted, lastGood });
    if (stopping) process.exit(0);

    if (result.ready) {
      rolledBackFrom = null;
    } else if (rolledBackFrom) {
      setBroken(rolledBackFrom, false);
      process.exit(result.code);
    } else if (lastGood && app.version !== lastGood) {
      const { snapshot } = readEntryState();
      setBroken(app.version, true);
      if (resolveApp(readEntryState()).version !== app.version) {
        console.error(
          `[tsunagi] v${app.version} failed to start (code ${result.code}). Rolling back to v${lastGood}.`
        );
        if (snapshot?.version === app.version) restoreSnapshot(snapshot);
        updateEntryState((s) => ({ ...s, snapshot: null }));
        rolledBackFrom = app.version;
        continue;
      }
      // 戻せる版がない
      setBroken(app.version, false);
    }

    if (result.code === RESTART_EXIT_CODE) {
      restarted = true;
      continue;
    }
    process.exit(result.code);
  }
}

void main();
