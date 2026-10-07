import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Contract between the entry (dist/cli.js) and the app (dist/app.js).
 *
 * The entry ships only with a manually installed package, so an old entry may
 * run a newer app for a long time. Keep everything here backward compatible:
 * add fields and messages, never change or remove them.
 *
 * Layout:
 *   ~/.tsunagi/versions/<version>/                                 ← `npm install --prefix` target
 *   ~/.tsunagi/versions/<version>/.complete                        ← written after a verified install
 *   ~/.tsunagi/versions/<version>/node_modules/@minimalcorp/tsunagi/  ← package root (dist/app.js)
 *   ~/.tsunagi/versions/state.json                                 ← EntryState
 *
 * Process:
 *   - The app sends `{ type: 'ready' }` over IPC once it serves requests.
 *   - The app exits with RESTART_EXIT_CODE to be started again (on `next`).
 *   - The entry passes TSUNAGI_ENTRY_PROTOCOL, TSUNAGI_ENTRY_PACKAGE_ROOT,
 *     TSUNAGI_LAST_GOOD, TSUNAGI_AUTO_UPDATE and TSUNAGI_RESTARTED to the app.
 *
 * The server (apps/server/src/lib/auto-update.ts) writes `next` after an install.
 */

/** app が「起動し直してほしい」ことを entry に伝える終了コード（EX_TEMPFAIL） */
export const RESTART_EXIT_CODE = 75;

/** entry と app の取り決めのバージョン。取り決めを足したら上げる */
export const ENTRY_PROTOCOL = 1;

const PACKAGE_PATH = path.join('node_modules', '@minimalcorp', 'tsunagi');
const COMPLETE_MARKER = '.complete';

export function getTsunagiDataDir(): string {
  return process.env.TSUNAGI_DATA_DIR || path.join(os.homedir(), '.tsunagi');
}

export function getVersionsDir(): string {
  return path.join(getTsunagiDataDir(), 'versions');
}

export function getPackageRootOf(version: string): string {
  return path.join(getVersionsDir(), version, PACKAGE_PATH);
}

/** 検証済みのインストールがあり、app を起動できるか */
export function isInstalled(version: string): boolean {
  return (
    fs.existsSync(path.join(getVersionsDir(), version, COMPLETE_MARKER)) &&
    fs.existsSync(path.join(getPackageRootOf(version), 'dist', 'app.js'))
  );
}

export function parseVersion(version: string): number[] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  return match ? match.slice(1).map(Number) : null;
}

/** a と b の大小（x.y.z 以外は最も古い扱い） */
export function compareVersions(a: string, b: string): number {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (!va || !vb) return (va ? 1 : 0) - (vb ? 1 : 0);
  for (let i = 0; i < 3; i++) {
    if (va[i] !== vb[i]) return va[i] - vb[i];
  }
  return 0;
}

/**
 * 新しいバージョンを初めて起動する前に app が退避した DB。
 * files はデータディレクトリからの相対パスと、退避時点で存在したか。
 * 起動に失敗したら entry がこの一覧どおりに戻す（存在しなかったファイルは消す）。
 */
export interface DbSnapshot {
  version: string;
  dir: string;
  files: Record<string, boolean>;
}

export interface EntryState {
  /** 次に起動するバージョン（インストールが完了したら server が書く） */
  next?: string | null;
  /** 最後に起動完了（ready）まで到達したバージョン */
  lastGood?: string | null;
  /** 起動に失敗したため以後選ばないバージョン */
  broken?: string[];
  snapshot?: DbSnapshot | null;
  /** 新しいバージョンが足したフィールドは消さずに残す */
  [key: string]: unknown;
}

function getStatePath(): string {
  return path.join(getVersionsDir(), 'state.json');
}

export function readEntryState(): EntryState {
  try {
    const raw = JSON.parse(fs.readFileSync(getStatePath(), 'utf-8')) as unknown;
    return raw && typeof raw === 'object' ? (raw as EntryState) : {};
  } catch {
    return {};
  }
}

export function getBrokenVersions(state: EntryState): string[] {
  return Array.isArray(state.broken) ? state.broken.filter((v) => typeof v === 'string') : [];
}

/** 一時ファイルに書いてから rename で置き換える（書きかけの state を残さない） */
export function updateEntryState(update: (state: EntryState) => EntryState): void {
  const next = update(readEntryState());
  const statePath = getStatePath();
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const tmpPath = `${statePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(next, null, 2), 'utf-8');
  fs.renameSync(tmpPath, statePath);
}

/** snapshot の一覧どおりにデータディレクトリのファイルを戻す */
export function restoreSnapshot(snapshot: DbSnapshot): void {
  const dataDir = getTsunagiDataDir();
  for (const [file, existed] of Object.entries(snapshot.files)) {
    const dest = path.join(dataDir, file);
    if (existed) fs.copyFileSync(path.join(snapshot.dir, file), dest);
    else fs.rmSync(dest, { force: true });
  }
}
