'use client';

import { use, useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Code2,
  Ellipsis,
  EyeOff,
  FolderX,
  Pencil,
  Terminal,
  Trash2,
} from 'lucide-react';
import { apiUrl } from '@/lib/api-url';
import type { Task, Tab } from '@minimalcorp/tsunagi-shared';
import { LazyTaskDialog } from '@/components/LazyTaskDialog';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useToast } from '@/hooks/useToast';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTaskEvents } from '@/hooks/useTaskEvents';
import { useSidebarTaskList } from '@/hooks/useSidebarTaskList';
import { TerminalPanel, type TerminalPanelHandle } from '@/components/TerminalPanel';
import type { AgentStatus } from '@/components/TerminalView';
import { Button, buttonVariants } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { cn } from '@/lib/utils';
import { UpdateIndicator } from '@/components/UpdateIndicator';
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
  const [worktreeExists, setWorktreeExists] = useState(true);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const { state: sidebarState, update: updateSidebar } = useSidebarTaskList();
  const isHiddenFromSidebar = sidebarState.hidden.includes(id);

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
    // タブの増減・名前の変化（別の画面・MCP・セッションタイトル）を反映する
    onTaskTabsChanged: (changedTask) => {
      if (changedTask.id !== id) return;
      const nextTabs = changedTask.tabs ?? [];
      setTabs(nextTabs);
      // 別の画面で選択中のタブが消された場合は先頭のタブに移る
      setActiveTabId((current) =>
        current && !nextTabs.some((t) => t.tab_id === current) ? nextTabs[0]?.tab_id : current
      );
    },
    onTaskDeleted: (taskId) => {
      if (taskId === id) {
        toast.info('Task deleted', task?.title ?? undefined);
        router.push('/');
      }
    },
  });

  // 「詳細を開いた = 実行結果を確認した」とみなし、タスク配下の全タブを既読にする。
  // ボード側の未読バッジはこの API の結果（task:updated）で消える
  const markAsRead = useCallback(() => {
    fetch(apiUrl(`/api/tasks/${id}/read`), { method: 'POST' }).catch(() => {
      // 既読化の失敗はユーザー操作を妨げないので握りつぶす（次回開いた時に再試行される）
    });
  }, [id]);

  // 詳細を開いたまま Claude が完了した場合も、その場で既読にする
  const handleAgentStatusChange = useCallback(
    (_tabId: string, claude: AgentStatus) => {
      if (claude === 'success' || claude === 'failure' || claude === 'error') {
        markAsRead();
      }
    },
    [markAsRead]
  );

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

      // タスクからタブを取得（既にpromptCountを含む）。
      // タブ0個でも自動作成はしない（ユーザーが起動先を選んでタブを作る）
      const loadedTabs = loadedTask.tabs || [];

      // 全 await 完了後にまとめて state 更新（中間レンダリングを防ぐ）
      setTask(loadedTask);
      setWorktreeExists(taskData.data.worktreeExists);
      setTabs(loadedTabs);

      // アクティブタブ設定
      if (loadedTabs.length > 0) {
        setActiveTabId(loadedTabs[0].tab_id);
      }

      markAsRead();
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
      setIsInitialLoad(false);
    }
  }, [id, isInitialLoad, markAsRead]);

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
  const handleTabCreate = async (mode: Tab['mode'] = 'claude'): Promise<string | undefined> => {
    try {
      const response = await fetch(apiUrl(`/api/tasks/${id}/tabs`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
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

  // タブ名変更（空文字で名前を外す）。先に表示を変え、失敗したら戻す
  const handleTabRename = async (tab_id: string, name: string) => {
    const previous = tabs.find((t) => t.tab_id === tab_id)?.name;
    const optimistic = name.trim() || undefined;
    setTabs((prev) => prev.map((t) => (t.tab_id === tab_id ? { ...t, name: optimistic } : t)));
    try {
      const response = await fetch(apiUrl(`/api/tasks/${id}/tabs/${tab_id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to rename tab');
      }
    } catch (error) {
      console.error('Failed to rename tab:', error);
      // 失敗までの間に別の画面・MCP で付いた名前は上書きしない
      setTabs((prev) =>
        prev.map((t) =>
          t.tab_id === tab_id && t.name === optimistic ? { ...t, name: previous } : t
        )
      );
      toast.error(
        undefined,
        'Failed to rename tab',
        error instanceof Error ? error.message : undefined
      );
    }
  };

  // Terminal を開く
  const handleOpenTerminal = async () => {
    if (!task) return;
    const notificationId = toast.loading('Opening terminal...', task.worktreePath);
    try {
      const res = await fetch(apiUrl('/api/commands/open'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commandType: 'terminal',
          owner: task.owner,
          repo: task.repo,
          branch: task.branch,
        }),
      });
      if (!res.ok) throw new Error('Command execution failed');
      toast.success(notificationId, 'Successfully opened terminal', task.worktreePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(notificationId, 'Failed to open terminal', message);
    }
  };

  // VS Code を開く
  const handleOpenVSCode = async () => {
    if (!task) return;
    const notificationId = toast.loading('Opening VS Code...', task.worktreePath);
    try {
      const res = await fetch(apiUrl('/api/commands/open'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commandType: 'vscode',
          owner: task.owner,
          repo: task.repo,
          branch: task.branch,
        }),
      });
      if (!res.ok) throw new Error('Command execution failed');
      toast.success(notificationId, 'Successfully opened VS Code', task.worktreePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(notificationId, 'Failed to open VS Code', message);
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
          {/* Link にしてトップの RSC とチャンクを先読みさせる（router.push だと戻る時に取りに行く） */}
          <Link
            href="/"
            className={cn(
              buttonVariants({ variant: 'ghost' }),
              'text-primary font-medium hover:bg-primary/10 hover:text-foreground'
            )}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Board
          </Link>

          <div className="absolute left-1/2 -translate-x-1/2 max-w-[50vw] flex items-center gap-1">
            <h1 className="min-w-0 truncate text-base font-semibold text-foreground">
              {task.title}
            </h1>
            {isHiddenFromSidebar && (
              <Button
                variant="ghost"
                size="icon"
                className="hidden md:inline-flex shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="Hidden from sidebar. Click to show"
                title="Hidden from sidebar. Click to show"
                onClick={() =>
                  updateSidebar((prev) => ({
                    ...prev,
                    hidden: prev.hidden.filter((hiddenId) => hiddenId !== id),
                    shown: prev.shown.includes(id) ? prev.shown : [...prev.shown, id],
                  }))
                }
              >
                <EyeOff />
              </Button>
            )}
          </div>

          <div className="flex items-center gap-1">
            <UpdateIndicator />
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
                {worktreeExists && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleOpenTerminal}>
                      <Terminal className="w-4 h-4" />
                      Open Terminal
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleOpenVSCode}>
                      <Code2 className="w-4 h-4" />
                      Open VS Code
                    </DropdownMenuItem>
                  </>
                )}
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
      </div>

      {/* Scrollable content */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* TerminalPanel: light はトップページと同じく地を background、ターミナルを card にして境界を出す */}
        <div className="bg-background dark:bg-card flex flex-col flex-1 min-h-0">
          {worktreeExists ? (
            <TerminalPanel
              ref={terminalPanelRef}
              task={task}
              tabs={tabs}
              activeTabId={activeTabId}
              onTabChange={setActiveTabId}
              onTabCreate={handleTabCreate}
              onTabDelete={handleTabDelete}
              onTabRename={handleTabRename}
              onAgentStatusChange={handleAgentStatusChange}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
              <FolderX className="size-10 text-muted-foreground" />
              <div className="space-y-1">
                <p className="font-medium text-foreground">Worktree not found</p>
                <p className="text-sm text-muted-foreground break-all">{task.worktreePath}</p>
              </div>
              <Button variant="destructive" onClick={() => setIsDeleteConfirmOpen(true)}>
                <Trash2 className="w-4 h-4" />
                Delete Task
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Edit Task Dialog */}
      <LazyTaskDialog
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
