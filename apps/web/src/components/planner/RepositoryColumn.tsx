'use client';

import type { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import { GripVertical } from 'lucide-react';
import type { Task } from '@minimalcorp/tsunagi-shared';
import { SearchAndFilterBar, type FilterState } from '@/components/planner/FilterBar';
import { TaskList } from '@/components/planner/TaskList';
import { getRepoColor } from '@/lib/repo-colors';
import { cn } from '@/lib/utils';
import type { TabTodosMap } from '@/hooks/useTerminalTodos';

interface RepositoryColumnProps {
  owner: string;
  repo: string;
  /** そのリポジトリのタスク（フィルタ適用・order昇順ソート済み） */
  tasks: Task[];
  droppableId: string;
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  onAddTask: () => void;
  /** 列ヘッダーを掴んで列自体を並び替えるためのハンドル */
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
  tabTodosMap: TabTodosMap;
}

export function RepositoryColumn({
  owner,
  repo,
  tasks,
  droppableId,
  filters,
  onFilterChange,
  onAddTask,
  dragHandleProps,
  tabTodosMap,
}: RepositoryColumnProps) {
  const repoColor = getRepoColor(owner, repo);

  return (
    <div className="flex h-full flex-col">
      {/* Column header: 掴んで列を並び替えられる */}
      <div
        {...dragHandleProps}
        className="flex-shrink-0 flex items-center gap-1.5 px-4 pt-4 cursor-grab active:cursor-grabbing"
        title={`${owner}/${repo} — drag to reorder`}
      >
        <GripVertical className="size-3.5 flex-shrink-0 text-muted-foreground" />
        <span
          className={cn(
            'inline-flex h-6 min-w-0 items-center rounded-full px-2.5 text-xs font-medium',
            repoColor.bg,
            repoColor.text
          )}
          data-repo={`${owner}/${repo}`}
        >
          <span className="truncate">
            {owner}/{repo}
          </span>
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">{tasks.length}</span>
      </div>

      {/* Search + Filter + Add task (このリポジトリに対して作用する) */}
      <div className="flex-shrink-0 px-4 pt-2">
        <SearchAndFilterBar
          repositories={[]}
          filters={filters}
          onFilterChange={onFilterChange}
          onAddTask={onAddTask}
        />
      </div>

      {/* Scrollable task list */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* タスクが0件でも Droppable は常にマウントしておく */}
        <TaskList droppableId={droppableId} tasks={tasks} tabTodosMap={tabTodosMap} />
        {tasks.length === 0 && (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            No tasks found
          </div>
        )}
      </div>
    </div>
  );
}
