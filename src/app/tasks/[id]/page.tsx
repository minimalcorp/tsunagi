'use client';

import { use, useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Edit } from 'lucide-react';
import type { Task, Tab } from '@/lib/types';
import { TaskDialog } from '@/components/TaskDialog';
import { CollapsibleTaskInfo } from '@/components/CollapsibleTaskInfo';
import { TaskActions } from '@/components/TaskActions';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useToast } from '@/hooks/useToast';
import { TerminalPanel, type TerminalPanelHandle } from '@/components/TerminalPanel';

interface TaskDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function TaskDetailPage({ params }: TaskDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const [task, setTask] = useState<Task | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const terminalPanelRef = useRef<TerminalPanelHandle | null>(null);

  // データロード（初回ロード時のみ、またはIDが変わった時）
  const prevIdRef = useRef<string | null>(null);

  const loadData = useCallback(async () => {
    // IDが変わった場合は再ロード
    if (prevIdRef.current !== null && prevIdRef.current !== id) {
      setIsInitialLoad(true);
    }
    prevIdRef.current = id;

    if (!isInitialLoad) return;

    setIsLoading(true);
    try {
      // タスク取得
      const taskResponse = await fetch(`/api/tasks/${id}`);
      if (!taskResponse.ok) throw new Error('Failed to fetch task');
      const taskData = await taskResponse.json();
      const loadedTask = taskData.data.task;

      // タスクからタブを取得（既にpromptCountを含む）
      let loadedTabs = loadedTask.tabs || [];

      // タブが0個の場合、自動的に1個作成
      if (loadedTabs.length === 0) {
        const createResponse = await fetch(`/api/tasks/${id}/tabs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (createResponse.ok) {
          const createData = await createResponse.json();
          loadedTabs = [createData.data.tab];
        }
      }

      // 全 await 完了後にまとめて state 更新（中間レンダリングを防ぐ）
      setTask(loadedTask);
      setTabs(loadedTabs);

      // アクティブタブ設定
      if (loadedTabs.length > 0) {
        setActiveTabId(loadedTabs[0].tab_id);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
      setIsInitialLoad(false);
    }
  }, [id, isInitialLoad]);

  useEffect(() => {
    loadData();
  }, [id, loadData]);

  // タスク更新
  const handleTaskUpdate = async (taskId: string, updates: Partial<Task>) => {
    const notificationId = toast.loading('Updating task...');

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) throw new Error('Failed to update task');

      toast.success(notificationId, 'Successfully updated task');

      return { success: true };
    } catch (error) {
      console.error('Failed to update task:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update task';
      toast.error(notificationId, 'Failed to update task', errorMessage);
      return { success: false, errors: [{ field: 'global', message: 'Failed to update task' }] };
    }
  };

  // タブ作成（新規tab_idを返す）
  const handleTabCreate = async (): Promise<string | undefined> => {
    try {
      const response = await fetch(`/api/tasks/${id}/tabs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!response.ok) throw new Error('Failed to create tab');

      const data = await response.json();
      const newTab = data.data.tab;

      setTabs((prev) => {
        if (prev.some((t) => t.tab_id === newTab.tab_id)) return prev;
        return [...prev, newTab];
      });
      setActiveTabId(newTab.tab_id);
      return newTab.tab_id;
    } catch (error) {
      console.error('Failed to create tab:', error);
      return undefined;
    }
  };

  // タブ削除
  const handleTabDelete = async (tab_id: string) => {
    try {
      const response = await fetch(`/api/tasks/${id}/tabs/${tab_id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete tab');

      setTabs((prev) => prev.filter((t) => t.tab_id !== tab_id));

      // アクティブタブが削除された場合、次のタブを選択
      if (activeTabId === tab_id) {
        const remaining = tabs.filter((t) => t.tab_id !== tab_id);
        setActiveTabId(remaining[0]?.tab_id);
      }
    } catch (error) {
      console.error('Failed to delete tab:', error);
    }
  };

  // タスク削除
  const handleTaskDelete = async (taskId: string) => {
    // 削除API呼び出し（非同期）
    fetch(`/api/tasks/${taskId}`, {
      method: 'DELETE',
    }).catch((error) => {
      console.error('Failed to delete task:', error);
    });

    // 即座に一覧に戻る
    router.push('/');
  };

  // 初回ロード時のみローディング表示
  if (isLoading && !task) {
    return (
      <div className="h-screen flex items-center justify-center bg-theme-bg">
        <LoadingSpinner size="lg" message="Loading task..." />
      </div>
    );
  }

  // taskがnullの場合（エラー時など）
  if (!task) {
    return (
      <div className="h-screen flex items-center justify-center bg-theme-bg">
        <div className="text-center text-theme-fg">Task not found</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-theme-bg">
      {/* Header - Fixed at top */}
      <div className="sticky top-0 z-50 p-4 border-b border-theme bg-theme-card">
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push('/')}
            className="text-primary-light font-medium flex items-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Board
          </button>

          <h1 className="text-base font-semibold text-theme-fg absolute left-1/2 -translate-x-1/2 max-w-[50vw] truncate">
            {task.title}
          </h1>

          <button
            onClick={() => setIsEditDialogOpen(true)}
            className="p-2 text-primary hover:text-primary-light rounded hover:bg-theme-hover cursor-pointer"
            title="Edit task"
          >
            <Edit className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Task Info Detail Section */}
        <div className="px-4 bg-theme-card flex-shrink-0">
          <CollapsibleTaskInfo task={task} defaultExpanded={false} />
        </div>

        {/* TerminalPanel */}
        <div className="bg-theme-card flex flex-col flex-1 min-h-0">
          <TerminalPanel
            ref={terminalPanelRef}
            task={task}
            tabs={tabs}
            activeTabId={activeTabId}
            onTabChange={setActiveTabId}
            onTabCreate={handleTabCreate}
            onTabDelete={handleTabDelete}
          />
        </div>

        {/* Quick Actions */}
        <div className="px-4 py-4 pr-[72px] border-t border-theme bg-theme-card flex-shrink-0">
          <TaskActions task={task} onDelete={handleTaskDelete} />
        </div>
      </div>

      {/* Edit Task Dialog */}
      <TaskDialog
        mode="edit"
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        task={task}
        onUpdate={handleTaskUpdate}
      />
    </div>
  );
}
