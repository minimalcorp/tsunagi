'use client';

import type { Task, ClaudeSession } from '@/lib/types';
import { Loader2, CheckCircle2, XCircle, PauseCircle, Circle } from 'lucide-react';

interface TaskCardProps {
  task: Task;
  latestSession?: ClaudeSession;
  isDragging: boolean;
  onTaskClick?: (taskId: string) => void;
}

export function TaskCard({ task, latestSession, isDragging, onTaskClick }: TaskCardProps) {
  // Claude実行状態のアイコン判定
  const getStateIcon = () => {
    if (task.claudeState === 'running') {
      return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
    }
    if (!latestSession) {
      return <Circle className="w-4 h-4 text-gray-300" />;
    }
    if (latestSession.status === 'completed') {
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    }
    if (latestSession.status === 'failed') {
      return <XCircle className="w-4 h-4 text-red-500" />;
    }
    return <PauseCircle className="w-4 h-4 text-gray-500" />;
  };

  const stateIcon = getStateIcon();
  const isClaudeRunning = task.claudeState === 'running';

  return (
    <div
      className={`
        bg-theme-card border border-theme rounded-lg p-4 cursor-pointer
        hover:border-blue-500 transition-colors
        ${isDragging ? 'shadow-xl rotate-2' : ''}
        ${isClaudeRunning ? 'opacity-50 bg-theme-hover' : ''}
      `}
      onClick={() => onTaskClick?.(task.id)}
    >
      {/* Order Badge */}
      {task.order !== undefined && (
        <div
          className={`inline-block px-2 py-0.5 text-xs font-medium rounded mb-2 ${
            isClaudeRunning ? 'bg-gray-200 text-gray-600' : 'bg-blue-100 text-blue-800'
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
        <div className="flex items-center gap-1 text-xs text-theme-muted">
          {stateIcon}
          <span>{task.claudeState}</span>
        </div>

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
