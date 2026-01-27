'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Task, Repository } from '@/lib/types';
import { Header } from '@/components/Header';
import { KanbanBoard } from '@/components/KanbanBoard';
import { RepositoryOnboardingOverlay } from '@/components/RepositoryOnboardingOverlay';
import { AddTaskDialog } from '@/components/AddTaskDialog';
import { CloneRepositoryDialog } from '@/components/CloneRepositoryDialog';
import { useSSE } from '@/hooks/useSSE';

export default function Home() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [globalEnv, setGlobalEnv] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Dialog states
  const [isCloneDialogOpen, setIsCloneDialogOpen] = useState(false);
  const [isAddTaskDialogOpen, setIsAddTaskDialogOpen] = useState(false);

  // Filter states
  const [ownerFilter, setOwnerFilter] = useState('');
  const [repoFilter, setRepoFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

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

  // Extract unique owners and repos from repositories
  const owners = useMemo(() => {
    const uniqueOwners = [...new Set(repositories.map((r) => r.owner))];
    return uniqueOwners;
  }, [repositories]);

  const repos = useMemo(() => {
    const uniqueRepos = [...new Set(repositories.map((r) => r.repo))];
    return uniqueRepos;
  }, [repositories]);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (ownerFilter && task.owner !== ownerFilter) return false;
      if (repoFilter && task.repo !== repoFilter) return false;
      if (searchQuery && !task.title.toLowerCase().includes(searchQuery.toLowerCase()))
        return false;
      return true;
    });
  }, [tasks, ownerFilter, repoFilter, searchQuery]);

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

  useEffect(() => {
    loadData();
  }, []);

  // Reload data when returning from Settings
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // SSE統合
  const { eventSource } = useSSE();

  useEffect(() => {
    if (!eventSource) return;

    // task:created イベント
    const handleTaskCreated = (event: MessageEvent) => {
      const task = JSON.parse(event.data) as Task;
      setTasks((prev) => {
        // 重複チェック
        if (prev.some((t) => t.id === task.id)) return prev;
        return [...prev, task];
      });
    };

    // task:updated イベント
    const handleTaskUpdated = (event: MessageEvent) => {
      const task = JSON.parse(event.data) as Task;
      console.log('[SSE] task:updated received:', task.id, 'claudeState:', task.claudeState);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    };

    // task:deleted イベント
    const handleTaskDeleted = (event: MessageEvent) => {
      const { id } = JSON.parse(event.data) as { id: string };
      setTasks((prev) => prev.filter((t) => t.id !== id));
    };

    eventSource.addEventListener('task:created', handleTaskCreated);
    eventSource.addEventListener('task:updated', handleTaskUpdated);
    eventSource.addEventListener('task:deleted', handleTaskDeleted);

    return () => {
      eventSource.removeEventListener('task:created', handleTaskCreated);
      eventSource.removeEventListener('task:updated', handleTaskUpdated);
      eventSource.removeEventListener('task:deleted', handleTaskDeleted);
    };
  }, [eventSource]);

  // Handler functions
  const handleTaskMove = async (taskId: string, newStatus: Task['status']) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) throw new Error('Failed to update task');

      // SSE経由でtask:updatedイベントが配信されるため、ここではstateを更新しない
    } catch (error) {
      console.error('Failed to move task:', error);
    }
  };

  const handleAddTask = async (formData: {
    title: string;
    description: string;
    owner: string;
    repo: string;
    branch: string;
    baseBranch: string;
  }) => {
    const response = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    if (!response.ok) {
      const data = await response.json();
      // APIエラーレスポンス（正常なレスポンス）
      return { success: false, errors: data.errors };
    }

    // SSE経由でtask:createdイベントが配信されるため、ここではstateを更新しない
    return { success: true };
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
    } catch (error) {
      console.error('Failed to clone repository:', error);
      throw error;
    }
  };

  const handleFilterChange = (filters: { owner: string; repo: string; search: string }) => {
    setOwnerFilter(filters.owner);
    setRepoFilter(filters.repo);
    setSearchQuery(filters.search);
  };

  const handleTaskClick = (taskId: string) => {
    router.push(`/tasks/${taskId}`);
  };

  if (isLoading) {
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
        owners={owners}
        repos={repos}
        onFilterChange={handleFilterChange}
        isCloneDialogOpen={isCloneDialogOpen}
      />

      {/* カンバンボード（常に表示） */}
      <div className="relative flex-1 overflow-hidden">
        <KanbanBoard
          tasks={filteredTasks}
          onTaskMove={handleTaskMove}
          onTaskClick={handleTaskClick}
          onAddTaskClick={() => setIsAddTaskDialogOpen(true)}
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

      <AddTaskDialog
        isOpen={isAddTaskDialogOpen}
        onClose={() => setIsAddTaskDialogOpen(false)}
        onAdd={handleAddTask}
        repositories={repositories}
      />
    </div>
  );
}
