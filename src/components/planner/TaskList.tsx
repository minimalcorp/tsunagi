'use client';

import { useCallback } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import type { Task } from '@/lib/types';
import { TaskCard } from '@/components/planner/TaskCard';

interface TaskListProps {
  tasks: Task[];
  onOrderChange: (taskId: string, newOrder: number) => void;
}

export function TaskList({ tasks, onOrderChange }: TaskListProps) {
  const handleDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination) return;
      const { source, destination } = result;
      if (source.index === destination.index) return;

      const taskId = tasks[source.index].id;
      onOrderChange(taskId, destination.index);
    },
    [tasks, onOrderChange]
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
