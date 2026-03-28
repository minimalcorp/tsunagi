'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Task, Repository } from '@/lib/types';
import { Header } from '@/components/Header';
import { RepositoryOnboardingOverlay } from '@/components/RepositoryOnboardingOverlay';
import { TaskDialog } from '@/components/TaskDialog';
import { CloneRepositoryDialog } from '@/components/CloneRepositoryDialog';
import { BatchDeleteDialog } from '@/components/BatchDeleteDialog';
import { TaskListPanel } from '@/components/planner/TaskListPanel';
import { PlannerPanel } from '@/components/planner/PlannerPanel';
import { useBatchDelete } from '@/hooks/useBatchDelete';
import { useTerminalTodos } from '@/hooks/useTerminalTodos';
import { useTaskEvents } from '@/hooks/useTaskEvents';
import { useTabStatusEvents } from '@/hooks/useTabStatusEvents';
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

  // Filter state (driven by Header's filter UI)
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);

  // Resizable panel
  const [leftPanelWidth, setLeftPanelWidth] = useState(380);
  const [isResizing, setIsResizing] = useState(false);

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

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks
      .filter((task) => {
        // Repo filter
        if (selectedRepos.length > 0 && !selectedRepos.includes('all')) {
          const taskRepo = `${task.owner}/${task.repo}`;
          if (!selectedRepos.includes(taskRepo)) return false;
        }
        // Search filter
        if (searchQuery && !task.title.toLowerCase().includes(searchQuery.toLowerCase()))
          return false;
        return true;
      })
      .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
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

  useTerminalTodos(runningTabIds);

  useTabStatusEvents(allTabIds, (tabId, status) => {
    setTasks((prev) =>
      prev.map((task) => ({
        ...task,
        tabs: (task.tabs ?? []).map((tab) => (tab.tab_id === tabId ? { ...tab, status } : tab)),
      }))
    );
  });

  useTaskEvents((newTask) => {
    setTasks((prev) => [...prev, newTask]);
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
  const handleOrderChange = useCallback(async (taskId: string, newOrder: number) => {
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: newOrder }),
      });

      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, order: newOrder } : t)));
    } catch (error) {
      console.error('Failed to update task order:', error);
    }
  }, []);

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

  // Resize handler
  const handleMouseDown = useCallback(() => {
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(280, Math.min(600, e.clientX));
      setLeftPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

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
        onCloneClick={() => setIsCloneDialogOpen(true)}
        onSettingsClick={() => router.push('/settings')}
        onReload={loadData}
        nextStep={onboardingState.nextStep}
        repositories={repositories}
        onFilterChange={(filters) => {
          setSearchQuery(filters.search);
          setSelectedRepos(filters.selectedRepos || []);
        }}
        isCloneDialogOpen={isCloneDialogOpen}
      />

      {/* Main content: 2-column layout (≥1024px) / single column (<1024px) */}
      <div className="relative flex-1 overflow-hidden flex">
        {/* Left: Task List Panel (PC) */}
        <div
          className="hidden lg:flex flex-col border-r border-border flex-shrink-0"
          style={{ width: leftPanelWidth }}
        >
          <TaskListPanel tasks={filteredTasks} onOrderChange={handleOrderChange} />
        </div>

        {/* Resize handle (PC only) */}
        <div
          className="hidden lg:flex w-1 cursor-col-resize items-center justify-center hover:bg-accent active:bg-accent flex-shrink-0"
          onMouseDown={handleMouseDown}
          style={{ userSelect: isResizing ? 'none' : undefined }}
        >
          <div className="w-px h-8 bg-border" />
        </div>

        {/* Right: Planner Panel */}
        <div className="flex-1 min-w-0 h-full flex flex-col">
          <PlannerPanel />
        </div>

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
