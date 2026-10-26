'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Task } from '@minimalcorp/tsunagi-shared';
import { getSharedSocket } from '@/lib/socket';

interface TaskEventCallbacks {
  /** warnings: 作成は成功したが注意が必要な事項（例: fetch失敗） */
  onTaskCreated: (task: Task, warnings: string[]) => void;
  onTaskUpdated: (task: Task) => void;
  onTaskDeleted: (taskId: string) => void;
  /** タブの作成・削除（status 購読対象の増減に使う） */
  onTaskTabsChanged?: (task: Task) => void;
  /** 並び替え（1操作で1回）。order が変わったタスクの id と新しい order */
  onTasksReordered?: (orders: { id: string; order: number }[]) => void;
}

/** 共有 socket で task:* イベントを購読する。アンマウント時はリスナーだけ外す（接続は共有） */
export function useTaskEvents(callbacks: TaskEventCallbacks) {
  const callbacksRef = useRef(callbacks);

  useLayoutEffect(() => {
    callbacksRef.current = callbacks;
  });

  useEffect(() => {
    const socket = getSharedSocket();

    const onCreated = ({ task, warnings }: { task: Task; warnings?: string[] }) => {
      callbacksRef.current.onTaskCreated(task, warnings ?? []);
    };
    const onUpdated = ({ task }: { task: Task }) => {
      callbacksRef.current.onTaskUpdated(task);
    };
    const onDeleted = ({ taskId }: { taskId: string }) => {
      callbacksRef.current.onTaskDeleted(taskId);
    };
    const onTabsChanged = ({ task }: { task: Task }) => {
      callbacksRef.current.onTaskTabsChanged?.(task);
    };
    const onReordered = ({ orders }: { orders: { id: string; order: number }[] }) => {
      callbacksRef.current.onTasksReordered?.(orders);
    };

    socket.on('task:created', onCreated);
    socket.on('task:updated', onUpdated);
    socket.on('task:deleted', onDeleted);
    socket.on('task:tabs-changed', onTabsChanged);
    socket.on('tasks:reordered', onReordered);

    return () => {
      socket.off('task:created', onCreated);
      socket.off('task:updated', onUpdated);
      socket.off('task:deleted', onDeleted);
      socket.off('task:tabs-changed', onTabsChanged);
      socket.off('tasks:reordered', onReordered);
    };
  }, []);
}
