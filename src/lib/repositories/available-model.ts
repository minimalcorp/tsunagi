import { prisma as db } from '@/lib/db';
import type { AvailableModel } from '@/lib/types';

export async function getAvailableModels(enabledOnly = true): Promise<AvailableModel[]> {
  const where = enabledOnly ? { enabled: true } : {};

  const models = await db.availableModel.findMany({
    where,
    orderBy: { sortOrder: 'asc' },
  });

  return models.map(
    (m): AvailableModel => ({
      id: m.id,
      modelId: m.modelId,
      displayName: m.displayName,
      description: m.description || undefined,
      category: m.category as 'premium' | 'standard' | 'fast',
      enabled: m.enabled,
      sortOrder: m.sortOrder,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    })
  );
}

export async function getAvailableModel(id: string): Promise<AvailableModel | null> {
  const model = await db.availableModel.findUnique({ where: { id } });

  if (!model) return null;

  return {
    id: model.id,
    modelId: model.modelId,
    displayName: model.displayName,
    description: model.description || undefined,
    category: model.category as 'premium' | 'standard' | 'fast',
    enabled: model.enabled,
    sortOrder: model.sortOrder,
    createdAt: model.createdAt.toISOString(),
    updatedAt: model.updatedAt.toISOString(),
  };
}

export async function getAvailableModelByModelId(modelId: string): Promise<AvailableModel | null> {
  const model = await db.availableModel.findUnique({ where: { modelId } });

  if (!model) return null;

  return {
    id: model.id,
    modelId: model.modelId,
    displayName: model.displayName,
    description: model.description || undefined,
    category: model.category as 'premium' | 'standard' | 'fast',
    enabled: model.enabled,
    sortOrder: model.sortOrder,
    createdAt: model.createdAt.toISOString(),
    updatedAt: model.updatedAt.toISOString(),
  };
}

export async function createAvailableModel(
  data: Omit<AvailableModel, 'id' | 'createdAt' | 'updatedAt'>
): Promise<AvailableModel> {
  const model = await db.availableModel.create({
    data: {
      modelId: data.modelId,
      displayName: data.displayName,
      description: data.description || null,
      category: data.category,
      enabled: data.enabled,
      sortOrder: data.sortOrder,
    },
  });

  return {
    id: model.id,
    modelId: model.modelId,
    displayName: model.displayName,
    description: model.description || undefined,
    category: model.category as 'premium' | 'standard' | 'fast',
    enabled: model.enabled,
    sortOrder: model.sortOrder,
    createdAt: model.createdAt.toISOString(),
    updatedAt: model.updatedAt.toISOString(),
  };
}

export async function updateAvailableModel(
  id: string,
  data: Partial<Omit<AvailableModel, 'id' | 'modelId' | 'createdAt' | 'updatedAt'>>
): Promise<AvailableModel> {
  const model = await db.availableModel.update({
    where: { id },
    data: {
      displayName: data.displayName,
      description: data.description === undefined ? undefined : data.description || null,
      category: data.category,
      enabled: data.enabled,
      sortOrder: data.sortOrder,
    },
  });

  return {
    id: model.id,
    modelId: model.modelId,
    displayName: model.displayName,
    description: model.description || undefined,
    category: model.category as 'premium' | 'standard' | 'fast',
    enabled: model.enabled,
    sortOrder: model.sortOrder,
    createdAt: model.createdAt.toISOString(),
    updatedAt: model.updatedAt.toISOString(),
  };
}

export async function deleteAvailableModel(id: string): Promise<void> {
  await db.availableModel.delete({ where: { id } });
}

/**
 * Anthropic APIからモデル一覧を取得してDBを同期
 */
export async function syncModelsFromAnthropicAPI(): Promise<{
  synced: number;
  added: number;
  updated: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let synced = 0;
  let added = 0;
  let updated = 0;

  try {
    // Anthropic APIを呼び出し
    const response = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'anthropic-version': '2023-06-01',
        'X-Api-Key': process.env.ANTHROPIC_API_KEY || '',
      },
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const apiData = await response.json();
    const apiModels = apiData.data || [];

    // 既存モデルを取得
    const existingModels = await db.availableModel.findMany();
    const existingModelIds = new Set(existingModels.map((m: { modelId: string }) => m.modelId));

    // 各APIモデルを処理
    for (const apiModel of apiModels) {
      try {
        const modelId = apiModel.id;
        const displayName = apiModel.display_name || apiModel.id;
        const category = categorizeModel(modelId);

        if (existingModelIds.has(modelId)) {
          // 既存モデルを更新
          await db.availableModel.update({
            where: { modelId },
            data: {
              displayName,
              updatedAt: new Date(),
            },
          });
          updated++;
        } else {
          // 新規モデルを追加
          const maxSortOrder = await db.availableModel.aggregate({
            _max: { sortOrder: true },
          });

          await db.availableModel.create({
            data: {
              modelId,
              displayName,
              category,
              enabled: true,
              sortOrder: (maxSortOrder._max.sortOrder || 0) + 1,
            },
          });
          added++;
        }
        synced++;
      } catch (error) {
        errors.push(`Failed to sync model ${apiModel.id}: ${error}`);
      }
    }

    // APIに存在しないモデルを無効化
    const apiModelIds = new Set(apiModels.map((m: { id: string }) => m.id));
    const modelsToDisable = existingModels.filter(
      (m: { modelId: string; enabled: boolean }) => !apiModelIds.has(m.modelId) && m.enabled
    );

    for (const model of modelsToDisable) {
      await db.availableModel.update({
        where: { id: model.id },
        data: { enabled: false },
      });
    }
  } catch (error) {
    errors.push(`Failed to sync models: ${error}`);
  }

  return { synced, added, updated, errors };
}

/**
 * モデルIDからカテゴリを推測
 */
function categorizeModel(modelId: string): 'premium' | 'standard' | 'fast' {
  if (modelId.includes('opus')) return 'premium';
  if (modelId.includes('haiku')) return 'fast';
  return 'standard';
}

/**
 * 初期データを投入（初回起動時）
 */
export async function seedDefaultModels(): Promise<void> {
  const existingCount = await db.availableModel.count();

  if (existingCount === 0) {
    const defaultModels = [
      {
        modelId: 'claude-3-5-sonnet-20241022',
        displayName: 'Sonnet 3.5',
        description: 'バランスの取れた高性能モデル',
        category: 'premium' as const,
        enabled: true,
        sortOrder: 0,
      },
      {
        modelId: 'claude-3-opus-20240229',
        displayName: 'Opus 3',
        description: '最高性能モデル（高コスト）',
        category: 'premium' as const,
        enabled: true,
        sortOrder: 1,
      },
      {
        modelId: 'claude-3-haiku-20240307',
        displayName: 'Haiku 3',
        description: '高速・低コストモデル',
        category: 'fast' as const,
        enabled: true,
        sortOrder: 2,
      },
    ];

    for (const model of defaultModels) {
      await db.availableModel.create({ data: model });
    }
  }
}
