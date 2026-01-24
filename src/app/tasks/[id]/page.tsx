'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import type { Task, ClaudeSession } from '@/lib/types';
import { TaskInfo } from '@/components/TaskInfo';
import { SessionTabs } from '@/components/SessionTabs';
import { ViewLayoutToggle, type ViewMode } from '@/components/ViewLayoutToggle';
import { ClaudePromptEditor } from '@/components/ClaudePromptEditor';
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
  const [sessions, setSessions] = useState<ClaudeSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>();
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingTask, setIsEditingTask] = useState(false);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  // SSE統合
  const { eventSource, isConnected } = useSSE();

  // データロード
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // タスク取得
        const taskResponse = await fetch(`/api/tasks/${id}`);
        if (!taskResponse.ok) throw new Error('Failed to fetch task');
        const taskData = await taskResponse.json();
        setTask(taskData.data.task);

        // セッション取得
        const sessionsResponse = await fetch(`/api/tasks/${id}/sessions`);
        if (!sessionsResponse.ok) throw new Error('Failed to fetch sessions');
        const sessionsData = await sessionsResponse.json();
        let loadedSessions = sessionsData.data.sessions || [];

        // セッションが0個の場合、自動的に1個作成
        if (loadedSessions.length === 0) {
          const createResponse = await fetch(`/api/tasks/${id}/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          if (createResponse.ok) {
            const createData = await createResponse.json();
            loadedSessions = [createData.data.session];
          }
        }

        setSessions(loadedSessions);

        // アクティブセッション設定
        if (loadedSessions.length > 0) {
          setActiveSessionId(loadedSessions[0].id);
        }
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [id]);

  // SSEイベントリスナー
  useEffect(() => {
    if (!eventSource) return;

    // session:updated イベント
    const handleSessionUpdated = (event: MessageEvent) => {
      const session = JSON.parse(event.data) as ClaudeSession;
      // このタスクのセッションのみ更新
      setSessions((prev) => prev.map((s) => (s.id === session.id ? session : s)));
    };

    // session:deleted イベント
    const handleSessionDeleted = (event: MessageEvent) => {
      const { id: sessionId } = JSON.parse(event.data) as { id: string };
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));

      // アクティブセッションが削除された場合、次のセッションを選択
      if (activeSessionId === sessionId) {
        const remaining = sessions.filter((s) => s.id !== sessionId);
        setActiveSessionId(remaining[0]?.id);
      }
    };

    // session:created イベント
    const handleSessionCreated = (event: MessageEvent) => {
      const session = JSON.parse(event.data) as ClaudeSession;
      // このタスクのセッションのみ追加
      if (session.taskId === id) {
        setSessions((prev) => {
          // 重複チェック
          if (prev.some((s) => s.id === session.id)) return prev;
          return [...prev, session];
        });
      }
    };

    // task:updated イベント
    const handleTaskUpdated = (event: MessageEvent) => {
      const updatedTask = JSON.parse(event.data) as Task;
      // このタスクのみ更新
      if (updatedTask.id === id) {
        setTask(updatedTask);
      }
    };

    eventSource.addEventListener('session:updated', handleSessionUpdated);
    eventSource.addEventListener('session:deleted', handleSessionDeleted);
    eventSource.addEventListener('session:created', handleSessionCreated);
    eventSource.addEventListener('task:updated', handleTaskUpdated);

    return () => {
      eventSource.removeEventListener('session:updated', handleSessionUpdated);
      eventSource.removeEventListener('session:deleted', handleSessionDeleted);
      eventSource.removeEventListener('session:created', handleSessionCreated);
      eventSource.removeEventListener('task:updated', handleTaskUpdated);
    };
  }, [eventSource, id, activeSessionId, sessions]);

  // セッションのポーリング（running状態の場合のみ、SSE未接続時のフォールバック）
  useEffect(() => {
    // SSE接続済みの場合はポーリング不要
    if (isConnected) return;
    if (!activeSessionId) return;

    const pollSession = async () => {
      try {
        const response = await fetch(`/api/sessions/${activeSessionId}`);
        if (!response.ok) return;

        const data = await response.json();
        const updatedSession = data.data;

        // セッション情報を更新
        setSessions((prev) => prev.map((s) => (s.id === activeSessionId ? updatedSession : s)));

        // タスクの状態も更新
        if (task) {
          const taskResponse = await fetch(`/api/tasks/${task.id}`);
          if (taskResponse.ok) {
            const taskData = await taskResponse.json();
            setTask(taskData.data.task);
          }
        }
      } catch (error) {
        console.error('Failed to poll session:', error);
      }
    };

    // セッションがrunning状態の場合のみポーリング
    const isRunning = activeSession?.status === 'running';
    if (!isRunning) return;

    // 1秒ごとにポーリング
    const intervalId = setInterval(pollSession, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [isConnected, activeSessionId, activeSession?.status, task]);

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
    } catch (error) {
      console.error('Failed to update task:', error);
      throw error;
    }
  };

  // セッション作成
  const handleSessionCreate = async () => {
    try {
      const response = await fetch(`/api/tasks/${id}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!response.ok) throw new Error('Failed to create session');

      const data = await response.json();
      const newSession = data.data.session;

      // SSE経由でsession:createdイベントが配信されるため、sessionsは更新しない
      // ただし、アクティブセッションIDは即座に設定
      setActiveSessionId(newSession.id);
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  // セッション削除
  const handleSessionDelete = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete session');

      // SSE経由でsession:deletedイベントが配信されるため、sessionsは更新しない
      // アクティブセッションが削除された場合、次のセッションを選択
      if (activeSessionId === sessionId) {
        const remaining = sessions.filter((s) => s.id !== sessionId);
        setActiveSessionId(remaining[0]?.id);
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  // Claude実行
  const handleExecute = async (sessionId: string, prompt: string) => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });

      if (!response.ok) throw new Error('Failed to execute');

      // SSE経由でsession:updatedイベントが配信されるため、sessionは更新しない
      // 実行成功後にプロンプトをクリア
      setPrompts((prev) => ({ ...prev, [sessionId]: '' }));
    } catch (error) {
      console.error('Failed to execute:', error);
      throw error;
    }
  };

  // Claude中断
  const handleInterrupt = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}/interrupt`, {
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
  };

  // プロンプト変更
  const handlePromptChange = (sessionId: string, prompt: string) => {
    setPrompts((prev) => ({ ...prev, [sessionId]: prompt }));
  };

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
            className="text-primary-light hover:brightness-110 font-medium flex items-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Board
          </button>

          <h1 className="text-xl font-bold text-theme-fg absolute left-1/2 -translate-x-1/2">
            {task.title}
          </h1>

          <TaskInfo
            task={task}
            onUpdate={handleTaskUpdate}
            editOnly
            isEditing={isEditingTask}
            onEditChange={setIsEditingTask}
          />
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Task Info Detail Section */}
        <div className="p-4 bg-theme-card flex-shrink-0">
          <TaskInfo
            task={task}
            onUpdate={handleTaskUpdate}
            isEditing={isEditingTask}
            onEditChange={setIsEditingTask}
            hideButtons={true}
          />
        </div>

        {/* Session Tabs & Content */}
        <div className="bg-theme-card flex flex-col flex-1 min-h-0">
          <div className="px-4 pt-4">
            {sessions.length > 0 ? (
              <SessionTabs
                sessions={sessions}
                activeSessionId={activeSessionId}
                onSessionChange={setActiveSessionId}
                onSessionCreate={handleSessionCreate}
                onSessionDelete={handleSessionDelete}
              />
            ) : (
              <div className="text-center py-8">
                <p className="text-theme-muted mb-4">No sessions yet</p>
                <button
                  onClick={handleSessionCreate}
                  className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 cursor-pointer"
                >
                  + Create First Session
                </button>
              </div>
            )}
          </div>

          {activeSession && (
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
                      session={activeSession}
                      prompt={prompts[activeSession.id] || ''}
                      onExecute={handleExecute}
                      onInterrupt={handleInterrupt}
                      onPromptChange={(prompt) => handlePromptChange(activeSession.id, prompt)}
                    />
                  )}

                  {(viewMode === 'split' || viewMode === 'logs') && (
                    <ExecutionLogsChat
                      rawMessages={activeSession.rawMessages}
                      sessionId={activeSession.id}
                    />
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Quick Actions */}
        <div className="p-4 border-t border-theme bg-theme-card flex-shrink-0">
          <TaskActions task={task} onDelete={handleTaskDelete} />
        </div>
      </div>
    </div>
  );
}
