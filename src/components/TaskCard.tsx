'use client';

import Link from 'next/link';
import type { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import type { Task } from '@/lib/types';
import { ClaudeState } from '@/components/ClaudeState';
import { getClaudeStatus } from '@/lib/claude-status';

export interface TabTodo {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

interface TaskCardProps {
  task: Task;
  isDragging: boolean;
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
  /** タブIDをキーにしたTodosのMap（KanbanカードのProgress Bar表示用） */
  tabTodosMap?: Map<string, TabTodo[]>;
}

export function TaskCard({ task, isDragging, dragHandleProps, tabTodosMap }: TaskCardProps) {
  const tabs = task.tabs || [];
  const isClaudeRunning = tabs.some((tab) => tab.status === 'running');

  // running中のタブのTodo進捗（最初のrunning tabのみ表示）
  const runningTab = tabs.find((tab) => tab.status === 'running');
  const runningTabTodos =
    runningTab && tabTodosMap ? tabTodosMap.get(runningTab.tab_id) : undefined;
  const completedTodos = runningTabTodos?.filter((t) => t.status === 'completed').length ?? 0;
  const totalTodos = runningTabTodos?.length ?? 0;
  const showProgressBar = isClaudeRunning && totalTodos > 0;
  const currentTodo = runningTabTodos?.find((t) => t.status === 'in_progress');

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // ドラッグ中はリンク遷移を防止
    if (isDragging) {
      e.preventDefault();
      return;
    }
    // 通常クリック、middle click、Cmd+clickなどは全てブラウザのデフォルト動作に任せる
  };

  return (
    <Link
      {...dragHandleProps}
      href={`/tasks/${task.id}`}
      onClick={handleClick}
      className={`
        block bg-card border border-border rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing flex flex-col gap-1.5
        ${isDragging ? 'shadow-xl rotate-2' : ''}
        ${isClaudeRunning ? 'opacity-50 bg-accent' : ''}
      `}
    >
      {/* Order Badge */}
      {task.order !== undefined && (
        <div
          className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
            isClaudeRunning ? 'bg-muted text-muted-foreground' : 'bg-primary-100 text-primary-700'
          }`}
        >
          #{task.order}
        </div>
      )}

      {/* タイトル */}
      <h3
        className={`font-semibold ${isClaudeRunning ? 'text-muted-foreground' : 'text-foreground'}`}
      >
        {task.title}
      </h3>

      {/* Owner/Repo/Branch */}
      <p
        className={`text-sm ${isClaudeRunning ? 'opacity-60 text-muted-foreground' : 'text-muted-foreground'}`}
      >
        {task.owner}/{task.repo} @ {task.branch}
      </p>

      {/* Progress Bar（running状態かつtodosがある場合） */}
      {showProgressBar && (
        <div>
          <div className="flex items-center gap-1 mb-0.5">
            <div className="flex-1 bg-theme h-1 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-[width]"
                style={{ width: `${totalTodos > 0 ? (completedTodos / totalTodos) * 100 : 0}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground flex-shrink-0">
              {completedTodos}/{totalTodos}
            </span>
          </div>
          {currentTodo && (
            <p className="text-[10px] text-muted-foreground truncate">
              {currentTodo.content.slice(0, 40)}
              {currentTodo.content.length > 40 ? '…' : ''}
            </p>
          )}
        </div>
      )}

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

        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
          {/* 工数 */}
          {task.effort && <span className="font-medium">{task.effort}h</span>}
        </div>
      </div>
    </Link>
  );
}
