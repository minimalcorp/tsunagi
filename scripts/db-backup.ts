import { createClient } from '@libsql/client';
import * as fs from 'node:fs';
import * as path from 'node:path';

const RETENTION_COUNT = 5;

function getTsunagiDataDir(): string {
  return process.env.TSUNAGI_DATA_DIR || path.join(process.env.HOME || '~', '.tsunagi');
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

async function backup() {
  const dbPath = getDatabasePath();
  const backupDir = getBackupDir();

  if (!fs.existsSync(dbPath)) {
    console.error(`Error: database not found at ${dbPath}`);
    process.exit(1);
  }

  fs.mkdirSync(backupDir, { recursive: true });

  const ts = formatTimestamp(new Date());
  const backupPath = path.join(backupDir, `${ts}.db`);

  const client = createClient({ url: `file:${dbPath}` });
  try {
    await client.execute(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
  } finally {
    client.close();
  }

  console.log(`Backup created: ${backupPath}`);

  // Retention: keep only the newest RETENTION_COUNT backups
  const files = fs
    .readdirSync(backupDir)
    .filter((f) => /^\d{14}\.db$/.test(f))
    .sort();

  while (files.length > RETENTION_COUNT) {
    const oldest = files.shift();
    if (!oldest) break;
    fs.unlinkSync(path.join(backupDir, oldest));
    console.log(`Removed old backup: ${oldest}`);
  }
}

backup().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});
