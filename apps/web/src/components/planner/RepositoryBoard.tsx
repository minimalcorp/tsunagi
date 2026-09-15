'use client';

import { useMemo, useState } from 'react';
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

interface RepositoryBoardProps {
  repositories: Repository[];
  /** repoKey -> そのリポジトリのタスク（フィルタ適用・order昇順ソート済み） */
  tasksByRepo: Map<string, Task[]>;
  /** repoKey -> その列のフィルタ */
  filtersByRepo: Record<string, FilterState>;
  onFilterChange: (repoKey: string, filters: FilterState) => void;
  onReorder: (reorderedTasks: Task[]) => void;
  /** 指定リポジトリの列を先頭に移動する */
  onMoveRepositoryToFront: (repositoryId: string) => void;
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
  onMoveRepositoryToFront,
  onAddTask,
  onCloneClick,
  isCloneOnboarding = false,
  isCloneDialogOpen = false,
  tabTodosMap,
}: RepositoryBoardProps) {
  // ドラッグ中はスナップを外す（縦ドラッグ中に横スクロールが吸着するのを防ぐ）
  const [isDragging, setIsDragging] = useState(false);

  // 列の並び順は settings ページで変更する（Repository.order）
  const sortedRepositories = useMemo(
    () => [...repositories].sort((a, b) => a.order - b.order),
    [repositories]
  );

  return (
    <div
      className={cn(
        'flex flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain',
        !isDragging && 'snap-x snap-mandatory'
      )}
    >
      {sortedRepositories.map((repository, index) => {
        const key = repoKeyOf(repository.owner, repository.repo);
        return (
          <div key={repository.id} className={COLUMN_CLASS}>
            <RepositoryColumn
              owner={repository.owner}
              repo={repository.repo}
              tasks={tasksByRepo.get(key) ?? []}
              filters={filtersByRepo[key] ?? EMPTY_FILTERS}
              onFilterChange={(filters) => onFilterChange(key, filters)}
              onReorder={onReorder}
              onAddTask={() => onAddTask({ owner: repository.owner, repo: repository.repo })}
              onMoveToFront={index === 0 ? undefined : () => onMoveRepositoryToFront(repository.id)}
              onDragStateChange={setIsDragging}
              tabTodosMap={tabTodosMap}
            />
          </div>
        );
      })}

      <div className={COLUMN_CLASS}>
        <CloneColumn
          onCloneClick={onCloneClick}
          isOnboarding={isCloneOnboarding}
          isCloneDialogOpen={isCloneDialogOpen}
        />
      </div>
    </div>
  );
}
