import type { Task, ResolvedModelSettings } from '@/lib/types';
import { getModelSettings } from './repositories/model-setting';

/**
 * 階層的な設定を解決して、使用するモデルを決定
 * 優先順位: Repository > Owner > Global
 */
export async function resolveModelSettings(
  owner: string,
  repo: string
): Promise<ResolvedModelSettings> {
  // 関連する全ての設定を取得
  const allSettings = await getModelSettings();

  // 有効な設定のみをフィルタ
  const enabled = allSettings.filter((s) => s.enabled);

  // スコープ別に分類
  const global = enabled.find((s) => s.scope === 'global');
  const ownerSetting = enabled.find((s) => s.scope === 'owner' && s.owner === owner);
  const repoSetting = enabled.find(
    (s) => s.scope === 'repo' && s.owner === owner && s.repo === repo
  );

  // 各ステータスのモデルを解決（優先順位: repo > owner > global）
  const resolved: ResolvedModelSettings = {
    backlogModel:
      repoSetting?.backlogModel ||
      ownerSetting?.backlogModel ||
      global?.backlogModel ||
      'claude-3-5-sonnet-20241022',
    planningModel:
      repoSetting?.planningModel ||
      ownerSetting?.planningModel ||
      global?.planningModel ||
      'claude-3-5-sonnet-20241022',
    codingModel:
      repoSetting?.codingModel ||
      ownerSetting?.codingModel ||
      global?.codingModel ||
      'claude-3-5-sonnet-20241022',
    reviewingModel:
      repoSetting?.reviewingModel ||
      ownerSetting?.reviewingModel ||
      global?.reviewingModel ||
      'claude-3-opus-20240229',
  };

  return resolved;
}

/**
 * タスクとタブの状態から、実際に使用するモデルを決定
 */
export async function resolveModel(
  taskStatus: Task['status'],
  owner: string,
  repo: string,
  tabModel?: string
): Promise<string> {
  // 1. タブに明示的なモデル選択があればそれを使用
  if (tabModel) {
    return tabModel;
  }

  // 2. 階層的設定を解決
  const resolved = await resolveModelSettings(owner, repo);

  // 3. タスクステータスに応じたモデルを返す
  switch (taskStatus) {
    case 'backlog':
      return resolved.backlogModel;
    case 'planning':
      return resolved.planningModel;
    case 'coding':
      return resolved.codingModel;
    case 'reviewing':
      return resolved.reviewingModel;
    case 'done':
      // doneステータスは設定なし。reviewingと同じモデルを使用
      return resolved.reviewingModel;
    default:
      return 'claude-3-5-sonnet-20241022'; // フォールバック
  }
}

/**
 * どの階層から解決されたかを返す
 */
export async function getModelSource(
  taskStatus: Task['status'],
  owner: string,
  repo: string,
  tabModel?: string
): Promise<'tab' | 'repo' | 'owner' | 'global'> {
  // タブに明示的な選択があればtab
  if (tabModel) {
    return 'tab';
  }

  // 関連する全ての設定を取得
  const allSettings = await getModelSettings();
  const enabled = allSettings.filter((s) => s.enabled);

  // スコープ別に分類
  const repoSetting = enabled.find(
    (s) => s.scope === 'repo' && s.owner === owner && s.repo === repo
  );
  const ownerSetting = enabled.find((s) => s.scope === 'owner' && s.owner === owner);
  const global = enabled.find((s) => s.scope === 'global');

  // タスクステータスに応じたモデルフィールド名を取得
  let modelField: 'backlogModel' | 'planningModel' | 'codingModel' | 'reviewingModel';
  switch (taskStatus) {
    case 'backlog':
      modelField = 'backlogModel';
      break;
    case 'planning':
      modelField = 'planningModel';
      break;
    case 'coding':
      modelField = 'codingModel';
      break;
    case 'reviewing':
    case 'done':
      modelField = 'reviewingModel';
      break;
    default:
      return 'global';
  }

  // 優先順位に従って解決元を返す
  if (repoSetting && repoSetting[modelField]) {
    return 'repo';
  }
  if (ownerSetting && ownerSetting[modelField]) {
    return 'owner';
  }
  if (global && global[modelField]) {
    return 'global';
  }

  return 'global'; // フォールバック
}
