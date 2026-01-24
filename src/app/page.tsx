'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Task, Repository, ClaudeSession } from '@/lib/types';
import { Header } from '@/components/Header';
import { KanbanBoard } from '@/components/KanbanBoard';
import { RepositoryOnboardingOverlay } from '@/components/RepositoryOnboardingOverlay';
import { AddTaskDialog } from '@/components/AddTaskDialog';
import { CloneRepositoryDialog } from '@/components/CloneRepositoryDialog';

export default function Home() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [globalEnv, setGlobalEnv] = useState<Record<string, string>>({});
  const [sessions, setSessions] = useState<Record<string, ClaudeSession[]>>({});
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

    if (!state.hasRepositories) {
      nextStep = 'clone';
    } else if (!state.hasAnthropicApiKey && !state.hasClaudeCodeToken) {
      // どちらか片方があればOK
      nextStep = 'env';
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
      const [tasksData, ownersData, envData, sessionsData] = await Promise.all([
        fetch('/api/tasks').then((r) => r.json()),
        fetch('/api/owners').then((r) => r.json()),
        fetch('/api/env').then((r) => r.json()),
        fetch('/api/sessions').then((r) => r.json()),
      ]);

      setTasks(tasksData.data.tasks);
      // ownersからすべてのリポジトリを抽出
      const allRepos = ownersData.data.owners.flatMap(
        (o: { repositories: Repository[] }) => o.repositories
      );
      setRepositories(allRepos);
      setGlobalEnv(envData.data.env);

      // セッションをtaskIdでグループ化
      const allSessions = (sessionsData.data || []) as ClaudeSession[];
      const groupedSessions = allSessions.reduce(
        (acc, session) => {
          if (!acc[session.taskId]) {
            acc[session.taskId] = [];
          }
          acc[session.taskId].push(session);
          return acc;
        },
        {} as Record<string, ClaudeSession[]>
      );
      setSessions(groupedSessions);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Handler functions
  const handleTaskMove = async (taskId: string, newStatus: Task['status']) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) throw new Error('Failed to update task');

      const data = await response.json();
      setTasks((prev) => prev.map((t) => (t.id === taskId ? data.data.task : t)));
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
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Failed to create task');

      const data = await response.json();
      setTasks((prev) => [...prev, data.data.task]);
    } catch (error) {
      console.error('Failed to add task:', error);
      throw error;
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
          sessions={sessions}
          onTaskMove={handleTaskMove}
          onTaskClick={handleTaskClick}
          onAddTaskClick={() => setIsAddTaskDialogOpen(true)}
          nextStep={onboardingState.nextStep}
          isAddTaskDialogOpen={isAddTaskDialogOpen}
          hasApiKey={
            onboardingState.state.hasAnthropicApiKey || onboardingState.state.hasClaudeCodeToken
          }
        />

        {/* リポジトリ未登録時の半透明オーバーレイ */}
        {onboardingState.nextStep === 'clone' && (
          <RepositoryOnboardingOverlay
            hasRepositories={onboardingState.state.hasRepositories}
            hasEnvVars={
              onboardingState.state.hasAnthropicApiKey && onboardingState.state.hasClaudeCodeToken
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
