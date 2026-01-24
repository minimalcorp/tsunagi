import type { ClaudeSession, ClaudeSessionStatus } from './types';

/**
 * Get the current Claude session status
 * Returns the status directly from the session object
 */
export function getClaudeStatus(session: ClaudeSession): ClaudeSessionStatus {
  return session.status;
}

/**
 * Check if a session is in a terminal state (success or error)
 */
export function isTerminalState(status: ClaudeSessionStatus): boolean {
  return status === 'success' || status === 'error';
}

/**
 * Check if a session can accept new messages
 */
export function canSendMessage(session: ClaudeSession): boolean {
  return session.status !== 'running';
}
