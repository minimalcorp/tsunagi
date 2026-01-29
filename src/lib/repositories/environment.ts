import { prisma } from '../db';
import type { EnvironmentVariable } from '../types';

// 全環境変数を取得（UIで表示する用）
export async function getAllEnv(
  scope: 'global' | 'owner' | 'repo',
  owner?: string,
  repo?: string
): Promise<EnvironmentVariable[]> {
  const envVars = await prisma.environmentVariable.findMany({
    where: {
      scope,
      ...(scope === 'owner' && { owner }),
      ...(scope === 'repo' && { owner, repo }),
    },
    orderBy: { createdAt: 'desc' },
  });

  return envVars.map((env) => ({
    key: env.key,
    value: env.value,
    scope: env.scope as 'global' | 'owner' | 'repo',
    owner: env.owner ?? undefined,
    repo: env.repo ?? undefined,
    enabled: env.enabled,
  }));
}

// 環境変数取得（優先順位: repo > owner > global）
export async function getEnv(
  scope: 'global' | 'owner' | 'repo',
  owner?: string,
  repo?: string
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  // グローバル変数を先に適用（有効なもののみ）
  const globalEnvs = await prisma.environmentVariable.findMany({
    where: { scope: 'global', enabled: true },
  });
  globalEnvs.forEach((env) => {
    result[env.key] = env.value;
  });

  // owner変数を適用（上書き、有効なもののみ）
  if (scope === 'owner' || scope === 'repo') {
    const ownerEnvs = await prisma.environmentVariable.findMany({
      where: { scope: 'owner', owner, enabled: true },
    });
    ownerEnvs.forEach((env) => {
      result[env.key] = env.value;
    });
  }

  // repo変数を適用（上書き、有効なもののみ）
  if (scope === 'repo') {
    const repoEnvs = await prisma.environmentVariable.findMany({
      where: { scope: 'repo', owner, repo, enabled: true },
    });
    repoEnvs.forEach((env) => {
      result[env.key] = env.value;
    });
  }

  // OAuth優先度ロジック: CLAUDE_CODE_OAUTH_TOKENが存在する場合、ANTHROPIC_API_KEYを除外
  if (result.CLAUDE_CODE_OAUTH_TOKEN && result.ANTHROPIC_API_KEY) {
    delete result.ANTHROPIC_API_KEY;
  }

  return result;
}

// 環境変数設定
export async function setEnv(
  key: string,
  value: string,
  scope: 'global' | 'owner' | 'repo',
  owner?: string,
  repo?: string
): Promise<void> {
  // 既存の変数を削除
  await prisma.environmentVariable.deleteMany({
    where: {
      key,
      scope,
      ...(scope === 'owner' && { owner }),
      ...(scope === 'repo' && { owner, repo }),
    },
  });

  // 新しい変数を追加
  await prisma.environmentVariable.create({
    data: {
      key,
      value,
      scope,
      owner,
      repo,
      enabled: true, // デフォルトで有効
    },
  });
}

// 環境変数削除
export async function deleteEnv(
  key: string,
  scope: 'global' | 'owner' | 'repo',
  owner?: string,
  repo?: string
): Promise<boolean> {
  const result = await prisma.environmentVariable.deleteMany({
    where: {
      key,
      scope,
      ...(scope === 'owner' && { owner }),
      ...(scope === 'repo' && { owner, repo }),
    },
  });

  return result.count > 0;
}

// 環境変数の有効/無効を切り替え
export async function toggleEnv(
  key: string,
  scope: 'global' | 'owner' | 'repo',
  enabled: boolean,
  owner?: string,
  repo?: string
): Promise<void> {
  await prisma.environmentVariable.updateMany({
    where: {
      key,
      scope,
      ...(scope === 'owner' && { owner }),
      ...(scope === 'repo' && { owner, repo }),
    },
    data: { enabled },
  });
}
