'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Task, ClaudeSession } from '@/lib/types';
import { TaskInfo } from '@/components/TaskInfo';
import { SessionTabs } from '@/components/SessionTabs';
import { ViewLayoutToggle, type ViewMode } from '@/components/ViewLayoutToggle';
import { ClaudePromptEditor } from '@/components/ClaudePromptEditor';
import { ExecutionLogsChat } from '@/components/ExecutionLogsChat';
import { TaskActions } from '@/components/TaskActions';
import { LoadingSpinner } from '@/components/LoadingSpinner';

interface TaskDetailPageProps {
  params: {
    id: string;
  };
}

export default function TaskDetailPage({ params }: TaskDetailPageProps) {
  const router = useRouter();
  const [task, setTask] = useState<Task | null>(null);
  const [sessions, setSessions] = useState<ClaudeSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>();
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  // データロード
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // タスク取得
        const taskResponse = await fetch(`/api/tasks/${params.id}`);
        if (!taskResponse.ok) throw new Error('Failed to fetch task');
        const taskData = await taskResponse.json();
        setTask(taskData.data.task);

        // セッション取得
        const sessionsResponse = await fetch(`/api/tasks/${params.id}/sessions`);
        if (!sessionsResponse.ok) throw new Error('Failed to fetch sessions');
        const sessionsData = await sessionsResponse.json();
        const loadedSessions = sessionsData.data.sessions || [];
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
  }, [params.id]);

  // タスク更新
  const handleTaskUpdate = async (taskId: string, updates: Partial<Task>) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) throw new Error('Failed to update task');

      const data = await response.json();
      setTask(data.data.task);
    } catch (error) {
      console.error('Failed to update task:', error);
      throw error;
    }
  };

  // セッション作成
  const handleSessionCreate = async () => {
    try {
      const response = await fetch(`/api/tasks/${params.id}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!response.ok) throw new Error('Failed to create session');

      const data = await response.json();
      const newSession = data.data.session;
      setSessions((prev) => [...prev, newSession]);
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

      setSessions((prev) => prev.filter((s) => s.id !== sessionId));

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

      // セッション状態を更新
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status: 'running' } : s))
      );
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
      });

      if (!response.ok) throw new Error('Failed to interrupt');

      // セッション状態を更新
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, status: 'paused' } : s)));
    } catch (error) {
      console.error('Failed to interrupt:', error);
      throw error;
    }
  };

  // Claude再開
  const handleResume = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}/resume`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to resume');

      // セッション状態を更新
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status: 'running' } : s))
      );
    } catch (error) {
      console.error('Failed to resume:', error);
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
    <div className="min-h-screen bg-theme-bg">
      {/* Back Button */}
      <div className="p-4 border-b border-theme bg-theme-card">
        <button
          onClick={() => router.push('/')}
          className="text-primary-600 hover:text-primary-700 font-medium"
        >
          ← Back to Board
        </button>
      </div>

      {/* Task Info */}
      <div className="p-4 border-b border-theme bg-theme-card">
        <TaskInfo task={task} onUpdate={handleTaskUpdate} />
      </div>

      {/* Session Tabs */}
      <div className="p-4 bg-theme-card">
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
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            >
              + Create First Session
            </button>
          </div>
        )}
      </div>

      {activeSession && (
        <>
          {/* View Toggle */}
          <div className="px-4 bg-theme-card">
            <ViewLayoutToggle mode={viewMode} onChange={setViewMode} />
          </div>

          {/* Editor + Logs (Split or Single) */}
          <div className="p-4 flex-1 bg-theme-bg">
            <div
              className={`
                h-[600px]
                ${viewMode === 'split' ? 'grid grid-cols-2 gap-4' : ''}
              `}
            >
              {(viewMode === 'split' || viewMode === 'editor') && (
                <ClaudePromptEditor
                  session={activeSession}
                  prompt={prompts[activeSession.id] || ''}
                  onExecute={handleExecute}
                  onInterrupt={handleInterrupt}
                  onResume={handleResume}
                  onPromptChange={(prompt) => handlePromptChange(activeSession.id, prompt)}
                />
              )}

              {(viewMode === 'split' || viewMode === 'logs') && (
                <ExecutionLogsChat logs={activeSession.logs} />
              )}
            </div>
          </div>
        </>
      )}

      {/* Quick Actions */}
      <div className="p-4 border-t border-theme bg-theme-card">
        <TaskActions task={task} onDelete={handleTaskDelete} />
      </div>
    </div>
  );
}
