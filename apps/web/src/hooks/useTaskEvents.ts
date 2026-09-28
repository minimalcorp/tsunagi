'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Task } from '@minimalcorp/tsunagi-shared';
import { getServerUrl } from '@/lib/api-url';

interface TaskEventCallbacks {
  /** warnings: 作成は成功したが注意が必要な事項（例: fetch失敗） */
  onTaskCreated: (task: Task, warnings: string[]) => void;
  onTaskUpdated: (task: Task) => void;
  onTaskDeleted: (taskId: string) => void;
}

export function useTaskEvents(callbacks: TaskEventCallbacks) {
  const socketRef = useRef<Socket | null>(null);
  const callbacksRef = useRef(callbacks);

  useLayoutEffect(() => {
    callbacksRef.current = callbacks;
  });

  useEffect(() => {
    // polling 併用: iOS(WebKit) は Basic 認証情報を WS に付与しないため（認証付き公開時の iOS 対策）
    const socket = io(getServerUrl(), { transports: ['polling', 'websocket'] });
    socketRef.current = socket;

    socket.on('task:created', ({ task, warnings }: { task: Task; warnings?: string[] }) => {
      callbacksRef.current.onTaskCreated(task, warnings ?? []);
    });

    socket.on('task:updated', ({ task }: { task: Task }) => {
      callbacksRef.current.onTaskUpdated(task);
    });

    socket.on('task:deleted', ({ taskId }: { taskId: string }) => {
      callbacksRef.current.onTaskDeleted(taskId);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);
}
