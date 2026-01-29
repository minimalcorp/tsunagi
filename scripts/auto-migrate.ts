import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';

const execAsync = promisify(exec);

// data-path.tsと同じロジックでパス解決
function getTsunagiDataDir(): string {
  return process.env.TSUNAGI_DATA_DIR || path.join(process.env.HOME || '~', '.tsunagi');
}

function getDatabasePath(): string {
  return path.join(getTsunagiDataDir(), 'state', 'tsunagi.db');
}

function getStateDir(): string {
  return path.join(getTsunagiDataDir(), 'state');
}

async function autoMigrate() {
  try {
    console.log('DB migration started');

    const dbPath = getDatabasePath();
    const stateDir = getStateDir();

    // データベースディレクトリが存在しない場合は作成
    await fs.mkdir(stateDir, { recursive: true });

    // 環境変数を設定してprisma migrate deployを実行
    const env = {
      ...process.env,
      DATABASE_URL: `file:${dbPath}`,
    };

    const { stdout } = await execAsync('npx prisma migrate deploy', { env });

    // Prismaの出力から重要な行を抽出して表示
    const lines = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('Prisma schema loaded'));

    if (lines.length > 0) {
      console.log(lines.join('\n'));
    }

    // Prisma Clientを生成
    console.log('Generating Prisma Client...');
    const { stdout: generateOutput } = await execAsync('npx prisma generate', { env });

    const generateLines = generateOutput
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('Prisma schema loaded'));

    if (generateLines.length > 0) {
      console.log(generateLines.join('\n'));
    }
  } catch (error) {
    console.error('DB migration failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

autoMigrate();
