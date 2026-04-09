'use client';

import { useCallback } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import type { Task } from '@minimalcorp/tsunagi-shared';
import { TaskCard } from '@/components/planner/TaskCard';

interface TaskListProps {
  tasks: Task[];
  onReorder: (reorderedTasks: Task[]) => void;
}

export function TaskList({ tasks, onReorder }: TaskListProps) {
  const handleDragEnd = useCallback(
    (result: DropResult) => {
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
    [tasks, onReorder]
  );

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="planner-task-list">
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
                    <TaskCard task={task} dragHandleProps={draggableProvided.dragHandleProps} />
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
