'use client';

import { DragDropContext, type DropResult } from '@hello-pangea/dnd';
import type { Task } from '@/lib/types';
import { KanbanColumn } from './KanbanColumn';

interface KanbanBoardProps {
  tasks: Task[];
  onTaskMove: (taskId: string, newStatus: Task['status']) => void;
  onAddTaskClick?: () => void;
  onBatchDeleteClick?: () => void;
  isBatchDeleting?: boolean;
  nextStep?: 'clone' | 'env' | 'task' | 'complete';
  isAddTaskDialogOpen?: boolean;
  hasApiKey?: boolean;
}

export function KanbanBoard({
  tasks,
  onTaskMove,
  onAddTaskClick,
  onBatchDeleteClick,
  isBatchDeleting = false,
  nextStep,
  isAddTaskDialogOpen = false,
  hasApiKey = false,
}: KanbanBoardProps) {
  // タスクソート: order 昇順（undefined は最後）
  const sortTasks = (a: Task, b: Task) => {
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
          onAddTaskClick={onAddTaskClick}
          nextStep={nextStep}
          isAddTaskDialogOpen={isAddTaskDialogOpen}
          hasApiKey={hasApiKey}
        />
        <KanbanColumn title="Planning" status="planning" tasks={planningTasks} />
        <KanbanColumn title="Coding" status="coding" tasks={codingTasks} />
        <KanbanColumn title="Reviewing" status="reviewing" tasks={reviewingTasks} />
        <KanbanColumn
          title="Done"
          status="done"
          tasks={doneTasks}
          onBatchDeleteClick={onBatchDeleteClick}
          isBatchDeleting={isBatchDeleting}
        />
      </div>
    </DragDropContext>
  );
}
