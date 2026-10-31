'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Task, Repository } from '@minimalcorp/tsunagi-shared';
import { CloneColumn } from '@/components/planner/CloneColumn';
import { RepositoryColumn } from '@/components/planner/RepositoryColumn';
import type { FilterState } from '@/components/planner/FilterBar';
import { cn } from '@/lib/utils';
import { loadBoardScroll, saveBoardScroll } from '@/lib/board-scroll';
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
  const boardRef = useRef<HTMLDivElement>(null);

  // 前回トップページを表示していた時のスクロール位置（横 + 各列の縦）で表示し、以降の変化を記録する。
  // ボードはタスク・リポジトリが揃ってから mount されるので、mount 時点で列の中身は描画済み。
  // 描画前（useLayoutEffect）に位置を合わせ、先頭から飛ぶ瞬間を見せない
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;

    const scroll = loadBoardScroll() ?? { left: 0, columns: {} };
    board.scrollLeft = scroll.left;
    for (const list of board.querySelectorAll<HTMLElement>(
      '[data-repo-key] [data-column-scroll]'
    )) {
      const key = list.closest<HTMLElement>('[data-repo-key]')?.dataset.repoKey;
      if (key && scroll.columns[key] !== undefined) list.scrollTop = scroll.columns[key];
    }

    // scroll はバブリングしないので、列内リストの scroll も capture で拾う
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target === board) {
        scroll.left = board.scrollLeft;
      } else if (target.matches('[data-column-scroll]')) {
        const key = target.closest<HTMLElement>('[data-repo-key]')?.dataset.repoKey;
        if (!key) return;
        scroll.columns[key] = target.scrollTop;
      } else {
        return;
      }
      saveBoardScroll(scroll);
    };
    board.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => board.removeEventListener('scroll', handleScroll, { capture: true });
  }, []);

  // 列の並び順は settings ページで変更する（Repository.order）
  const sortedRepositories = useMemo(
    () => [...repositories].sort((a, b) => a.order - b.order),
    [repositories]
  );

  return (
    <div
      ref={boardRef}
      className={cn(
        'flex flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain',
        !isDragging && 'snap-x snap-mandatory'
      )}
    >
      {sortedRepositories.map((repository, index) => {
        const key = repoKeyOf(repository.owner, repository.repo);
        return (
          <div key={repository.id} className={COLUMN_CLASS} data-repo-key={key}>
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
