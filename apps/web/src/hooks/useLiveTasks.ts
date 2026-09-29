'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Task } from '@minimalcorp/tsunagi-shared';
import { apiUrl } from '@/lib/api-url';
import { unreadForStatus } from '@/lib/claude-status';
import { useTaskEvents } from '@/hooks/useTaskEvents';
import { useTabStatusEvents } from '@/hooks/useTabStatusEvents';

interface LiveTasksCallbacks {
  /** 画面固有の通知（トースト等）用。state の反映は hook 側で行う */
  onTaskCreated?: (task: Task, warnings: string[]) => void;
  onTaskUpdated?: (task: Task) => void;
  /** deletedTask: 削除前に保持していたタスク（未取得なら undefined） */
  onTaskDeleted?: (taskId: string, deletedTask: Task | undefined) => void;
}

/**
 * 全タスクを取得し、タスク・タブの変化をリアルタイムに反映し続ける hook。
 * 表示側で絞り込む場合でも、状態の追従は全タスク・全タブを対象にする
 * （購読対象を絞ると、対象外タスクが実行中・未読になった変化を取りこぼすため）。
 */
export function useLiveTasks(callbacks: LiveTasksCallbacks = {}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const callbacksRef = useRef(callbacks);
  const tasksRef = useRef(tasks);
  useEffect(() => {
    callbacksRef.current = callbacks;
    tasksRef.current = tasks;
  });

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(apiUrl('/api/tasks'));
      if (!res.ok) throw new Error('Failed to fetch tasks');
      const data = await res.json();
      setTasks(data.data.tasks);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const allTabIds = useMemo(
    () => tasks.flatMap((t) => (t.tabs ?? []).map((tab) => tab.tab_id)),
    [tasks]
  );

  useTabStatusEvents(allTabIds, (tabId, status) => {
    // 未読フラグはDBにもあるがリアルタイムでは status しか流れてこないため、
    // サーバー(hooks.ts)と同じルールでここでも導出する
    const unread = unreadForStatus(status);
    setTasks((prev) =>
      prev.map((task) => ({
        ...task,
        tabs: (task.tabs ?? []).map((tab) =>
          tab.tab_id === tabId ? { ...tab, status, ...(unread !== undefined && { unread }) } : tab
        ),
      }))
    );
  });

  useTaskEvents({
    onTaskCreated: (newTask, warnings) => {
      setTasks((prev) => {
        if (prev.some((t) => t.id === newTask.id)) return prev;
        return [...prev, newTask];
      });
      callbacksRef.current.onTaskCreated?.(newTask, warnings);
    },
    onTaskUpdated: (updatedTask) => {
      setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)));
      callbacksRef.current.onTaskUpdated?.(updatedTask);
    },
    onTaskDeleted: (taskId) => {
      // updater外で取得（Strict Modeでupdaterが2回呼ばれても影響なし）
      const deletedTask = tasksRef.current.find((t) => t.id === taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      callbacksRef.current.onTaskDeleted?.(taskId, deletedTask);
    },
    onTaskTabsChanged: (changedTask) => {
      // タブの増減を反映 → allTabIds が変わり新しいタブの status 購読が始まる
      setTasks((prev) => prev.map((t) => (t.id === changedTask.id ? changedTask : t)));
    },
  });

  return { tasks, setTasks, isLoading, reload };
}
