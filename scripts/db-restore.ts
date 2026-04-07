import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

function getTsunagiDataDir(): string {
  return process.env.TSUNAGI_DATA_DIR || path.join(os.homedir(), '.tsunagi');
}

function getDatabasePath(): string {
  return path.join(getTsunagiDataDir(), 'state', 'tsunagi.db');
}

function getBackupDir(): string {
  return path.join(getTsunagiDataDir(), 'backups');
}

function formatTimestamp(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    `${date.getFullYear()}` +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

function isDatabaseInUse(dbPath: string): boolean {
  // macOS / Linux: use lsof to detect any process holding the DB file.
  try {
    const out = execSync(`lsof -- ${JSON.stringify(dbPath)} 2>/dev/null`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim().length > 0;
  } catch {
    // lsof exits with non-zero when no process holds the file, or when lsof is unavailable.
    return false;
  }
}

function restore() {
  const dbPath = getDatabasePath();
  const backupDir = getBackupDir();

  if (isDatabaseInUse(dbPath)) {
    console.error(
      'Error: tsunagi is still running (a process is holding the database).\n' +
        'Stop the dev server first (Ctrl+C), then rerun this command.'
    );
    process.exit(1);
  }

  if (!fs.existsSync(backupDir)) {
    console.error(`Error: backup directory not found: ${backupDir}`);
    process.exit(1);
  }

  const backups = fs
    .readdirSync(backupDir)
    .filter((f) => /^\d{14}\.db$/.test(f))
    .sort();

  const latest = backups[backups.length - 1];
  if (!latest) {
    console.error(`Error: no backups found in ${backupDir}`);
    process.exit(1);
  }

  // Move current DB files (.db, .db-wal, .db-shm) to .broken-<timestamp>
  const ts = formatTimestamp(new Date());
  for (const suffix of ['', '-wal', '-shm']) {
    const src = `${dbPath}${suffix}`;
    if (fs.existsSync(src)) {
      const dest = `${src}.broken-${ts}`;
      fs.renameSync(src, dest);
      console.log(`Saved old file: ${dest}`);
    }
  }

  const srcBackup = path.join(backupDir, latest);
  fs.copyFileSync(srcBackup, dbPath);

  console.log(`\nRestored from ${latest}`);
  console.log('Now restart tsunagi with: npm run dev');
}

try {
  restore();
} catch (err) {
  console.error('Restore failed:', err);
  process.exit(1);
}
