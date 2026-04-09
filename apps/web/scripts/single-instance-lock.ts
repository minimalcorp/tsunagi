import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Single instance lock using PID file.
 *
 * - Writes current PID to `~/.tsunagi/state/tsunagi.lock` on acquire
 * - On startup, if lock file exists and its PID is alive, exits with error
 * - Stale locks (PID not alive) are removed automatically
 * - Lock is released on SIGINT / SIGTERM / exit
 */

function getTsunagiDataDir(): string {
  return process.env.TSUNAGI_DATA_DIR || path.join(os.homedir(), '.tsunagi');
}

function getLockFilePath(): string {
  return path.join(getTsunagiDataDir(), 'state', 'tsunagi.lock');
}

function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    // Signal 0 does not actually send a signal; it only checks existence.
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH: no such process. EPERM: process exists but we can't signal (still alive).
    const code = (err as NodeJS.ErrnoException).code;
    return code === 'EPERM';
  }
}

let released = false;

function releaseLock(): void {
  if (released) return;
  released = true;
  const lockFilePath = getLockFilePath();
  try {
    // Only remove the lock if it still belongs to us.
    const content = fs.readFileSync(lockFilePath, 'utf-8').trim();
    const pid = Number.parseInt(content, 10);
    if (pid === process.pid) {
      fs.unlinkSync(lockFilePath);
    }
  } catch {
    // Lock file already gone or unreadable. Ignore.
  }
}

/**
 * Acquire the single instance lock.
 *
 * Exits the process with code 1 if another tsunagi instance is already running.
 */
export function acquireSingleInstanceLock(): void {
  const lockFilePath = getLockFilePath();
  const stateDir = path.dirname(lockFilePath);
  fs.mkdirSync(stateDir, { recursive: true });

  if (fs.existsSync(lockFilePath)) {
    let existingPid = NaN;
    try {
      const content = fs.readFileSync(lockFilePath, 'utf-8').trim();
      existingPid = Number.parseInt(content, 10);
    } catch {
      // Unreadable lock file. Treat as stale.
    }

    if (isPidAlive(existingPid)) {
      console.error(`[tsunagi] Another tsunagi is running (PID ${existingPid}).`);
      console.error(`[tsunagi] Lock file: ${lockFilePath}`);
      process.exit(1);
    }

    // Stale lock; remove it and continue.
    try {
      fs.unlinkSync(lockFilePath);
    } catch {
      // Ignore unlink failures; the write below may still succeed or error clearly.
    }
  }

  fs.writeFileSync(lockFilePath, String(process.pid), 'utf-8');

  process.on('SIGINT', () => {
    releaseLock();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    releaseLock();
    process.exit(0);
  });
  process.on('exit', () => {
    releaseLock();
  });
  process.on('uncaughtException', (err) => {
    console.error('[tsunagi] Uncaught exception:', err);
    releaseLock();
    process.exit(1);
  });
}
