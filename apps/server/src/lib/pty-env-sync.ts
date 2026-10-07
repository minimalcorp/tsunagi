import { execFile } from 'child_process';
import type { Server as SocketIOServer } from 'socket.io';
import { ptyManager, type PtySession } from '../pty-manager.js';
import { prisma } from './db.js';
import { resolvePtyLaunch, startPtySession, type PtyLaunch } from './pty-launch.js';

/**
 * tsunagi の環境変数（Claude プロファイルの割り当てを含む）の変更を、起動中の PTY に反映する。
 *
 * 動いているプロセスの環境変数は外から書き換えられないため、PTY を作り直して反映する
 * （claude タブは --resume で同じ会話に戻る）。作業を壊さないよう、claude が応答中・許可待ちの間や
 * シェルでコマンドを実行中の間、直近にユーザー入力があった間は作り直さず「反映待ち」にしておき、
 * 安全になった時点で作り直す。
 */

/** 直近の入力からこの時間が経つまでは作り直さない（入力中の文字を消さないため） */
const INPUT_IDLE_MS = 15_000;
/** 反映待ちの PTY を作り直せるか確認する間隔 */
const CHECK_INTERVAL_MS = 5_000;
/** claude がこの状態の間は作り直さない（hooks が Tab.status に記録する） */
const BUSY_TAB_STATUSES = new Set(['running', 'waiting']);

let io: SocketIOServer | null = null;
let checking = false;

function emitPending(session: PtySession): void {
  io?.to(`tab:${session.sessionId}`).emit('env-pending', {
    sessionId: session.sessionId,
    pending: session.envPending,
  });
}

/** 環境変数の比較用キー（キー順に依存しない） */
function launchKey(env: Record<string, string>, unsetKeys: string[]): string {
  const sorted = Object.keys(env)
    .sort()
    .map((key) => [key, env[key]]);
  return JSON.stringify([sorted, [...unsetKeys].sort()]);
}

async function resolveFor(session: PtySession): Promise<PtyLaunch | null> {
  try {
    return await resolvePtyLaunch(session.sessionId, session.options.request ?? {});
  } catch (err) {
    console.warn(`[pty-env-sync] Failed to resolve env for ${session.sessionId}:`, err);
    return null;
  }
}

/** シェル配下でコマンドが動いているか（pgrep は該当なしのとき exit 1） */
function hasChildProcess(pid: number): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('pgrep', ['-P', String(pid)], (err) => resolve(!err));
  });
}

async function canRespawnNow(session: PtySession): Promise<boolean> {
  if (Date.now() - session.lastInputAt < INPUT_IDLE_MS) return false;
  const tab = await prisma.tab
    .findUnique({ where: { tabId: session.sessionId }, select: { mode: true, status: true } })
    .catch(() => null);
  if (tab && tab.mode !== 'terminal') return !BUSY_TAB_STATUSES.has(tab.status);
  return !(await hasChildProcess(session.pty.pid));
}

/** PTY を最新の環境変数で作り直す。クライアントには pty-respawned で再接続させる */
async function respawn(session: PtySession): Promise<void> {
  const launch = await resolveFor(session);
  if (!launch) return;
  const { sessionId } = session;
  // 判定から作り直しまでの間に別経路で作り直し・削除されていれば何もしない
  if (ptyManager.getSession(sessionId) !== session) return;

  session.respawning = true;
  ptyManager.deleteSession(sessionId);
  try {
    await startPtySession(sessionId, launch, {
      request: session.options.request ?? {},
      launchClaude: session.options.launchClaude ?? false,
    });
  } catch (err) {
    console.error(`[pty-env-sync] Failed to respawn ${sessionId}:`, err);
    io?.to(`tab:${sessionId}`).emit('exit', { exitCode: -1 });
    return;
  }
  console.log(`[pty-env-sync] Respawned ${sessionId} with updated env`);
  io?.to(`tab:${sessionId}`).emit('pty-respawned', { sessionId });
}

/** 反映待ちの PTY のうち、安全なものを作り直す */
async function respawnPendingSessions(): Promise<void> {
  if (checking) return;
  checking = true;
  try {
    for (const sessionId of ptyManager.listSessions()) {
      const session = ptyManager.getSession(sessionId);
      if (!session?.envPending || session.respawning) continue;
      if (await canRespawnNow(session)) await respawn(session);
    }
  } finally {
    checking = false;
  }
}

/** 起動時に一度呼ぶ。反映待ちの PTY を定期的に確認する */
export function initPtyEnvSync(server: SocketIOServer): void {
  io = server;
  setInterval(() => void respawnPendingSessions(), CHECK_INTERVAL_MS).unref();
}

/**
 * tsunagi の環境変数（Claude プロファイルの割り当て・プロファイル削除を含む）を変更した後に呼ぶ。
 * 起動中の PTY ごとに環境変数を解決し直し、作成時と違えば反映待ちにする。
 */
export async function notifyEnvChanged(): Promise<void> {
  for (const sessionId of ptyManager.listSessions()) {
    const session = ptyManager.getSession(sessionId);
    if (!session?.options.syncEnv || session.respawning) continue;
    const launch = await resolveFor(session);
    if (!launch) continue;
    const pending =
      launchKey(launch.env, launch.unsetKeys) !==
      launchKey(session.appliedEnv, session.appliedUnsetKeys);
    if (pending !== session.envPending) {
      session.envPending = pending;
      emitPending(session);
    }
  }
  await respawnPendingSessions();
}

/** 反映待ちの PTY を、ユーザー操作で今すぐ作り直す */
export async function respawnSessionNow(sessionId: string): Promise<boolean> {
  const session = ptyManager.getSession(sessionId);
  if (!session || session.respawning) return false;
  await respawn(session);
  return true;
}

/** join したクライアントに現在の反映待ち状態を伝える */
export function getEnvPending(sessionId: string): boolean {
  return ptyManager.getSession(sessionId)?.envPending ?? false;
}
