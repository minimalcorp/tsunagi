import type { Tab, Task } from '@minimalcorp/tsunagi-shared';

export type TabStatus = 'idle' | 'running' | 'waiting' | 'success' | 'error';

/**
 * Get the current Claude tab status
 * Returns the status directly from the tab object
 */
export function getClaudeStatus(tab: Tab): TabStatus {
  return tab.status;
}

/**
 * Check if a tab is in a terminal state (success or error)
 */
export function isTerminalState(status: TabStatus): boolean {
  return status === 'success' || status === 'error';
}

/**
 * Check if a tab can accept new messages
 */
export function canSendMessage(tab: Tab): boolean {
  return tab.status !== 'running';
}

/**
 * status から未読フラグを導出する（undefined = 未読状態を変えない）。
 * サーバ側 (apps/server/src/routes/hooks.ts の unreadForStatus) と同じルール。
 * リアルタイム更新は status-changed イベントしか流れてこないため、web 側でも同じ導出を行う。
 */
export function unreadForStatus(status: TabStatus): boolean | undefined {
  if (isTerminalState(status)) return true;
  if (status === 'running' || status === 'idle') return false;
  // waiting は未読状態を変えない
  return undefined;
}

/** タスクカード左端に出す未確認マーカーの種類 */
export type UnreadKind = 'success' | 'error' | 'waiting';

/**
 * 未確認マーカーの種類を返す（null = マーカーなし）。
 * 優先順位は ClaudeStatusIndicator と揃える: running > waiting > error > success。
 * waiting（許可待ち）は未読フラグではなく status から判定する。ユーザーの入力を
 * 待って止まっている状態なので、開いたかどうかに関わらず一覧で気付けるようにする。
 */
export function unreadKind(task: Pick<Task, 'tabs'>): UnreadKind | null {
  const tabs = task.tabs ?? [];
  if (tabs.length === 0) return null;
  if (tabs.some((tab) => tab.status === 'running')) return null;
  if (tabs.some((tab) => tab.status === 'waiting')) return 'waiting';

  const unread = tabs.filter((tab) => tab.unread);
  if (unread.some((tab) => tab.status === 'error')) return 'error';
  if (unread.some((tab) => tab.status === 'success')) return 'success';
  return null;
}

/** 未確認マーカーが出る状態か（列ヘッダーの件数・タブタイトルの未読数に使う） */
export function hasUnreadResult(task: Pick<Task, 'tabs'>): boolean {
  return unreadKind(task) !== null;
}
