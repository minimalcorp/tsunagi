'use client';

import { use, useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Edit } from 'lucide-react';
import type { Task, Tab, MergedMessage } from '@/lib/types';
import { TaskDialog } from '@/components/TaskDialog';
import { CollapsibleTaskInfo } from '@/components/CollapsibleTaskInfo';
import { SessionTabs } from '@/components/SessionTabs';
import { ViewLayoutToggle, type ViewMode } from '@/components/ViewLayoutToggle';
import { ClaudePromptEditor, type ClaudePromptEditorHandle } from '@/components/ClaudePromptEditor';
import { ExecutionLogsChat } from '@/components/ExecutionLogsChat';
import { TaskActions } from '@/components/TaskActions';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useSSE } from '@/hooks/useSSE';

interface TaskDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function TaskDetailPage({ params }: TaskDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [task, setTask] = useState<Task | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | undefined>();
  const [tabMessages, setTabMessages] = useState<Record<string, MergedMessage[]>>({});
  const [tabSequences, setTabSequences] = useState<Record<string, number>>({});
  const [isResyncing, setIsResyncing] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [isLoading, setIsLoading] = useState(true);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Prompts管理をstateからrefに変更（再レンダリングを防止）
  const promptsRef = useRef<Record<string, string>>({});
  const editorRef = useRef<ClaudePromptEditorHandle | null>(null);

  const activeTab = tabs.find((t) => t.tab_id === activeTabId);

  // SSE統合
  const { eventSource, connectionState } = useSSE();

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

  // データロード
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // タスク取得
        const taskResponse = await fetch(`/api/tasks/${id}`);
        if (!taskResponse.ok) throw new Error('Failed to fetch task');
        const taskData = await taskResponse.json();
        const loadedTask = taskData.data.task;
        setTask(loadedTask);

        // タスクからタブを取得（既にuserPromptCountを含む）
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
        const sequencesMap: Record<string, number> = {};
        messagesResults.forEach((result) => {
          messagesMap[result.tab_id] = result.messages;
          // 最終シーケンス番号を初期化
          const lastMessage = result.messages[result.messages.length - 1];
          if (lastMessage?._sequence) {
            sequencesMap[result.tab_id] = lastMessage._sequence;
          }
        });
        setTabMessages(messagesMap);
        setTabSequences(sequencesMap);

        // アクティブタブ設定
        if (loadedTabs.length > 0) {
          setActiveTabId(loadedTabs[0].tab_id);
        }
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [id]);

  // 全体再同期関数
  const triggerFullResync = useCallback(
    async (tab_id: string) => {
      if (isResyncing.has(tab_id)) {
        console.log(`[Resync] Already resyncing tab ${tab_id}`);
        return;
      }

      console.log(`[Resync] Triggering full resync for tab ${tab_id}`);
      setIsResyncing((prev) => new Set(prev).add(tab_id));

      try {
        const response = await fetch(`/api/tabs/${tab_id}/messages`);
        if (response.ok) {
          const data = await response.json();
          const messages = data.data.messages as MergedMessage[];

          // メッセージを置き換え
          setTabMessages((prev) => ({ ...prev, [tab_id]: messages }));

          // シーケンスを更新
          const lastMessage = messages[messages.length - 1];
          if (lastMessage?._sequence) {
            setTabSequences((prev) => ({ ...prev, [tab_id]: lastMessage._sequence }));
          }
        }
      } catch (error) {
        console.error(`[Resync] Failed to resync tab ${tab_id}:`, error);
      } finally {
        setIsResyncing((prev) => {
          const next = new Set(prev);
          next.delete(tab_id);
          return next;
        });
      }
    },
    [isResyncing]
  );

  // SSEイベントリスナー
  useEffect(() => {
    if (!eventSource) return;

    // tab:updated イベント
    const handleTabUpdated = (event: MessageEvent) => {
      const { taskId, tab } = JSON.parse(event.data) as { taskId: string; tab: Tab };
      // このタスクのタブのみ更新
      if (taskId === id) {
        setTabs((prev) => prev.map((t) => (t.tab_id === tab.tab_id ? tab : t)));
      }
    };

    // tab:deleted イベント
    const handleTabDeleted = (event: MessageEvent) => {
      const { taskId, tab_id } = JSON.parse(event.data) as { taskId: string; tab_id: string };
      if (taskId === id) {
        setTabs((prev) => prev.filter((t) => t.tab_id !== tab_id));
        setTabMessages((prev) => {
          const newMessages = { ...prev };
          delete newMessages[tab_id];
          return newMessages;
        });

        // promptsRefからも削除
        delete promptsRef.current[tab_id];

        // アクティブタブが削除された場合、次のタブを選択
        if (activeTabId === tab_id) {
          const remaining = tabs.filter((t) => t.tab_id !== tab_id);
          setActiveTabId(remaining[0]?.tab_id);
        }
      }
    };

    // tab:created イベント
    const handleTabCreated = (event: MessageEvent) => {
      const { taskId, tab } = JSON.parse(event.data) as { taskId: string; tab: Tab };
      // このタスクのタブのみ追加
      if (taskId === id) {
        setTabs((prev) => {
          // 重複チェック
          if (prev.some((t) => t.tab_id === tab.tab_id)) return prev;
          return [...prev, tab];
        });
        setTabMessages((prev) => ({ ...prev, [tab.tab_id]: [] }));
      }
    };

    // tab:message:added イベント（差分更新）
    const handleTabMessageAdded = (event: MessageEvent) => {
      const { tab_id, message, sequence } = JSON.parse(event.data) as {
        tab_id: string;
        message: MergedMessage;
        sequence: number;
      };

      setTabMessages((prev) => {
        const currentMessages = prev[tab_id] || [];
        const lastSequence = tabSequences[tab_id] || 0;

        // ギャップ検知
        if (sequence !== lastSequence + 1) {
          console.warn(`[SSE] Gap detected for tab ${tab_id}`, {
            expected: lastSequence + 1,
            received: sequence,
          });
          // 全体再同期をトリガー
          triggerFullResync(tab_id);
          return prev; // メッセージを追加せず、再同期を待つ
        }

        // 重複検知
        if (currentMessages.some((m) => m._sequence === sequence)) {
          console.log(`[SSE] Duplicate message ignored for tab ${tab_id}`, { sequence });
          return prev;
        }

        // メッセージを差分追加
        return {
          ...prev,
          [tab_id]: [...currentMessages, message],
        };
      });

      // シーケンスを更新
      setTabSequences((prev) => ({ ...prev, [tab_id]: sequence }));
    };

    // tab:messages:updated イベント（全体同期）
    const handleTabMessagesUpdated = (event: MessageEvent) => {
      const { tab_id, messages, userPromptCount } = JSON.parse(event.data) as {
        tab_id: string;
        messages: MergedMessage[];
        userPromptCount?: number;
      };

      console.log(`[SSE] Full sync for tab ${tab_id}`, { count: messages.length });

      // 全メッセージを置き換え
      setTabMessages((prev) => ({ ...prev, [tab_id]: messages }));

      // タブのuserPromptCountを更新
      if (userPromptCount !== undefined) {
        setTabs((prevTabs) =>
          prevTabs.map((tab) => (tab.tab_id === tab_id ? { ...tab, userPromptCount } : tab))
        );
      }

      // シーケンスを更新
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?._sequence) {
        setTabSequences((prev) => ({ ...prev, [tab_id]: lastMessage._sequence }));
      }

      // 再同期フラグをクリア
      setIsResyncing((prev) => {
        const next = new Set(prev);
        next.delete(tab_id);
        return next;
      });
    };

    // resync:hint イベント（再接続時）
    const handleResyncHint = (event: MessageEvent) => {
      const { lastEventId } = JSON.parse(event.data) as { lastEventId: string };
      console.log('[SSE] Resync hint received', { lastEventId });

      // アクティブタブの全体再同期をトリガー
      if (activeTabId) {
        triggerFullResync(activeTabId);
      }
    };

    // task:updated イベント
    const handleTaskUpdated = (event: MessageEvent) => {
      const updatedTask = JSON.parse(event.data) as Task;
      // このタスクのみ更新
      if (updatedTask.id === id) {
        setTask(updatedTask);
        // タスクにタブ情報が含まれている場合、タブも更新
        if (updatedTask.tabs) {
          setTabs(updatedTask.tabs);
        }
      }
    };

    eventSource.addEventListener('tab:updated', handleTabUpdated);
    eventSource.addEventListener('tab:deleted', handleTabDeleted);
    eventSource.addEventListener('tab:created', handleTabCreated);
    eventSource.addEventListener('tab:message:added', handleTabMessageAdded);
    eventSource.addEventListener('tab:messages:updated', handleTabMessagesUpdated);
    eventSource.addEventListener('resync:hint', handleResyncHint);
    eventSource.addEventListener('task:updated', handleTaskUpdated);

    return () => {
      eventSource.removeEventListener('tab:updated', handleTabUpdated);
      eventSource.removeEventListener('tab:deleted', handleTabDeleted);
      eventSource.removeEventListener('tab:created', handleTabCreated);
      eventSource.removeEventListener('tab:message:added', handleTabMessageAdded);
      eventSource.removeEventListener('tab:messages:updated', handleTabMessagesUpdated);
      eventSource.removeEventListener('resync:hint', handleResyncHint);
      eventSource.removeEventListener('task:updated', handleTaskUpdated);
    };
  }, [eventSource, id, activeTabId, tabs, tabSequences, triggerFullResync]);

  // タブのポーリング（running状態の場合のみ、SSE未接続時のフォールバック）
  useEffect(() => {
    // SSE接続済みの場合はポーリング不要
    if (connectionState === 'connected') return;
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
            [activeTabId]: messagesData.data.messages, // rawMessagesから変更
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
  }, [connectionState, activeTabId, activeTab?.status, task]);

  // タスク更新
  const handleTaskUpdate = async (taskId: string, updates: Partial<Task>) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) throw new Error('Failed to update task');

      // SSE経由でtask:updatedイベントが配信されるため、ここではstateを更新しない
      return { success: true };
    } catch (error) {
      console.error('Failed to update task:', error);
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

      // SSE経由でtab:createdイベントが配信されるため、tabsは更新しない
      // ただし、アクティブタブIDは即座に設定
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

      // SSE経由でtab:deletedイベントが配信されるため、tabsは更新しない
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

      // SSE経由でtab:updatedイベントが配信されるため、tabは更新しない
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

      // SSE経由でtask:updatedイベントが配信されるため、ここではstateを更新しない
    } catch (error) {
      console.error('Failed to interrupt:', error);
      throw error;
    }
  }, []);

  // タスク削除
  const handleTaskDelete = async (taskId: string) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete task');

      // Kanbanに戻る
      router.push('/');
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  if (isLoading || !task) {
    return (
      <div className="h-screen flex items-center justify-center bg-theme-bg">
        <LoadingSpinner size="lg" message="Loading task..." />
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
                <ViewLayoutToggle mode={viewMode} onChange={setViewMode} />
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
                    <ExecutionLogsChat
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
