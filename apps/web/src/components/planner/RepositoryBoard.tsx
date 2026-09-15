'use client';

import { useCallback, useMemo, useState } from 'react';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import type { Task, Repository } from '@minimalcorp/tsunagi-shared';
import { CloneColumn } from '@/components/planner/CloneColumn';
import { RepositoryColumn } from '@/components/planner/RepositoryColumn';
import type { FilterState } from '@/components/planner/FilterBar';
import { cn } from '@/lib/utils';
import type { TabTodosMap } from '@/hooks/useTerminalTodos';

/** リポジトリを一意に識別するキー。フィルタ・タスクのグルーピングに使う */
export function repoKeyOf(owner: string, repo: string): string {
  return `${owner}/${repo}`;
}

const COLUMN_DROPPABLE_ID = 'repository-board';
const TASK_DROPPABLE_PREFIX = 'tasks:';

interface RepositoryBoardProps {
  repositories: Repository[];
  /** repoKey -> そのリポジトリのタスク（フィルタ適用・order昇順ソート済み） */
  tasksByRepo: Map<string, Task[]>;
  /** repoKey -> その列のフィルタ */
  filtersByRepo: Record<string, FilterState>;
  onFilterChange: (repoKey: string, filters: FilterState) => void;
  onReorder: (reorderedTasks: Task[]) => void;
  onRepositoryReorder: (reorderedRepositories: Repository[]) => void;
  onAddTask: (repository: { owner: string; repo: string }) => void;
  onCloneClick: () => void;
  isCloneOnboarding?: boolean;
  isCloneDialogOpen?: boolean;
  tabTodosMap: TabTodosMap;
}

const EMPTY_FILTERS: FilterState = { statuses: [], repos: [], search: '' };

/** 列は常に境界でスナップさせる。狭い画面では1列が画面幅いっぱいになる */
const COLUMN_CLASS = 'h-full w-full flex-shrink-0 snap-start border-r border-border lg:w-[22.5rem]';

export function RepositoryBoard({
  repositories,
  tasksByRepo,
  filtersByRepo,
  onFilterChange,
  onReorder,
  onRepositoryReorder,
  onAddTask,
  onCloneClick,
  isCloneOnboarding = false,
  isCloneDialogOpen = false,
  tabTodosMap,
}: RepositoryBoardProps) {
  // ドラッグ中はスナップを外す（ドラッグ中に横スクロールが吸着するのを防ぐ）
  const [isDragging, setIsDragging] = useState(false);

  const sortedRepositories = useMemo(
    () => [...repositories].sort((a, b) => a.order - b.order),
    [repositories]
  );

  const handleDragStart = useCallback(() => setIsDragging(true), []);

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      setIsDragging(false);

      const { source, destination, type } = result;
      if (!destination) return;

      // 列の並び替え
      if (type === 'column') {
        if (source.index === destination.index) return;
        const reordered = [...sortedRepositories];
        const [moved] = reordered.splice(source.index, 1);
        reordered.splice(destination.index, 0, moved);
        onRepositoryReorder(
          reordered.map((repository, index) => ({ ...repository, order: index }))
        );
        return;
      }

      // タスクの並び替え（列をまたぐ移動は許可しない）
      if (source.droppableId !== destination.droppableId) return;
      if (source.index === destination.index) return;

      const repoKey = source.droppableId.slice(TASK_DROPPABLE_PREFIX.length);
      const reordered = [...(tasksByRepo.get(repoKey) ?? [])];
      const [moved] = reordered.splice(source.index, 1);
      reordered.splice(destination.index, 0, moved);
      onReorder(reordered.map((task, index) => ({ ...task, order: index })));
    },
    [sortedRepositories, tasksByRepo, onRepositoryReorder, onReorder]
  );

  return (
    <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {/*
        スクロールコンテナ自身を Droppable にする。
        列を包む中間要素を挟むと、列の w-full がビューポート幅を基準にしなくなり
        狭い画面で「1列＝画面幅」が崩れるため。

        この構成だと各列のタスクリスト(overflow-y-auto)がこのDroppableの内側に入るため、
        dev buildで "unsupported nested scroll container" の警告が出る。
        ここでは外側が横スクロール・内側が縦スクロールで軸が直交しており、
        列の並び替え・タスクの並び替え・縦方向のauto-scrollいずれも正しく動作することを
        実ブラウザで確認済みのため、警告は許容する。
      */}
      <Droppable droppableId={COLUMN_DROPPABLE_ID} direction="horizontal" type="column">
        {(droppableProvided) => (
          <div
            ref={droppableProvided.innerRef}
            {...droppableProvided.droppableProps}
            className={cn(
              'flex flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain',
              !isDragging && 'snap-x snap-mandatory'
            )}
          >
            {sortedRepositories.map((repository, index) => {
              const key = repoKeyOf(repository.owner, repository.repo);
              return (
                <Draggable key={repository.id} draggableId={repository.id} index={index}>
                  {(draggableProvided) => (
                    <div
                      ref={draggableProvided.innerRef}
                      {...draggableProvided.draggableProps}
                      className={COLUMN_CLASS}
                    >
                      <RepositoryColumn
                        owner={repository.owner}
                        repo={repository.repo}
                        tasks={tasksByRepo.get(key) ?? []}
                        droppableId={`${TASK_DROPPABLE_PREFIX}${key}`}
                        filters={filtersByRepo[key] ?? EMPTY_FILTERS}
                        onFilterChange={(filters) => onFilterChange(key, filters)}
                        onAddTask={() =>
                          onAddTask({ owner: repository.owner, repo: repository.repo })
                        }
                        dragHandleProps={draggableProvided.dragHandleProps}
                        tabTodosMap={tabTodosMap}
                      />
                    </div>
                  )}
                </Draggable>
              );
            })}
            {droppableProvided.placeholder}

            {/* Clone列は並び替え対象外なので Draggable にはしない */}
            <div className={COLUMN_CLASS}>
              <CloneColumn
                onCloneClick={onCloneClick}
                isOnboarding={isCloneOnboarding}
                isCloneDialogOpen={isCloneDialogOpen}
              />
            </div>
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
