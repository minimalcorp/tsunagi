'use client';

import { DragDropContext, type DropResult } from '@hello-pangea/dnd';
import type { Task } from '@/lib/types';
import { KanbanColumn } from './KanbanColumn';

interface KanbanBoardProps {
  tasks: Task[];
  onTaskMove: (taskId: string, newStatus: Task['status']) => void;
  onTaskClick?: (taskId: string) => void;
  onAddTaskClick?: () => void;
  nextStep?: 'clone' | 'env' | 'task' | 'complete';
  isAddTaskDialogOpen?: boolean;
  hasApiKey?: boolean;
}

export function KanbanBoard({
  tasks,
  onTaskMove,
  onTaskClick,
  onAddTaskClick,
  nextStep,
  isAddTaskDialogOpen = false,
  hasApiKey = false,
}: KanbanBoardProps) {
  // タスクソート: 人間タスク（上）→ Claude実行中タスク（下、グレーアウト）、それぞれ order 昇順
  const sortTasks = (a: Task, b: Task) => {
    const aIsClaudeRunning = a.claudeState === 'running';
    const bIsClaudeRunning = b.claudeState === 'running';

    // Claude実行中タスクは下に配置
    if (aIsClaudeRunning !== bIsClaudeRunning) {
      return aIsClaudeRunning ? 1 : -1;
    }

    // 同じグループ内では order 順（undefined は最後）
    if (a.order === undefined && b.order === undefined) return 0;
    if (a.order === undefined) return 1;
    if (b.order === undefined) return -1;
    return a.order - b.order;
  };

  const backlogTasks = tasks.filter((t) => t.status === 'backlog').sort(sortTasks);
  const planningTasks = tasks.filter((t) => t.status === 'planning').sort(sortTasks);
  const codingTasks = tasks.filter((t) => t.status === 'coding').sort(sortTasks);
  const reviewingTasks = tasks.filter((t) => t.status === 'reviewing').sort(sortTasks);
  const doneTasks = tasks.filter((t) => t.status === 'done').sort(sortTasks);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const { source, destination, draggableId } = result;

    if (source.droppableId === destination.droppableId) {
      // 同じカラム内での移動（順序変更）
      return;
    }

    // ステータス更新
    const newStatus = destination.droppableId as Task['status'];
    onTaskMove(draggableId, newStatus);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex-1 flex gap-4 p-6 overflow-x-auto h-full">
        <KanbanColumn
          title="Backlog"
          status="backlog"
          tasks={backlogTasks}
          onTaskClick={onTaskClick}
          onAddTaskClick={onAddTaskClick}
          nextStep={nextStep}
          isAddTaskDialogOpen={isAddTaskDialogOpen}
          hasApiKey={hasApiKey}
        />
        <KanbanColumn
          title="Planning"
          status="planning"
          tasks={planningTasks}
          onTaskClick={onTaskClick}
        />
        <KanbanColumn
          title="Coding"
          status="coding"
          tasks={codingTasks}
          onTaskClick={onTaskClick}
        />
        <KanbanColumn
          title="Reviewing"
          status="reviewing"
          tasks={reviewingTasks}
          onTaskClick={onTaskClick}
        />
        <KanbanColumn title="Done" status="done" tasks={doneTasks} onTaskClick={onTaskClick} />
      </div>
    </DragDropContext>
  );
}
