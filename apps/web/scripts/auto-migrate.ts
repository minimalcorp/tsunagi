import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';

const execAsync = promisify(exec);

// data-path.tsと同じロジックでパス解決
function getTsunagiDataDir(): string {
  return process.env.TSUNAGI_DATA_DIR || path.join(os.homedir(), '.tsunagi');
}

function getStateDir(): string {
  return path.join(getTsunagiDataDir(), 'state');
}

async function autoMigrate() {
  try {
    console.log('DB migration started');

    const stateDir = getStateDir();

    // データベースディレクトリが存在しない場合は作成
    // データベース URL 自体は prisma.config.ts の datasource.url で解決される
    // (Prisma 7 では schema.prisma の env("DATABASE_URL") は非対応)
    await fs.mkdir(stateDir, { recursive: true });

    const { stdout } = await execAsync('npx prisma migrate deploy');

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
    const { stdout: generateOutput } = await execAsync('npx prisma generate');

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
