'use client';

import { Droppable, Draggable } from '@hello-pangea/dnd';
import { Plus, Trash } from 'lucide-react';
import type { Task } from '@/lib/types';
import { TaskCard, type TabTodo } from './TaskCard';

interface KanbanColumnProps {
  title: string;
  status: 'backlog' | 'planning' | 'coding' | 'reviewing' | 'done';
  tasks: Task[];
  onAddTaskClick?: () => void;
  onBatchDeleteClick?: () => void;
  isBatchDeleting?: boolean;
  nextStep?: 'clone' | 'env' | 'task' | 'complete';
  isAddTaskDialogOpen?: boolean;
  hasApiKey?: boolean;
  tabTodosMap?: Map<string, TabTodo[]>;
}

export function KanbanColumn({
  title,
  status,
  tasks,
  onAddTaskClick,
  onBatchDeleteClick,
  isBatchDeleting = false,
  nextStep,
  isAddTaskDialogOpen = false,
  hasApiKey = false,
  tabTodosMap,
}: KanbanColumnProps) {
  const showAddButton = status === 'backlog' && onAddTaskClick;
  const showBatchDeleteButton = status === 'done' && onBatchDeleteClick;

  return (
    <div className="flex-1 flex flex-col bg-accent rounded-xl p-2 h-full min-w-64">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <div className="flex items-center gap-2">
          {showAddButton && (
            <div className="relative">
              <button
                onClick={onAddTaskClick}
                className="h-8 px-3 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 transition-[color,background-color,transform] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Add Task"
                disabled={!hasApiKey}
              >
                <Plus className="w-4 h-4" />
              </button>
              {nextStep === 'task' && status === 'backlog' && !isAddTaskDialogOpen && (
                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-tooltip backdrop-blur-sm border-2 border-warning text-foreground px-4 py-2 rounded text-base whitespace-nowrap animate-subtle-bounce z-[60] shadow-lg">
                  Create a task
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-tooltip backdrop-blur-sm border-l-2 border-t-2 border-warning rotate-45" />
                </div>
              )}
            </div>
          )}
          {showBatchDeleteButton && (
            <button
              onClick={onBatchDeleteClick}
              className="h-8 px-3 rounded-md text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-95 transition-[color,background-color,transform] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="Delete Old Tasks"
              disabled={tasks.length === 0 || isBatchDeleting}
            >
              <Trash className="w-4 h-4" />
            </button>
          )}
          <span className="text-sm text-muted-foreground">{tasks.length}</span>
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
                      tabTodosMap={tabTodosMap}
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
