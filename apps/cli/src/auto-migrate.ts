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
    await fs.mkdir(getStateDir(), { recursive: true });

    const { stdout } = await execAsync('npx prisma migrate deploy');
    // Extract "N migration(s) applied." line from prisma output
    const match = stdout.match(/(\d+)\s+migrations?\s+applied/i);
    if (match) {
      const count = parseInt(match[1], 10);
      console.log(`${count} migration${count === 1 ? '' : 's'} applied.`);
    }
  } catch (error) {
    console.error('DB migration failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

autoMigrate();
