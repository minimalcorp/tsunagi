import { prisma as db } from '@/lib/db';
import type { ModelSetting } from '@/lib/types';

export interface GetModelSettingsParams {
  scope?: 'global' | 'owner' | 'repo';
  owner?: string;
  repo?: string;
}

export async function getModelSettings(params?: GetModelSettingsParams): Promise<ModelSetting[]> {
  const where: {
    scope?: string;
    owner?: string;
    repo?: string;
  } = {};

  if (params?.scope) {
    where.scope = params.scope;
  }
  if (params?.owner) {
    where.owner = params.owner;
  }
  if (params?.repo) {
    where.repo = params.repo;
  }

  const settings = await db.modelSetting.findMany({ where });

  return settings.map(
    (s): ModelSetting => ({
      id: s.id,
      scope: s.scope as 'global' | 'owner' | 'repo',
      owner: s.owner || undefined,
      repo: s.repo || undefined,
      backlogModel: s.backlogModel,
      planningModel: s.planningModel,
      codingModel: s.codingModel,
      reviewingModel: s.reviewingModel,
      enabled: s.enabled,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })
  );
}

export async function getModelSetting(
  scope: 'global' | 'owner' | 'repo',
  owner?: string,
  repo?: string
): Promise<ModelSetting | null> {
  const setting = await db.modelSetting.findFirst({
    where: {
      scope,
      owner: owner || null,
      repo: repo || null,
    },
  });

  if (!setting) return null;

  return {
    id: setting.id,
    scope: setting.scope as 'global' | 'owner' | 'repo',
    owner: setting.owner || undefined,
    repo: setting.repo || undefined,
    backlogModel: setting.backlogModel,
    planningModel: setting.planningModel,
    codingModel: setting.codingModel,
    reviewingModel: setting.reviewingModel,
    enabled: setting.enabled,
    createdAt: setting.createdAt.toISOString(),
    updatedAt: setting.updatedAt.toISOString(),
  };
}

export async function createModelSetting(
  data: Omit<ModelSetting, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ModelSetting> {
  const setting = await db.modelSetting.create({
    data: {
      scope: data.scope,
      owner: data.owner || null,
      repo: data.repo || null,
      backlogModel: data.backlogModel,
      planningModel: data.planningModel,
      codingModel: data.codingModel,
      reviewingModel: data.reviewingModel,
      enabled: data.enabled,
    },
  });

  return {
    id: setting.id,
    scope: setting.scope as 'global' | 'owner' | 'repo',
    owner: setting.owner || undefined,
    repo: setting.repo || undefined,
    backlogModel: setting.backlogModel,
    planningModel: setting.planningModel,
    codingModel: setting.codingModel,
    reviewingModel: setting.reviewingModel,
    enabled: setting.enabled,
    createdAt: setting.createdAt.toISOString(),
    updatedAt: setting.updatedAt.toISOString(),
  };
}

export async function updateModelSetting(
  id: string,
  data: Partial<Omit<ModelSetting, 'id' | 'scope' | 'owner' | 'repo' | 'createdAt' | 'updatedAt'>>
): Promise<ModelSetting> {
  const setting = await db.modelSetting.update({
    where: { id },
    data: {
      backlogModel: data.backlogModel,
      planningModel: data.planningModel,
      codingModel: data.codingModel,
      reviewingModel: data.reviewingModel,
      enabled: data.enabled,
    },
  });

  return {
    id: setting.id,
    scope: setting.scope as 'global' | 'owner' | 'repo',
    owner: setting.owner || undefined,
    repo: setting.repo || undefined,
    backlogModel: setting.backlogModel,
    planningModel: setting.planningModel,
    codingModel: setting.codingModel,
    reviewingModel: setting.reviewingModel,
    enabled: setting.enabled,
    createdAt: setting.createdAt.toISOString(),
    updatedAt: setting.updatedAt.toISOString(),
  };
}

export async function deleteModelSetting(id: string): Promise<void> {
  await db.modelSetting.delete({ where: { id } });
}

export async function ensureGlobalModelSetting(): Promise<ModelSetting> {
  let setting = await getModelSetting('global');

  if (!setting) {
    setting = await createModelSetting({
      scope: 'global',
      backlogModel: 'claude-3-5-sonnet-20241022',
      planningModel: 'claude-3-5-sonnet-20241022',
      codingModel: 'claude-3-5-sonnet-20241022',
      reviewingModel: 'claude-3-opus-20240229',
      enabled: true,
    });
  }

  return setting;
}
