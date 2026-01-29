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
    const dbPath = getDatabasePath();
    const stateDir = getStateDir();

    console.log(`🔍 データベースの状態を確認中: ${dbPath}`);

    // データベースディレクトリが存在しない場合は作成
    await fs.mkdir(stateDir, { recursive: true });

    // データベースファイルの存在確認
    const dbExists = await fs
      .access(dbPath)
      .then(() => true)
      .catch(() => false);

    if (!dbExists) {
      console.log('📦 新規データベースを作成します...');
    } else {
      console.log('🔄 既存データベースをマイグレーションします...');
    }

    // 環境変数を設定してprisma migrate deployを実行
    const env = {
      ...process.env,
      DATABASE_URL: `file:${dbPath}`,
    };

    const { stdout, stderr } = await execAsync('npx prisma migrate deploy', { env });

    if (stdout) console.log(stdout);
    if (stderr && !stderr.includes('No pending migrations')) console.error(stderr);

    console.log('✅ マイグレーション完了！');
  } catch (error) {
    console.error('❌ マイグレーションエラー:', error);
    process.exit(1);
  }
}

autoMigrate();
