'use client';

import { Droppable, Draggable } from '@hello-pangea/dnd';
import { Plus } from 'lucide-react';
import type { Task, ClaudeSession } from '@/lib/types';
import { TaskCard } from './TaskCard';

interface KanbanColumnProps {
  title: string;
  status: 'backlog' | 'planning' | 'coding' | 'reviewing' | 'done';
  tasks: Task[];
  sessions?: Record<string, ClaudeSession[]>; // taskId -> sessions array
  onTaskClick?: (taskId: string) => void;
  onAddTaskClick?: () => void;
  nextStep?: 'clone' | 'env' | 'task' | 'complete';
  isAddTaskDialogOpen?: boolean;
}

export function KanbanColumn({
  title,
  status,
  tasks,
  sessions,
  onTaskClick,
  onAddTaskClick,
  nextStep,
  isAddTaskDialogOpen = false,
}: KanbanColumnProps) {
  const showAddButton = status === 'backlog' && onAddTaskClick;

  return (
    <div className="min-w-64 flex flex-col bg-theme-hover rounded-lg p-4 h-full">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h2 className="text-lg font-semibold text-theme-fg">{title}</h2>
        <div className="flex items-center gap-2">
          {showAddButton && (
            <div className="relative">
              <button
                onClick={onAddTaskClick}
                className="px-3 py-1 rounded bg-primary text-white hover:bg-primary-hover active:scale-95 transition-transform cursor-pointer"
                title="Add Task"
              >
                <Plus className="w-4 h-4" />
              </button>
              {nextStep === 'task' && status === 'backlog' && !isAddTaskDialogOpen && (
                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border-2 border-amber-500 text-amber-900 dark:text-amber-100 px-4 py-2 rounded text-base whitespace-nowrap animate-subtle-bounce z-[60] shadow-lg">
                  Create a task
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border-l-2 border-t-2 border-amber-500 rotate-45" />
                </div>
              )}
            </div>
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
            className={`flex-1 space-y-2 overflow-y-auto ${snapshot.isDraggingOver ? 'bg-primary-50' : ''}`}
          >
            {tasks.map((task, index) => (
              <Draggable key={task.id} draggableId={task.id} index={index}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                  >
                    <TaskCard
                      task={task}
                      sessions={sessions?.[task.id] || []}
                      isDragging={snapshot.isDragging}
                      onTaskClick={onTaskClick}
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
