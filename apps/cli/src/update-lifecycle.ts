import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import {
  ENTRY_PROTOCOL,
  compareVersions,
  getTsunagiDataDir,
  getVersionsDir,
  parseVersion,
  updateEntryState,
} from './versions.js';

/**
 * App-side part of the auto-update: everything the entry (cli.ts) leaves to
 * the app, so that it can change with each version.
 */

/** 初めて起動するバージョンが書き換える可能性のあるファイル（データディレクトリからの相対パス） */
const DB_FILES = ['state/tsunagi.db', 'state/tsunagi.db-wal', 'state/tsunagi.db-shm'];
const SNAPSHOT_PREFIX = 'pre-update-';
const SNAPSHOT_RETENTION = 3;

/** entry から起動されたか。dev 起動（with-plugin.ts）や直接実行では null */
function getEntryProtocol(): number | null {
  const value = Number(process.env.TSUNAGI_ENTRY_PROTOCOL);
  return Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * entry が古く、再インストールで更新してほしいか。
 * 古い entry でも取り決めの範囲内で自動更新は続ける（versions.ts 参照）。
 */
export function isEntryOutdated(): boolean {
  const protocol = getEntryProtocol();
  return protocol !== null && protocol < ENTRY_PROTOCOL;
}

/** entry が npm でインストールされたパッケージから起動しており、自動更新を使うか */
export function isAutoUpdateEnabled(): boolean {
  return getEntryProtocol() !== null && process.env.TSUNAGI_AUTO_UPDATE === '1';
}

/**
 * 前回正常に起動した版と違う版（初めて起動する版）なら、マイグレーション前に DB を退避する。
 * 起動に失敗すると entry がこの退避を戻して前の版で起動し直す。
 */
export function snapshotDbBeforeFirstStart(version: string): void {
  const lastGood = process.env.TSUNAGI_LAST_GOOD;
  if (!lastGood || lastGood === version || getEntryProtocol() === null) return;

  const dataDir = getTsunagiDataDir();
  const backupsDir = path.join(dataDir, 'backups');
  const dir = path.join(backupsDir, `${SNAPSHOT_PREFIX}${Date.now()}-v${version}`);
  const files: Record<string, boolean> = {};
  for (const file of DB_FILES) {
    const src = path.join(dataDir, file);
    files[file] = fs.existsSync(src);
    if (!files[file]) continue;
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.copyFileSync(src, path.join(dir, file));
  }
  updateEntryState((state) => ({ ...state, snapshot: { version, dir, files } }));

  const snapshots = fs
    .readdirSync(backupsDir)
    .filter((name) => name.startsWith(SNAPSHOT_PREFIX))
    .sort();
  while (snapshots.length > SNAPSHOT_RETENTION) {
    const oldest = snapshots.shift();
    if (oldest) fs.rmSync(path.join(backupsDir, oldest), { recursive: true, force: true });
  }
}

/** 前の版が使っていたポートが空くまで待つ（上限付き） */
export async function waitForPortsFree(ports: number[], timeoutMs = 10_000): Promise<void> {
  const isFree = (port: number) =>
    new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.listen(port, '0.0.0.0', () => server.close(() => resolve(true)));
    });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const results = await Promise.all(ports.map(isFree));
    if (results.every(Boolean)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/**
 * 起動完了後、実行中より古いバージョンを消す（インストール済み・途中とも）。
 * 実行中より新しいものはインストール中・再起動待ちの可能性があるため残す。
 */
export function removeVersionsOlderThan(version: string): void {
  let entries: string[];
  try {
    entries = fs.readdirSync(getVersionsDir());
  } catch {
    return;
  }
  for (const name of entries) {
    if (!parseVersion(name) || compareVersions(name, version) >= 0) continue;
    fs.rmSync(path.join(getVersionsDir(), name), { recursive: true, force: true });
  }
}
