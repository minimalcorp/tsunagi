'use client';

import type { Task } from '@/lib/types';
import { TaskList } from '@/components/planner/TaskList';

interface TaskListPanelProps {
  tasks: Task[];
  onOrderChange: (taskId: string, newOrder: number) => void;
}

export function TaskListPanel({ tasks, onOrderChange }: TaskListPanelProps) {
  return (
    <div className="flex h-full flex-col">
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
