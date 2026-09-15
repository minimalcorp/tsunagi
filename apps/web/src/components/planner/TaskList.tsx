'use client';

import { Droppable, Draggable } from '@hello-pangea/dnd';
import type { Task } from '@minimalcorp/tsunagi-shared';
import { TaskCard } from '@/components/planner/TaskCard';
import type { TabTodosMap } from '@/hooks/useTerminalTodos';

interface TaskListProps {
  /** 複数リストを同一画面に並べるため、リストごとに一意なIDを渡す */
  droppableId: string;
  tasks: Task[];
  tabTodosMap: TabTodosMap;
}

/**
 * タスクの縦並びリスト。
 * DragDropContext は RepositoryBoard が1つだけ持ち、列の並び替えと共有する
 * （@hello-pangea/dnd は DragDropContext のネストを許さないため）。
 */
export function TaskList({ droppableId, tasks, tabTodosMap }: TaskListProps) {
  return (
    <Droppable droppableId={droppableId} type="task">
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
  );
}
