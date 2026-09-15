'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Task, Repository } from '@minimalcorp/tsunagi-shared';
import { Header } from '@/components/Header';
import { RepositoryOnboardingOverlay } from '@/components/RepositoryOnboardingOverlay';
import { TaskDialog } from '@/components/TaskDialog';
import { CloneRepositoryDialog } from '@/components/CloneRepositoryDialog';
import { BatchDeleteDialog } from '@/components/BatchDeleteDialog';
import { RepositoryBoard, repoKeyOf } from '@/components/planner/RepositoryBoard';
import { type FilterState } from '@/components/planner/FilterBar';
import { useBatchDelete } from '@/hooks/useBatchDelete';
import { useTerminalTodos } from '@/hooks/useTerminalTodos';
import { useTaskEvents } from '@/hooks/useTaskEvents';
import { useTabStatusEvents } from '@/hooks/useTabStatusEvents';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { toaster } from '@/lib/toaster';
import { apiUrl } from '@/lib/api-url';

/** 列ごとのフィルタ。sessionStorageに repoKey -> FilterState のマップで保存する */
type ColumnFilters = Record<string, FilterState>;

const COLUMN_FILTERS_STORAGE_KEY = 'tsunagi:column-filters';
const EMPTY_FILTERS: FilterState = { statuses: [], repos: [], search: '' };

function hasActiveFilter(f: FilterState): boolean {
  return f.statuses.length > 0 || Boolean(f.search.trim());
}

/** フィルタが効いている列だけをタイトルに要約する */
function buildFilterSummary(filters: ColumnFilters): string | undefined {
  const parts = Object.entries(filters)
    .filter(([, f]) => hasActiveFilter(f))
    .map(([repoKey, f]) => {
      const detail: string[] = [];
      if (f.search.trim()) detail.push(`"${f.search.trim()}"`);
      if (f.statuses.length) detail.push(f.statuses.join(', '));
      return `${repoKey.split('/').pop() ?? repoKey}: ${detail.join(' / ')}`;
    });
  return parts.length ? parts.join(' | ') : undefined;
}

