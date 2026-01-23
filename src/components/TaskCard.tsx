'use client';

import type { Task, ClaudeSession } from '@/lib/types';
import { ClaudeState } from '@/components/ClaudeState';

interface TaskCardProps {
  task: Task;
  latestSession?: ClaudeSession;
  isDragging: boolean;
  onTaskClick?: (taskId: string) => void;
}

export function TaskCard({ task, latestSession, isDragging, onTaskClick }: TaskCardProps) {
  const isClaudeRunning = task.claudeState === 'running';

  return (
    <div
      className={`
        bg-theme-card border border-theme rounded-lg p-4 cursor-pointer
        hover:border-primary
        ${isDragging ? 'shadow-xl rotate-2' : ''}
        ${isClaudeRunning ? 'opacity-50 bg-theme-hover' : ''}
      `}
      onClick={() => onTaskClick?.(task.id)}
    >
      {/* Order Badge */}
      {task.order !== undefined && (
        <div
          className={`inline-block px-2 py-0.5 text-xs font-medium rounded mb-2 ${
            isClaudeRunning ? 'bg-gray-200 text-gray-600' : 'bg-primary-100 text-primary-700'
          }`}
        >
          #{task.order}
        </div>
      )}

      {/* タイトル */}
      <h3
        className={`font-semibold mb-2 ${isClaudeRunning ? 'text-theme-muted' : 'text-theme-fg'}`}
      >
        {task.title}
      </h3>

      {/* Owner/Repo/Branch */}
      <p
        className={`text-sm mb-2 ${isClaudeRunning ? 'opacity-60 text-theme-muted' : 'text-theme-muted'}`}
      >
        {task.owner}/{task.repo} @ {task.branch}
      </p>

      {/* Claude状態とメタ情報 */}
      <div className="flex items-center justify-between">
        <ClaudeState task={task} session={latestSession} />

        <div className="flex items-center gap-2 text-xs text-theme-muted">
          {/* 工数 */}
          {task.effort && <span className="font-medium">{task.effort}h</span>}

          {/* ログ数 */}
          {latestSession && latestSession.logs.length > 0 && (
            <span>{latestSession.logs.length} logs</span>
          )}
        </div>
      </div>
    </div>
  );
}
