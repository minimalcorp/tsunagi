'use client';

import type { Task, Repository } from '@/lib/types';
import { SearchAndFilterBar, type FilterState } from '@/components/planner/FilterBar';
import { TaskList } from '@/components/planner/TaskList';

interface TaskListPanelProps {
  tasks: Task[];
  repositories: Repository[];
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  onOrderChange: (taskId: string, newOrder: number) => void;
  onAddTask?: () => void;
}

export function TaskListPanel({
  tasks,
  repositories,
  filters,
  onFilterChange,
  onOrderChange,
  onAddTask,
}: TaskListPanelProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Search + Filter button */}
      <div className="flex-shrink-0 px-4 pt-4">
        <SearchAndFilterBar
          repositories={repositories}
          filters={filters}
          onFilterChange={onFilterChange}
          onAddTask={onAddTask}
        />
      </div>

      {/* Scrollable task list */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {tasks.length > 0 ? (
          <TaskList tasks={tasks} onOrderChange={onOrderChange} />
        ) : (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            No tasks found
          </div>
        )}
      </div>
    </div>
  );
}
