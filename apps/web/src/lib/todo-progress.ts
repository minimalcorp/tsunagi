import type { Todo } from '@minimalcorp/tsunagi-shared';

/** 表示用の状態。blocked は pending のうち、未完了の blockedBy が残っているもの */
export type TodoDisplayStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';

export interface TodoProgress {
  /** 表示対象（deleted を除外済み） */
  items: Array<Todo & { displayStatus: TodoDisplayStatus }>;
  completed: number;
  total: number;
  /** 実行中ステップの表示名（activeForm 優先、なければ content） */
  current?: string;
}

/** todos（deleted を含みうる）から表示用の進捗を計算する */
export function computeTodoProgress(todos: Todo[]): TodoProgress {
  const visible = todos.filter((t) => t.status !== 'deleted');
  const completedIds = new Set(
    visible.filter((t) => t.status === 'completed' && t.id).map((t) => t.id)
  );
  // 削除済み・一覧外の ID は待つ対象にしない
  const knownIds = new Set(visible.map((t) => t.id).filter(Boolean));

  const items = visible.map((t) => {
    const isBlocked =
      t.status === 'pending' &&
      (t.blockedBy ?? []).some((id) => knownIds.has(id) && !completedIds.has(id));
    return {
      ...t,
      displayStatus: (isBlocked ? 'blocked' : t.status) as TodoDisplayStatus,
    };
  });

  const inProgress = items.find((t) => t.status === 'in_progress');
  return {
    items,
    completed: items.filter((t) => t.status === 'completed').length,
    total: items.length,
    current: inProgress ? inProgress.activeForm || inProgress.content : undefined,
  };
}

/**
 * 複数タブ（セッション）の進捗を合算する。
 * Task の ID はセッションごとの採番で重複しうるため、blocked 判定はタブ単位で行ってから合算する
 */
export function sumTodoProgress(todosPerTab: Todo[][]): TodoProgress {
  const perTab = todosPerTab.map(computeTodoProgress);
  return {
    items: perTab.flatMap((p) => p.items),
    completed: perTab.reduce((sum, p) => sum + p.completed, 0),
    total: perTab.reduce((sum, p) => sum + p.total, 0),
    current: perTab.find((p) => p.current)?.current,
  };
}
