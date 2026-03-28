'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Task } from '@/lib/types';

const FASTIFY_API_BASE = 'http://localhost:2792';

interface TaskEventCallbacks {
  onTaskCreated: (task: Task) => void;
  onTaskDeleted: (taskId: string) => void;
}

export function useTaskEvents(callbacks: TaskEventCallbacks) {
  const socketRef = useRef<Socket | null>(null);
  const callbacksRef = useRef(callbacks);

  useLayoutEffect(() => {
    callbacksRef.current = callbacks;
  });

  useEffect(() => {
    const socket = io(FASTIFY_API_BASE, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('task:created', ({ task }: { task: Task }) => {
      callbacksRef.current.onTaskCreated(task);
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
