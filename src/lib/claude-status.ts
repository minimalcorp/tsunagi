import type { Tab } from './types';

export type TabStatus = 'idle' | 'running' | 'success' | 'error';

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
