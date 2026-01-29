import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../generated/prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';

// data-path.tsをスクリプトから参照できるようにパス解決
// 注意: tsxで実行するため、相対パスで参照
function getTsunagiDataDir(): string {
  return process.env.TSUNAGI_DATA_DIR || path.join(process.env.HOME || '~', '.tsunagi');
}

function getDatabasePath(): string {
  return path.join(getTsunagiDataDir(), 'state', 'tsunagi.db');
}

function getStateDir(): string {
  return path.join(getTsunagiDataDir(), 'state');
}

const STATE_DIR = getStateDir();
const DB_PATH = getDatabasePath();

// 既存JSONファイルの型定義
interface Repository {
  id: string;
  owner: string;
  repo: string;
  cloneUrl: string;
  createdAt: string;
}

interface Tab {
  tab_id: string;
  order?: number; // 旧データではsessionNumberという名前
  sessionNumber?: number; // 後方互換性のため
  status: string;
  startedAt: string;
  completedAt?: string;
  updatedAt: string;
  session_id?: string;
  promptCount?: number;
  userPromptCount?: number; // 後方互換性のため
}

interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  owner: string;
  repo: string;
  branch: string;
  worktreeStatus: string;
  claudeState?: string; // 旧データ用（無視）
  plan?: string;
  effort?: number;
  order?: number;
  deleted?: boolean; // 旧データ用（無視）
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
  tabs?: Tab[];
}

interface SessionData {
  sdkMessages?: unknown[];
  prompts?: unknown[];
  rawMessages?: unknown[]; // 後方互換性のため
  userPrompts?: unknown[]; // 後方互換性のため
  nextSequence?: number;
}

interface EnvironmentVariable {
  key: string;
  value: string;
  scope: string;
  owner?: string;
  repo?: string;
  enabled: boolean;
}

interface ClaudeSetting {
  scope: string;
  owner?: string;
  repo?: string;
  sources: string[];
  enabled: boolean;
}

async function readJSON(filename: string): Promise<unknown> {
  try {
    const content = await fs.readFile(path.join(STATE_DIR, filename), 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return filename === 'sessions.json' ? {} : [];
    }
    throw error;
  }
}

async function main() {
  console.log(`📦 データベースパス: ${DB_PATH}`);
  console.log(`📁 JSONファイルディレクトリ: ${STATE_DIR}`);

  // Prisma v7: アダプターを使ってクライアントを初期化
  const adapter = new PrismaBetterSqlite3({ url: `file:${DB_PATH}` });
  const prisma = new PrismaClient({ adapter });

  try {
    console.log('🚀 マイグレーション開始...\n');

    // 1. repos.json → Repository
    console.log('📝 [1/5] repos.json → Repository');
    const reposData = (await readJSON('repos.json')) as Repository[];
    console.log(`   ${reposData.length}件のリポジトリを移行`);
    for (const repo of reposData) {
      await prisma.repository.create({
        data: {
          id: repo.id,
          owner: repo.owner,
          repo: repo.repo,
          cloneUrl: repo.cloneUrl,
          createdAt: new Date(repo.createdAt),
        },
      });
    }

    // owner/repo → repoIdのマッピングを作成
    const repoMap = new Map<string, string>();
    const allRepos = await prisma.repository.findMany();
    for (const repo of allRepos) {
      repoMap.set(`${repo.owner}/${repo.repo}`, repo.id);
    }

    // 2. tasks.json → Task + Tab
    console.log('📝 [2/5] tasks.json → Task + Tab');
    const tasksData = (await readJSON('tasks.json')) as Task[];
    console.log(`   ${tasksData.length}件のタスクを移行`);
    for (const task of tasksData) {
      const repoKey = `${task.owner}/${task.repo}`;
      const repoId = repoMap.get(repoKey);
      if (!repoId) {
        console.warn(`   ⚠️  Repository not found for task ${task.id}: ${repoKey}`);
        continue;
      }

      await prisma.task.create({
        data: {
          id: task.id,
          title: task.title,
          description: task.description,
          status: task.status,
          owner: task.owner,
          repo: task.repo,
          branch: task.branch,
          repoId,
          worktreeStatus: task.worktreeStatus,
          plan: task.plan,
          effort: task.effort,
          order: task.order,
          deletedAt: task.deletedAt ? new Date(task.deletedAt) : null,
          createdAt: new Date(task.createdAt),
          updatedAt: new Date(task.updatedAt),
          tabs: {
            create:
              task.tabs?.map((tab) => ({
                tabId: tab.tab_id,
                order: tab.order ?? tab.sessionNumber ?? 0, // 旧データ対応
                status: tab.status,
                sessionId: tab.session_id,
                promptCount: tab.promptCount ?? tab.userPromptCount, // 旧データ対応
                createdAt: new Date(tab.startedAt), // startedAtをcreatedAtとして使用
                startedAt: new Date(tab.startedAt),
                completedAt: tab.completedAt ? new Date(tab.completedAt) : null,
                updatedAt: new Date(tab.updatedAt),
              })) || [],
          },
        },
      });
    }

    // 3. sessions.json → SessionData
    console.log('📝 [3/5] sessions.json → SessionData');
    const sessionsData = (await readJSON('sessions.json')) as Record<string, SessionData>;
    const sessionKeys = Object.keys(sessionsData);
    console.log(`   ${sessionKeys.length}件のセッションデータを移行`);
    for (const [tabId, sessionData] of Object.entries(sessionsData)) {
      await prisma.sessionData.create({
        data: {
          tabId,
          sdkMessages: JSON.stringify(sessionData.sdkMessages || sessionData.rawMessages || []),
          prompts: JSON.stringify(sessionData.prompts || sessionData.userPrompts || []),
          nextSequence: sessionData.nextSequence || 1,
          // createdAtはデフォルト値が設定される
        },
      });
    }

    // 4. env.json → EnvironmentVariable
    console.log('📝 [4/5] env.json → EnvironmentVariable');
    const envData = (await readJSON('env.json')) as EnvironmentVariable[];
    console.log(`   ${envData.length}件の環境変数を移行`);
    for (const env of envData) {
      await prisma.environmentVariable.create({
        data: {
          key: env.key,
          value: env.value,
          scope: env.scope,
          owner: env.owner,
          repo: env.repo,
          enabled: env.enabled,
          // createdAt, updatedAtはデフォルト値が設定される
        },
      });
    }

    // 5. claude-settings.json → ClaudeSetting
    console.log('📝 [5/5] claude-settings.json → ClaudeSetting');
    const settingsData = (await readJSON('claude-settings.json')) as ClaudeSetting[];
    console.log(`   ${settingsData.length}件のClaude設定を移行`);
    for (const setting of settingsData) {
      await prisma.claudeSetting.create({
        data: {
          scope: setting.scope,
          owner: setting.owner,
          repo: setting.repo,
          sources: JSON.stringify(setting.sources),
          enabled: setting.enabled,
          // createdAt, updatedAtはデフォルト値が設定される
        },
      });
    }

    console.log('\n✅ マイグレーション完了！');
  } catch (error) {
    console.error('\n❌ マイグレーションエラー:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
