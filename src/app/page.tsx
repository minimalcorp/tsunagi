'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { CircleCheck } from 'lucide-react';
import type { Task, Repository } from '@/lib/types';
import { Header } from '@/components/Header';
import { KanbanBoard } from '@/components/KanbanBoard';
import { RepositoryOnboardingOverlay } from '@/components/RepositoryOnboardingOverlay';
import { TaskDialog } from '@/components/TaskDialog';
import { CloneRepositoryDialog } from '@/components/CloneRepositoryDialog';
import { BatchDeleteDialog } from '@/components/BatchDeleteDialog';
import { useBatchDelete } from '@/hooks/useBatchDelete';
import { toaster } from '@/lib/toaster';

export default function Home() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [globalEnv, setGlobalEnv] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  // Dialog states
  const [isCloneDialogOpen, setIsCloneDialogOpen] = useState(false);
  const [isAddTaskDialogOpen, setIsAddTaskDialogOpen] = useState(false);
  const [isBatchDeleteDialogOpen, setIsBatchDeleteDialogOpen] = useState(false);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);

  // 初回ユーザーフローの状態を検出
  const onboardingState = useMemo(() => {
    const state = {
      hasRepositories: repositories.length > 0,
      hasAnthropicApiKey: Boolean(globalEnv.ANTHROPIC_API_KEY),
      hasClaudeCodeToken: Boolean(globalEnv.CLAUDE_CODE_OAUTH_TOKEN),
      hasTasks: tasks.length > 0,
    };

    let nextStep: 'clone' | 'env' | 'task' | 'complete';

    // Claude Tokenのチェック（GitHub Tokenは不要）
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

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // If selectedRepos has values and doesn't include 'all', filter by selected repos
      if (selectedRepos.length > 0 && !selectedRepos.includes('all')) {
        const taskRepo = `${task.owner}/${task.repo}`;
        if (!selectedRepos.includes(taskRepo)) return false;
      }
      if (searchQuery && !task.title.toLowerCase().includes(searchQuery.toLowerCase()))
        return false;
      return true;
    });
  }, [tasks, selectedRepos, searchQuery]);

  // 初回データロード
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [tasksData, ownersData, envData] = await Promise.all([
        fetch('/api/tasks').then((r) => r.json()),
        fetch('/api/owners').then((r) => r.json()),
        fetch('/api/env').then((r) => r.json()),
      ]);

      setTasks(tasksData.data.tasks);
      // ownersからすべてのリポジトリを抽出
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

  // 初回ロード時のみデータを取得
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    if (isInitialLoad) {
      loadData();
      setIsInitialLoad(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // バッチ削除
  const { isDeleting, deletedCount, errorCount, totalCount, isCompleted, startBatchDelete, reset } =
    useBatchDelete();

  // バッチ削除の進捗更新とToast通知
  useEffect(() => {
    if (!isDeleting && !isCompleted) return;

    // マイクロタスクでtoaster操作を実行（Reactのレンダリング外で実行）
    queueMicrotask(() => {
      if (isDeleting) {
        // 進捗更新
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
        // 完了通知
        toaster.dismiss('batch-delete-progress');

        const successMessage =
          errorCount > 0
            ? `Deleted ${deletedCount} tasks (${errorCount} failed)`
            : `Deleted ${deletedCount} tasks`;

        toaster.create({
          type: errorCount > 0 ? 'warning' : 'success',
          title: (
            <div className="flex items-center gap-2">
              <CircleCheck className="w-5 h-5" />
              <span>{successMessage}</span>
            </div>
          ),
          duration: 5000,
        });

        // リセット
        setTimeout(() => {
          reset();
        }, 5000);
      }
    });
  }, [isDeleting, isCompleted, deletedCount, errorCount, totalCount, reset]);

  // Handler functions
  const handleTaskMove = async (taskId: string, newStatus: Task['status']) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) throw new Error('Failed to update task');

      // ステータスを即座に反映
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
    } catch (error) {
      console.error('Failed to move task:', error);
    }
  };

  const handleCloneRepository = async (cloneData: { gitUrl: string; authToken?: string }) => {
    try {
      const response = await fetch('/api/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cloneData),
      });

      if (!response.ok) throw new Error('Failed to clone repository');

      const data = await response.json();
      setRepositories((prev) => [...prev, data.data.repository]);

      // repository一覧を再取得して、TaskDialogなどに最新の状態を反映
      await loadData();
    } catch (error) {
      console.error('Failed to clone repository:', error);
      throw error;
    }
  };

  const handleFilterChange = (filters: {
    owner: string;
    repo: string;
    search: string;
    selectedRepos?: string[];
  }) => {
    setSearchQuery(filters.search);
    setSelectedRepos(filters.selectedRepos || []);
  };

  const handleBatchDelete = async (daysAgo: number) => {
    try {
      const result = await startBatchDelete(daysAgo);

      // 削除対象が0件の場合は通知のみ表示して終了
      if (!result || result.totalCount === 0) {
        toaster.create({
          type: 'info',
          title: 'No tasks to delete',
          description: `No tasks completed more than ${daysAgo} days ago`,
          duration: 3000,
        });
        return;
      }

      // 削除開始通知
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

  // 初回ロード時のみローディング表示
  if (isLoading && tasks.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center bg-theme-bg">
        <div className="text-center">
          <div className="text-2xl text-theme-fg">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <Header
        onCloneClick={() => setIsCloneDialogOpen(true)}
        onSettingsClick={() => router.push('/settings')}
        onReload={loadData}
        nextStep={onboardingState.nextStep}
        repositories={repositories}
        onFilterChange={handleFilterChange}
        isCloneDialogOpen={isCloneDialogOpen}
      />

      {/* カンバンボード（常に表示） */}
      <div className="relative flex-1 overflow-hidden">
        <KanbanBoard
          tasks={filteredTasks}
          onTaskMove={handleTaskMove}
          onAddTaskClick={() => setIsAddTaskDialogOpen(true)}
          onBatchDeleteClick={() => setIsBatchDeleteDialogOpen(true)}
          isBatchDeleting={isDeleting}
          nextStep={onboardingState.nextStep}
          isAddTaskDialogOpen={isAddTaskDialogOpen}
          hasApiKey={
            onboardingState.state.hasAnthropicApiKey || onboardingState.state.hasClaudeCodeToken
          }
        />

        {/* 初回セットアップ時の半透明オーバーレイ */}
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
        isOpen={isAddTaskDialogOpen}
        onClose={() => setIsAddTaskDialogOpen(false)}
        repositories={repositories}
      />

      <BatchDeleteDialog
        isOpen={isBatchDeleteDialogOpen}
        onClose={() => setIsBatchDeleteDialogOpen(false)}
        onConfirm={handleBatchDelete}
      />
    </div>
  );
}
