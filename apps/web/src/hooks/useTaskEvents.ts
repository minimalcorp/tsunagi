'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Task } from '@minimalcorp/tsunagi-shared';
import { getServerUrl } from '@/lib/api-url';

interface TaskEventCallbacks {
  onTaskCreated: (task: Task) => void;
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
    const socket = io(getServerUrl(), { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('task:created', ({ task }: { task: Task }) => {
      callbacksRef.current.onTaskCreated(task);
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
