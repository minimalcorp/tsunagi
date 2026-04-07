import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { getDatabasePath } from './src/lib/data-path';

// データベースパスを取得（migrate/studioコマンド用）
const dbPath = getDatabasePath();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: `file:${dbPath}`,
  },
});
