import { prisma } from '../db';
import type { ClaudeSettingSources, SettingSource, ResolvedSettings } from '../types';
import * as envRepo from './environment';

/**
 * 設定の取得（優先順位: repo > owner > global）
 */
export async function getSettingSources(
  scope: 'global' | 'owner' | 'repo',
  owner?: string,
  repo?: string
): Promise<SettingSource[] | undefined> {
  let result: ClaudeSettingSources | undefined;

  // repo スコープの設定を優先
  if (scope === 'repo' && owner && repo) {
    const setting = await prisma.claudeSetting.findFirst({
      where: { scope: 'repo', owner, repo, enabled: true },
    });
    if (setting) {
      result = {
        scope: setting.scope as 'repo',
        owner: setting.owner ?? undefined,
        repo: setting.repo ?? undefined,
        sources: JSON.parse(setting.sources as string) as SettingSource[],
        enabled: setting.enabled,
      };
    }
  }

  // owner スコープの設定を次に優先
  if (!result && (scope === 'owner' || scope === 'repo') && owner) {
    const setting = await prisma.claudeSetting.findFirst({
      where: { scope: 'owner', owner, enabled: true },
    });
    if (setting) {
      result = {
        scope: setting.scope as 'owner',
        owner: setting.owner ?? undefined,
        repo: setting.repo ?? undefined,
        sources: JSON.parse(setting.sources as string) as SettingSource[],
        enabled: setting.enabled,
      };
    }
  }

  // global スコープの設定を最後に使用
  if (!result) {
    const setting = await prisma.claudeSetting.findFirst({
      where: { scope: 'global', enabled: true },
    });
    if (setting) {
      result = {
        scope: setting.scope as 'global',
        owner: setting.owner ?? undefined,
        repo: setting.repo ?? undefined,
        sources: JSON.parse(setting.sources as string) as SettingSource[],
        enabled: setting.enabled,
      };
    }
  }

  // 設定が見つからない、またはsourcesが空の場合はundefined（isolationモード）
  return result && result.sources.length > 0 ? result.sources : undefined;
}

/**
 * 設定の保存
 */
export async function setSettingSources(
  scope: 'global' | 'owner' | 'repo',
  sources: SettingSource[],
  owner?: string,
  repo?: string
): Promise<void> {
  // 既存の設定を削除
  await prisma.claudeSetting.deleteMany({
    where: {
      scope,
      ...(scope === 'owner' && { owner }),
      ...(scope === 'repo' && { owner, repo }),
    },
  });

  // 新しい設定を作成
  await prisma.claudeSetting.create({
    data: {
      scope,
      owner,
      repo,
      sources: JSON.stringify(sources),
      enabled: true,
    },
  });
}

/**
 * 設定の削除
 */
export async function deleteSettingSources(
  scope: 'global' | 'owner' | 'repo',
  owner?: string,
  repo?: string
): Promise<void> {
  await prisma.claudeSetting.deleteMany({
    where: {
      scope,
      ...(scope === 'owner' && { owner }),
      ...(scope === 'repo' && { owner, repo }),
    },
  });
}

/**
 * 設定の有効/無効切り替え
 */
export async function toggleSettingSources(
  scope: 'global' | 'owner' | 'repo',
  enabled: boolean,
  owner?: string,
  repo?: string
): Promise<void> {
  await prisma.claudeSetting.updateMany({
    where: {
      scope,
      ...(scope === 'owner' && { owner }),
      ...(scope === 'repo' && { owner, repo }),
    },
    data: { enabled },
  });
}

/**
 * resolveSettings: プロジェクト固有の設定を解決（環境変数も含む）
 */
export async function resolveSettings(params: {
  owner: string;
  repo: string;
}): Promise<ResolvedSettings> {
  const { owner, repo } = params;

  // settingSourcesを取得
  const settingSources = await getSettingSources('repo', owner, repo);

  // 環境変数を取得（Claude Tokenを含む）
  const env = await envRepo.getEnv('repo', owner, repo);

  return {
    settingSources,
    env,
  };
}
