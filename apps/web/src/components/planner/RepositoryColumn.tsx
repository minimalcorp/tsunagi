'use client';

import { ChevronsLeft } from 'lucide-react';
import type { Task } from '@minimalcorp/tsunagi-shared';
import { SearchAndFilterBar, type FilterState } from '@/components/planner/FilterBar';
import { TaskList } from '@/components/planner/TaskList';
import { Button } from '@/components/ui/button';
import { getRepoColor } from '@/lib/repo-colors';
import { cn } from '@/lib/utils';
import type { TabTodosMap } from '@/hooks/useTerminalTodos';

interface RepositoryColumnProps {
  owner: string;
  repo: string;
  /** そのリポジトリのタスク（フィルタ適用・order昇順ソート済み） */
  tasks: Task[];
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  onReorder: (reorderedTasks: Task[]) => void;
  onAddTask: () => void;
  /** この列を先頭に移動する。先頭の列では undefined */
  onMoveToFront?: () => void;
  /** ドラッグ中かどうかを親（ボード）に伝える */
  onDragStateChange?: (isDragging: boolean) => void;
  tabTodosMap: TabTodosMap;
}

export function RepositoryColumn({
  owner,
  repo,
  tasks,
  filters,
  onFilterChange,
  onReorder,
  onAddTask,
  onMoveToFront,
  onDragStateChange,
  tabTodosMap,
}: RepositoryColumnProps) {
  const repoColor = getRepoColor(owner, repo);

  return (
    <div className="flex h-full flex-col">
      {/* Column header: repository + task count */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 pt-4">
        <span
          className={cn(
            'inline-flex h-6 min-w-0 items-center rounded-full px-2.5 text-xs font-medium',
            repoColor.bg,
            repoColor.text
          )}
          title={`${owner}/${repo}`}
          data-repo={`${owner}/${repo}`}
        >
          <span className="truncate">
            {owner}/{repo}
          </span>
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">{tasks.length}</span>

        {/* 並び順の細かい変更は settings ページ。ここは「先頭に持ってくる」だけ */}
        {onMoveToFront && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onMoveToFront}
            className="ml-auto size-6 flex-shrink-0 text-muted-foreground"
            title="Move to front"
          >
            <ChevronsLeft className="size-3.5" />
          </Button>
        )}
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
        {tasks.length > 0 ? (
          <TaskList
            droppableId={`planner-task-list-${owner}/${repo}`}
            tasks={tasks}
            onReorder={onReorder}
            onDragStateChange={onDragStateChange}
            tabTodosMap={tabTodosMap}
          />
        ) : (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            No tasks found
          </div>
        )}
      </div>
    </div>
  );
}
