import 'dotenv/config';
import * as os from 'os';
import * as path from 'path';
import { defineConfig } from 'prisma/config';

// NOTE: published package には src/ が含まれないため、src/lib/data-path.ts からの
// import はできない。同等ロジックをインラインで実装する。
// 本体ロジック変更時は以下 3 箇所を同期する必要がある:
//   - src/lib/data-path.ts
//   - scripts/auto-migrate.ts
//   - prisma.config.ts
function getTsunagiDataDir(): string {
  return process.env.TSUNAGI_DATA_DIR || path.join(os.homedir(), '.tsunagi');
}

function getDatabasePath(): string {
  return path.join(getTsunagiDataDir(), 'state', 'tsunagi.db');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: `file:${getDatabasePath()}`,
  },
});