export default function Home() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [globalEnv, setGlobalEnv] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  // Dialog states
  const [isCloneDialogOpen, setIsCloneDialogOpen] = useState(false);
  const [addTaskRepo, setAddTaskRepo] = useState<{ owner: string; repo: string } | null>(null);
  const [isBatchDeleteDialogOpen, setIsBatchDeleteDialogOpen] = useState(false);

  // 列ごとのフィルタ（各列のSearchAndFilterBarが駆動、sessionStorageに永続化）
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = sessionStorage.getItem(COLUMN_FILTERS_STORAGE_KEY);
      if (saved) return JSON.parse(saved) as ColumnFilters;
    } catch {
      // ignore
    }
    return {};
  });

  useDocumentTitle(buildFilterSummary(columnFilters));

  // Persist filter state to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(COLUMN_FILTERS_STORAGE_KEY, JSON.stringify(columnFilters));
    } catch {
      // ignore
    }
  }, [columnFilters]);

  const handleFilterChange = useCallback((repoKey: string, filters: FilterState) => {
    setColumnFilters((prev) => ({ ...prev, [repoKey]: filters }));
  }, []);

  // 初回ユーザーフローの状態を検出
  const onboardingState = useMemo(() => {
    const state = {
      hasRepositories: repositories.length > 0,
      hasAnthropicApiKey: Boolean(globalEnv.ANTHROPIC_API_KEY),
      hasClaudeCodeToken: Boolean(globalEnv.CLAUDE_CODE_OAUTH_TOKEN),
      hasTasks: tasks.length > 0,
    };

    let nextStep: 'clone' | 'env' | 'task' | 'complete';

    if (!state.hasAnthropicApiKey && !state.hasClaudeCodeToken) {
      nextStep = 'env';
    } else if (!state.hasRepositories) {
      nextStep = 'clone';
    } else if (!state.hasTasks) {
      nextStep = 'task';
    } else {
      nextStep = 'complete';
    }

    return { state, nextStep };
  }, [repositories, globalEnv, tasks]);

  // リポジトリごとにタスクを分け、その列のフィルタを適用してorder昇順に並べる
  const tasksByRepo = useMemo(() => {
    const grouped = new Map<string, Task[]>();

    for (const task of tasks) {
      const key = repoKeyOf(task.owner, task.repo);
      const filters = columnFilters[key] ?? EMPTY_FILTERS;

      // Status filter
      if (filters.statuses.length > 0 && !filters.statuses.includes(task.status)) continue;
      // Search filter
      if (filters.search && !task.title.toLowerCase().includes(filters.search.toLowerCase()))
        continue;

      const list = grouped.get(key);
      if (list) {
        list.push(task);
      } else {
        grouped.set(key, [task]);
      }
    }

    for (const list of grouped.values()) {
      list.sort((a, b) => a.order - b.order);
    }

    return grouped;
  }, [tasks, columnFilters]);

  // 初回データロード
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [tasksData, ownersData, envData] = await Promise.all([
        fetch(apiUrl('/api/tasks')).then((r) => r.json()),
        fetch(apiUrl('/api/owners')).then((r) => r.json()),
        fetch(apiUrl('/api/env')).then((r) => r.json()),
      ]);

      setTasks(tasksData.data.tasks);
      const allRepos = ownersData.data.owners.flatMap(
        (o: { repositories: Repository[] }) => o.repositories
      );
      setRepositories(allRepos);
      setGlobalEnv(envData.data.env);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    if (isInitialLoad) {
      loadData();
      setIsInitialLoad(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tab status tracking
  const allTabIds = useMemo(
    () => tasks.flatMap((t) => (t.tabs ?? []).map((tab) => tab.tab_id)),
    [tasks]
  );

  const runningTabIds = useMemo(
    () =>
      tasks.flatMap((t) =>
        (t.tabs ?? []).filter((tab) => tab.status === 'running').map((tab) => tab.tab_id)
      ),
    [tasks]
  );

  const tabTodosMap = useTerminalTodos(runningTabIds);

  useTabStatusEvents(allTabIds, (tabId, status) => {
    setTasks((prev) =>
      prev.map((task) => ({
        ...task,
        tabs: (task.tabs ?? []).map((tab) => (tab.tab_id === tabId ? { ...tab, status } : tab)),
      }))
    );
  });

  // Socket.IOイベントでUI更新のみ行う（通知は操作元のUI側で表示するため、ここでは出さない）
  useTaskEvents({
    onTaskCreated: (newTask) => {
      setTasks((prev) => {
        if (prev.some((t) => t.id === newTask.id)) return prev;
        return [...prev, newTask];
      });

      toaster.create({
        type: 'success',
        title: 'Task created',
        description: newTask.title,
        duration: 5000,
      });
    },
    onTaskUpdated: (updatedTask) => {
      setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)));

      toaster.create({
        type: 'info',
        title: 'Task updated',
        description: updatedTask.title,
        duration: 5000,
      });
    },
    onTaskDeleted: (taskId) => {
      // updater外でタスク名を取得（Strict Modeでupdaterが2回呼ばれても影響なし）
      const taskTitle = tasks.find((t) => t.id === taskId)?.title;

      setTasks((prev) => prev.filter((t) => t.id !== taskId));

      if (taskTitle) {
        toaster.create({
          type: 'info',
          title: 'Task deleted',
          description: taskTitle,
          duration: 5000,
        });
      }
    },
  });

  // Batch delete
  const { isDeleting, deletedCount, errorCount, totalCount, isCompleted, startBatchDelete, reset } =
    useBatchDelete();

  useEffect(() => {
    if (!isDeleting && !isCompleted) return;

    queueMicrotask(() => {
      if (isDeleting) {
        const description =
          errorCount > 0
            ? `${deletedCount} / ${totalCount} (${errorCount} failed)`
            : `${deletedCount} / ${totalCount}`;

        toaster.update('batch-delete-progress', {
          type: 'loading',
          title: 'Deleting tasks...',
          description,
          duration: Infinity,
        });
      }

      if (isCompleted) {
        toaster.dismiss('batch-delete-progress');

        const successMessage =
          errorCount > 0
            ? `Deleted ${deletedCount} tasks (${errorCount} failed)`
            : `Deleted ${deletedCount} tasks`;

        toaster.create({
          type: errorCount > 0 ? 'warning' : 'success',
          title: successMessage,
          duration: 5000,
        });

        setTimeout(() => {
          reset();
        }, 5000);
      }
    });
  }, [isDeleting, isCompleted, deletedCount, errorCount, totalCount, reset]);

  // Handlers
  const handleReorder = useCallback(async (reorderedTasks: Task[]) => {
    // Optimistic UI update
    setTasks((prev) => {
      const reorderedById = new Map(reorderedTasks.map((t) => [t.id, t]));
      return prev.map((t) => reorderedById.get(t.id) ?? t);
    });

    // Persist order to server
    try {
      await Promise.all(
        reorderedTasks.map((task, index) =>
          fetch(apiUrl(`/api/tasks/${task.id}`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order: index }),
          })
        )
      );
    } catch (error) {
      console.error('Failed to update task order:', error);
    }
  }, []);

  /** 指定した列を先頭に移動する。細かい並び替えは settings ページで行う */
  const handleMoveRepositoryToFront = useCallback(
    async (repositoryId: string) => {
      const target = repositories.find((r) => r.id === repositoryId);
      if (!target) return;

      const rest = repositories
        .filter((r) => r.id !== repositoryId)
        .sort((a, b) => a.order - b.order);
      const next = [target, ...rest].map((repo, index) => ({ ...repo, order: index }));

      // Optimistic UI update
      setRepositories(next);

      try {
        await fetch(apiUrl('/api/repos/reorder'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repoIds: next.map((r) => r.id) }),
        });
      } catch (error) {
        console.error('Failed to update repository order:', error);
      }
    },
    [repositories]
  );

  const handleCloneRepository = async (cloneData: { gitUrl: string }) => {
    try {
      const response = await fetch(apiUrl('/api/clone'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cloneData),
      });

      if (!response.ok) {
        // サーバーが返した原因（認証エラー・URL形式など）をそのまま通知に出す
        const detail = await response
          .json()
          .then((body) => body?.error)
          .catch(() => undefined);
        throw new Error(detail || `Failed to clone repository (HTTP ${response.status})`);
      }

      const data = await response.json();
      setRepositories((prev) => [...prev, data.data.repository]);
      await loadData();
    } catch (error) {
      console.error('Failed to clone repository:', error);
      throw error;
    }
  };

  const handleBatchDelete = async (daysAgo: number) => {
    try {
      const result = await startBatchDelete(daysAgo);

      if (!result || result.totalCount === 0) {
        toaster.create({
          type: 'info',
          title: 'No tasks to delete',
          description: `No tasks completed more than ${daysAgo} days ago`,
          duration: 3000,
        });
        return;
      }

      toaster.create({
        id: 'batch-delete-progress',
        type: 'loading',
        title: 'Deleting tasks...',
        description: `0 / ${result.totalCount}`,
        duration: Infinity,
      });
    } catch (error) {
      console.error('Failed to start batch delete:', error);
      toaster.create({
        type: 'error',
        title: 'Failed to delete tasks',
        description: String(error),
        duration: 5000,
      });
    }
  };

  if (isLoading && tasks.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="text-2xl text-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <Header
        onSettingsClick={() => router.push('/settings')}
        onReload={loadData}
        nextStep={onboardingState.nextStep}
      />

      {/* Main content: リポジトリごとの列を横に並べる（列境界でスナップする横スクロール） */}
      <div className="relative flex-1 overflow-hidden flex">
        <RepositoryBoard
          repositories={repositories}
          tasksByRepo={tasksByRepo}
          filtersByRepo={columnFilters}
          onFilterChange={handleFilterChange}
          onReorder={handleReorder}
          onMoveRepositoryToFront={handleMoveRepositoryToFront}
          onAddTask={setAddTaskRepo}
          onCloneClick={() => setIsCloneDialogOpen(true)}
          isCloneOnboarding={onboardingState.nextStep === 'clone'}
          isCloneDialogOpen={isCloneDialogOpen}
          tabTodosMap={tabTodosMap}
        />

        {/* Onboarding overlay */}
        {onboardingState.nextStep === 'env' && (
          <RepositoryOnboardingOverlay
            hasRepositories={onboardingState.state.hasRepositories}
            hasEnvVars={
              onboardingState.state.hasAnthropicApiKey || onboardingState.state.hasClaudeCodeToken
            }
            hasTasks={onboardingState.state.hasTasks}
          />
        )}
      </div>

      {/* Dialogs */}
      <CloneRepositoryDialog
        isOpen={isCloneDialogOpen}
        onClose={() => setIsCloneDialogOpen(false)}
        onClone={handleCloneRepository}
        isOnboarding={onboardingState.nextStep === 'clone'}
      />

      <TaskDialog
        mode="create"
        isOpen={addTaskRepo !== null}
        onClose={() => setAddTaskRepo(null)}
        repositories={repositories}
        defaultRepo={addTaskRepo ?? undefined}
      />

      <BatchDeleteDialog
        isOpen={isBatchDeleteDialogOpen}
        onClose={() => setIsBatchDeleteDialogOpen(false)}
        onConfirm={handleBatchDelete}
      />
    </div>
  );
}
