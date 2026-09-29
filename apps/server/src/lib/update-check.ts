import type { Server as SocketIOServer } from 'socket.io';
import type { UpdateStatus } from '@minimalcorp/tsunagi-shared';

// 公開パッケージの latest dist-tag のみを返す軽量エンドポイント（数KB）
const REGISTRY_URL = 'https://registry.npmjs.org/@minimalcorp%2ftsunagi/latest';
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

// 実行中のバージョンは apps/cli が自身の package.json から注入する。
// dev 起動（npm run dev）では未設定のため確認しない
const status: UpdateStatus = {
  current: process.env.TSUNAGI_VERSION || null,
  latest: null,
  updateAvailable: false,
  checkedAt: null,
};

let timer: NodeJS.Timeout | null = null;

function parseVersion(version: string): number[] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  return match ? match.slice(1).map(Number) : null;
}

/** latest が current より新しいか（x.y.z 以外の形式は比較せず false） */
export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

export function getUpdateStatus(): UpdateStatus {
  return { ...status };
}

async function check(io: SocketIOServer): Promise<void> {
  if (!status.current) return;
  try {
    const res = await fetch(REGISTRY_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return;
    const { version } = (await res.json()) as { version?: unknown };
    if (typeof version !== 'string') return;

    const changed = version !== status.latest;
    status.latest = version;
    status.updateAvailable = isNewer(version, status.current);
    status.checkedAt = new Date().toISOString();
    if (changed) io.emit('version:status', getUpdateStatus());
  } catch {
    // オフライン等は無視し、前回の結果を保持する
  }
}

export function startUpdateCheck(io: SocketIOServer): void {
  if (!status.current || timer) return;
  void check(io);
  timer = setInterval(() => void check(io), CHECK_INTERVAL_MS);
  timer.unref();
}

export function stopUpdateCheck(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
