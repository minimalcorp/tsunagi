import { prisma } from '../db.js';
import type { EnvironmentVariable } from '@minimalcorp/tsunagi-shared';

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

  return envVars.map(
    (env: {
      key: string;
      value: string;
      scope: string;
      owner: string | null;
      repo: string | null;
      enabled: boolean;
    }) => ({
      key: env.key,
      value: env.value,
      scope: env.scope as 'global' | 'owner' | 'repo',
      owner: env.owner ?? undefined,
      repo: env.repo ?? undefined,
      enabled: env.enabled,
    })
  );
}

// 環境変数取得（優先順位: repo > owner > global）
export async function getEnv(
  scope: 'global' | 'owner' | 'repo',
  owner?: string,
  repo?: string
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const apply = (envs: Array<{ key: string; value: string }>) => {
    envs.forEach((env) => {
      result[env.key] = env.value;
    });
  };

  // グローバル変数を先に適用（有効なもののみ）
  apply(await prisma.environmentVariable.findMany({ where: { scope: 'global', enabled: true } }));

  // owner変数を適用（上書き、有効なもののみ）
  if (scope === 'owner' || scope === 'repo') {
    apply(
      await prisma.environmentVariable.findMany({ where: { scope: 'owner', owner, enabled: true } })
    );
  }

  // repo変数を適用（上書き、有効なもののみ）
  if (scope === 'repo') {
    apply(
      await prisma.environmentVariable.findMany({
        where: { scope: 'repo', owner, repo, enabled: true },
      })
    );
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
