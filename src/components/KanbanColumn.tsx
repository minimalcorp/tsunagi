'use client';

import { Droppable, Draggable } from '@hello-pangea/dnd';
import { Plus, Trash } from 'lucide-react';
import type { Task } from '@/lib/types';
import { TaskCard } from './TaskCard';

interface KanbanColumnProps {
  title: string;
  status: 'backlog' | 'planning' | 'coding' | 'reviewing' | 'done';
  tasks: Task[];
  onAddTaskClick?: () => void;
  onBatchDeleteClick?: () => void;
  nextStep?: 'clone' | 'env' | 'task' | 'complete';
  isAddTaskDialogOpen?: boolean;
  hasApiKey?: boolean;
}

export function KanbanColumn({
  title,
  status,
  tasks,
  onAddTaskClick,
  onBatchDeleteClick,
  nextStep,
  isAddTaskDialogOpen = false,
  hasApiKey = false,
}: KanbanColumnProps) {
  const showAddButton = status === 'backlog' && onAddTaskClick;
  const showBatchDeleteButton = status === 'done' && onBatchDeleteClick;

  return (
    <div className="flex-1 flex flex-col bg-theme-hover rounded-lg p-4 h-full min-w-64">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h2 className="text-lg font-semibold text-theme-fg">{title}</h2>
        <div className="flex items-center gap-2">
          {showAddButton && (
            <div className="relative">
              <button
                onClick={onAddTaskClick}
                className="px-3 py-1 rounded bg-primary text-white hover:bg-primary-hover active:scale-95 transition-transform cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Add Task"
                disabled={!hasApiKey}
              >
                <Plus className="w-4 h-4" />
              </button>
              {nextStep === 'task' && status === 'backlog' && !isAddTaskDialogOpen && (
                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-tooltip backdrop-blur-sm border-2 border-amber-500 text-theme-fg px-4 py-2 rounded text-base whitespace-nowrap animate-subtle-bounce z-[60] shadow-lg">
                  Create a task
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-tooltip backdrop-blur-sm border-l-2 border-t-2 border-amber-500 rotate-45" />
                </div>
              )}
            </div>
          )}
          {showBatchDeleteButton && (
            <button
              onClick={onBatchDeleteClick}
              className="px-3 py-1 rounded bg-red-500 text-white hover:bg-red-600 active:scale-95 transition-transform cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="Delete Old Tasks"
              disabled={tasks.length === 0}
            >
              <Trash className="w-4 h-4" />
            </button>
          )}
          <span className="text-sm text-theme-muted">{tasks.length}</span>
        </div>
      </div>

      {/* タスクリスト（縦スクロール） */}
      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 space-y-2 overflow-y-auto p-1 ${snapshot.isDraggingOver ? 'bg-primary-50' : ''}`}
          >
            {tasks.map((task, index) => (
              <Draggable key={task.id} draggableId={task.id} index={index}>
                {(provided, snapshot) => (
                  <div ref={provided.innerRef} {...provided.draggableProps}>
                    <TaskCard
                      task={task}
                      isDragging={snapshot.isDragging}
                      dragHandleProps={provided.dragHandleProps}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
