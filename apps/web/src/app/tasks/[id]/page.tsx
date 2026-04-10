'use client';

import { use, useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Ellipsis, Pencil, Trash2 } from 'lucide-react';
import { apiUrl } from '@/lib/api-url';
import type { Task, Tab } from '@minimalcorp/tsunagi-shared';
import { TaskDialog } from '@/components/TaskDialog';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useToast } from '@/hooks/useToast';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTaskEvents } from '@/hooks/useTaskEvents';
import { TerminalPanel, type TerminalPanelHandle } from '@/components/TerminalPanel';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const terminalPanelRef = useRef<TerminalPanelHandle | null>(null);

  useDocumentTitle(task?.title);

  // Socket.IOでサーバー側の変更（Claude/MCP経由を含む）をリアルタイムに反映
  useTaskEvents({
    onTaskCreated: () => {},
    onTaskUpdated: (updatedTask) => {
      if (updatedTask.id === id) {
        setTask(updatedTask);
      }
    },
    onTaskDeleted: (taskId) => {
      if (taskId === id) {
        toast.info('Task deleted', task?.title ?? undefined);
        router.push('/');
      }
    },
  });

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
      const taskResponse = await fetch(apiUrl(`/api/tasks/${id}`));
      if (!taskResponse.ok) throw new Error('Failed to fetch task');
      const taskData = await taskResponse.json();
      const loadedTask = taskData.data.task;

      // タスクからタブを取得（既にpromptCountを含む）
      let loadedTabs = loadedTask.tabs || [];

      // タブが0個の場合、自動的に1個作成
      if (loadedTabs.length === 0) {
        const createResponse = await fetch(apiUrl(`/api/tasks/${id}/tabs`), {
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
      const response = await fetch(apiUrl(`/api/tasks/${taskId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) throw new Error('Failed to update task');

      const data = await response.json();
      setTask(data.data.task);
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
      const response = await fetch(apiUrl(`/api/tasks/${id}/tabs`), {
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
      const response = await fetch(apiUrl(`/api/tasks/${id}/tabs/${tab_id}`), {
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
  const handleTaskDelete = () => {
    if (!task) return;
    const notificationId = toast.loading('Deleting task...', task.title);

    fetch(apiUrl(`/api/tasks/${task.id}`), {
      method: 'DELETE',
    })
      .then(() => {
        toast.success(notificationId, 'Successfully deleted task', task.title);
      })
      .catch((error) => {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        toast.error(notificationId, 'Failed to delete task', errorMessage);
      });

    router.push('/');
  };

  // 初回ロード時のみローディング表示
  if (isLoading && !task) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <LoadingSpinner size="lg" message="Loading task..." />
      </div>
    );
  }

  // taskがnullの場合（エラー時など）
  if (!task) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center text-foreground">Task not found</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header - Fixed at top */}
      <div className="sticky top-0 z-50 p-4 border-b border-border bg-card">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => router.push('/')}
            className="text-primary font-medium hover:bg-primary/10 hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Board
          </Button>

          <h1 className="text-base font-semibold text-foreground absolute left-1/2 -translate-x-1/2 max-w-[50vw] truncate">
            {task.title}
          </h1>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-lg"
                  className="text-primary hover:bg-primary/10 hover:text-foreground"
                  title="Task menu"
                />
              }
            >
              <Ellipsis className="w-5 h-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setIsEditDialogOpen(true)}>
                <Pencil className="w-4 h-4" />
                Detail / Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setIsDeleteConfirmOpen(true)}
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* TerminalPanel */}
        <div className="bg-card flex flex-col flex-1 min-h-0">
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
      </div>

      {/* Edit Task Dialog */}
      <TaskDialog
        mode="edit"
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        task={task}
        onUpdate={handleTaskUpdate}
      />

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={isDeleteConfirmOpen}
        onOpenChange={(details) => setIsDeleteConfirmOpen(details.open)}
        title="Delete Task"
        message={`Delete task "${task.title}"?\n\nThis will also delete the worktree and branch.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleTaskDelete}
        variant="danger"
      />
    </div>
  );
}
