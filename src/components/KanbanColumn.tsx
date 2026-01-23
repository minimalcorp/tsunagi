'use client';

import { Droppable, Draggable } from '@hello-pangea/dnd';
import type { Task, ClaudeSession } from '@/lib/types';
import { TaskCard } from './TaskCard';

interface KanbanColumnProps {
  title: string;
  status: 'backlog' | 'planning' | 'tasking' | 'coding' | 'reviewing' | 'done';
  tasks: Task[];
  sessions?: Record<string, ClaudeSession>; // taskId -> latest session
  onTaskClick?: (taskId: string) => void;
}

export function KanbanColumn({ title, status, tasks, sessions, onTaskClick }: KanbanColumnProps) {
  return (
    <div className="min-w-64 flex flex-col bg-theme-hover rounded-lg p-4 h-full">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h2 className="text-lg font-semibold text-theme-fg">{title}</h2>
        <span className="text-sm text-theme-muted">{tasks.length}</span>
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
                      latestSession={sessions?.[task.id]}
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
