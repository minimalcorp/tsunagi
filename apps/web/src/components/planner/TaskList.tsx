'use client';

import { useCallback } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import type { Task } from '@minimalcorp/tsunagi-shared';
import { TaskCard } from '@/components/planner/TaskCard';
import type { TabTodosMap } from '@/hooks/useTerminalTodos';

interface TaskListProps {
  /** 複数リストを同一画面に並べるため、リストごとに一意なIDを渡す */
  droppableId: string;
  tasks: Task[];
  onReorder: (reorderedTasks: Task[]) => void;
  /** ドラッグ中かどうかを親に伝える（横スクロールのスナップ制御に使う） */
  onDragStateChange?: (isDragging: boolean) => void;
  tabTodosMap: TabTodosMap;
}

export function TaskList({
  droppableId,
  tasks,
  onReorder,
  onDragStateChange,
  tabTodosMap,
}: TaskListProps) {
  const handleDragStart = useCallback(() => {
    onDragStateChange?.(true);
  }, [onDragStateChange]);

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      onDragStateChange?.(false);
      if (!result.destination) return;
      const { source, destination } = result;
      if (source.index === destination.index) return;

      // Reorder array
      const reordered = [...tasks];
      const [moved] = reordered.splice(source.index, 1);
      reordered.splice(destination.index, 0, moved);

      // Update order values
      const withNewOrder = reordered.map((task, index) => ({ ...task, order: index }));
      onReorder(withNewOrder);
    },
    [tasks, onReorder, onDragStateChange]
  );

  return (
    <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <Droppable droppableId={droppableId}>
        {(droppableProvided) => (
          <div
            ref={droppableProvided.innerRef}
            {...droppableProvided.droppableProps}
            className="space-y-2"
          >
            {tasks.map((task, index) => (
              <Draggable key={task.id} draggableId={task.id} index={index}>
                {(draggableProvided) => (
                  <div ref={draggableProvided.innerRef} {...draggableProvided.draggableProps}>
                    <TaskCard
                      task={task}
                      dragHandleProps={draggableProvided.dragHandleProps}
                      tabTodosMap={tabTodosMap}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {droppableProvided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
