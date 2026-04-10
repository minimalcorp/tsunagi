import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

const execAsync = promisify(exec);

function getTsunagiDataDir(): string {
  return process.env.TSUNAGI_DATA_DIR || path.join(os.homedir(), '.tsunagi');
}

function getStateDir(): string {
  return path.join(getTsunagiDataDir(), 'state');
}

async function autoMigrate() {
  try {
    console.log('DB migration started');
    await fs.mkdir(getStateDir(), { recursive: true });

    const { stdout } = await execAsync('npx prisma migrate deploy');
    const lines = stdout
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('Prisma schema loaded'));
    if (lines.length > 0) console.log(lines.join('\n'));
  } catch (error) {
    console.error('DB migration failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

autoMigrate();
