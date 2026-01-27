'use client';

import type { Task } from '@/lib/types';
import { ClaudeState } from '@/components/ClaudeState';
import { getClaudeStatus } from '@/lib/claude-status';
import { MessageCircle } from 'lucide-react';

interface TaskCardProps {
  task: Task;
  isDragging: boolean;
  onTaskClick?: (taskId: string) => void;
}

export function TaskCard({ task, isDragging, onTaskClick }: TaskCardProps) {
  const isClaudeRunning = task.claudeState === 'running';
  const tabs = task.tabs || [];
  const totalUserMessages = tabs.reduce((sum, tab) => sum + (tab.userPromptCount ?? 0), 0);

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
      <div className="flex items-center justify-between gap-2">
        {/* タブ状態を横に並べて表示（横スクロール対応） */}
        <div className="flex items-center gap-1 overflow-x-auto overflow-y-hidden flex-shrink min-w-0">
          {tabs.length > 0 ? (
            tabs.map((tab) => (
              <ClaudeState key={tab.tab_id} status={getClaudeStatus(tab)} showLabel={false} />
            ))
          ) : (
            <ClaudeState status="idle" showLabel={false} />
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-theme-muted flex-shrink-0">
          {/* 工数 */}
          {task.effort && <span className="font-medium">{task.effort}h</span>}

          {/* ユーザーメッセージ数 */}
          {totalUserMessages > 0 && (
            <div className="flex items-center gap-1">
              <span>{totalUserMessages}</span>
              <MessageCircle className="w-3 h-3" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
