'use client';

import { use, useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Edit } from 'lucide-react';
import type { Task, Tab, MergedMessage } from '@/lib/types';
import { TaskDialog } from '@/components/TaskDialog';
import { CollapsibleTaskInfo } from '@/components/CollapsibleTaskInfo';
import { SessionTabs } from '@/components/SessionTabs';
import { ViewLayoutToggle, type ViewMode } from '@/components/ViewLayoutToggle';
import { DocumentViewToggle, type DocumentViewMode } from '@/components/DocumentViewToggle';
import { ClaudePromptEditor, type ClaudePromptEditorHandle } from '@/components/ClaudePromptEditor';
import { DocumentViewer } from '@/components/DocumentViewer';
import { TaskActions } from '@/components/TaskActions';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useToast } from '@/hooks/useToast';

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
  const [tabMessages, setTabMessages] = useState<Record<string, MergedMessage[]>>({});
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [documentViewMode, setDocumentViewMode] = useState<DocumentViewMode>('logs');
  const [isLoading, setIsLoading] = useState(true);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Prompts管理をstateからrefに変更（再レンダリングを防止）
  const promptsRef = useRef<Record<string, string>>({});
  const editorRef = useRef<ClaudePromptEditorHandle | null>(null);

  const activeTab = tabs.find((t) => t.tab_id === activeTabId);

  // タブ切り替え時の処理（現在のプロンプトを保存）
  const handleTabChange = useCallback(
    (newTabId: string) => {
      // 現在のタブのプロンプトを保存
      if (activeTabId && editorRef.current) {
        const currentPrompt = editorRef.current.getCurrentPrompt();
        promptsRef.current[activeTabId] = currentPrompt;
      }

      // タブIDを切り替え
      setActiveTabId(newTabId);
    },
    [activeTabId]
  );

  // タブ切り替え後にエディタの値を復元
  useEffect(() => {
    if (activeTabId && editorRef.current) {
      const savedPrompt = promptsRef.current[activeTabId] || '';
      editorRef.current.setPrompt(savedPrompt);
    }
  }, [activeTabId]);

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
      setTask(loadedTask);

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

      setTabs(loadedTabs);

      // 各タブのメッセージを取得
      const messagesPromises = loadedTabs.map(async (tab: Tab) => {
        try {
          const response = await fetch(`/api/tabs/${tab.tab_id}/messages`);
          if (response.ok) {
            const data = await response.json();
            return { tab_id: tab.tab_id, messages: data.data.messages };
          }
        } catch (error) {
          console.error(`Failed to load messages for tab ${tab.tab_id}:`, error);
        }
        return { tab_id: tab.tab_id, messages: [] };
      });

      const messagesResults = await Promise.all(messagesPromises);
      const messagesMap: Record<string, MergedMessage[]> = {};
      messagesResults.forEach((result) => {
        messagesMap[result.tab_id] = result.messages;
      });
      setTabMessages(messagesMap);

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

  // タブのポーリング（running状態の場合のみ）
  useEffect(() => {
    if (!activeTabId || !task) return;

    const pollTab = async () => {
      try {
        // タスクを再取得してタブ情報を更新
        const taskResponse = await fetch(`/api/tasks/${task.id}`);
        if (taskResponse.ok) {
          const taskData = await taskResponse.json();
          const updatedTask = taskData.data.task;
          setTask(updatedTask);
          if (updatedTask.tabs) {
            setTabs(updatedTask.tabs);
          }
        }

        // メッセージも更新
        const messagesResponse = await fetch(`/api/tabs/${activeTabId}/messages`);
        if (messagesResponse.ok) {
          const messagesData = await messagesResponse.json();
          setTabMessages((prev) => ({
            ...prev,
            [activeTabId]: messagesData.data.messages,
          }));
        }
      } catch (error) {
        console.error('Failed to poll tab:', error);
      }
    };

    // タブがrunning状態の場合のみポーリング
    const isRunning = activeTab?.status === 'running';
    if (!isRunning) return;

    // 1秒ごとにポーリング
    const intervalId = setInterval(pollTab, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [activeTabId, activeTab?.status, task]);

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

  // タブ作成
  const handleTabCreate = async () => {
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
      setTabMessages((prev) => ({ ...prev, [newTab.tab_id]: [] }));
      setActiveTabId(newTab.tab_id);
    } catch (error) {
      console.error('Failed to create tab:', error);
    }
  };

  // タブ削除
  const handleTabDelete = async (tab_id: string) => {
    try {
      const response = await fetch(`/api/tasks/${id}/tabs/${tab_id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete tab');

      // promptsRefからも削除
      delete promptsRef.current[tab_id];

      setTabs((prev) => prev.filter((t) => t.tab_id !== tab_id));
      setTabMessages((prev) => {
        const newMessages = { ...prev };
        delete newMessages[tab_id];
        return newMessages;
      });

      // アクティブタブが削除された場合、次のタブを選択
      if (activeTabId === tab_id) {
        const remaining = tabs.filter((t) => t.tab_id !== tab_id);
        setActiveTabId(remaining[0]?.tab_id);
      }
    } catch (error) {
      console.error('Failed to delete tab:', error);
    }
  };

  // Claude実行
  const handleExecute = useCallback(async (tab_id: string, prompt: string) => {
    try {
      const response = await fetch(`/api/tabs/${tab_id}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });

      if (!response.ok) throw new Error('Failed to execute');

      // 実行成功後にエディタとRefの両方をクリア
      if (editorRef.current) {
        editorRef.current.clearPrompt();
      }
      promptsRef.current[tab_id] = '';
    } catch (error) {
      console.error('Failed to execute:', error);
      throw error;
    }
  }, []);

  // Claude中断
  const handleInterrupt = useCallback(async (tab_id: string) => {
    try {
      const response = await fetch(`/api/tabs/${tab_id}/interrupt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!response.ok) throw new Error('Failed to interrupt');
    } catch (error) {
      console.error('Failed to interrupt:', error);
      throw error;
    }
  }, []);

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

          <h1 className="text-xl font-bold text-theme-fg absolute left-1/2 -translate-x-1/2">
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
        <div className="p-4 bg-theme-card flex-shrink-0">
          <CollapsibleTaskInfo task={task} defaultExpanded={false} />
        </div>

        {/* Tab Navigation & Content */}
        <div className="bg-theme-card flex flex-col flex-1 min-h-0">
          <div className="px-4 pt-4">
            {tabs.length > 0 ? (
              <SessionTabs
                tabs={tabs}
                activeTabId={activeTabId}
                onTabChange={handleTabChange}
                onTabCreate={handleTabCreate}
                onTabDelete={handleTabDelete}
              />
            ) : (
              <div className="text-center py-8">
                <p className="text-theme-muted mb-4">No tabs yet</p>
                <button
                  onClick={handleTabCreate}
                  className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 cursor-pointer"
                >
                  + Create First Tab
                </button>
              </div>
            )}
          </div>

          {activeTab && (
            <>
              {/* View Toggle */}
              <div className="px-4 pt-2">
                <div className="flex items-center gap-2">
                  <ViewLayoutToggle mode={viewMode} onChange={setViewMode} />
                  <div className="h-6 w-px bg-theme" />
                  <DocumentViewToggle mode={documentViewMode} onChange={setDocumentViewMode} />
                </div>
              </div>

              {/* Editor + Logs (Split or Single) */}
              <div className="pt-2 px-4 pb-4 flex-1 min-h-0">
                <div
                  className={`
                  h-full
                  ${viewMode === 'split' ? 'grid grid-cols-2 gap-4' : ''}
                `}
                >
                  {(viewMode === 'split' || viewMode === 'editor') && (
                    <ClaudePromptEditor
                      ref={editorRef}
                      tab={activeTab}
                      onExecute={handleExecute}
                      onInterrupt={handleInterrupt}
                    />
                  )}

                  {(viewMode === 'split' || viewMode === 'logs') && (
                    <DocumentViewer
                      mode={documentViewMode}
                      task={task}
                      rawMessages={tabMessages[activeTab.tab_id] || []}
                      tabId={activeTab.tab_id}
                      tab={activeTab}
                    />
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Quick Actions */}
        <div className="px-4 py-4 pr-[72px] border-t border-theme bg-theme-card flex-shrink-0">
          <TaskActions
            task={task}
            onDelete={handleTaskDelete}
            onSendPrompt={handleExecute}
            activeTabId={activeTabId}
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
    </div>
  );
}
