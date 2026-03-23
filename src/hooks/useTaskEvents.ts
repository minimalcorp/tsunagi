'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Task } from '@/lib/types';

const FASTIFY_API_BASE = 'http://localhost:2792';

export function useTaskEvents(onTaskCreated: (task: Task) => void) {
  const socketRef = useRef<Socket | null>(null);
  const callbackRef = useRef(onTaskCreated);

  useLayoutEffect(() => {
    callbackRef.current = onTaskCreated;
  });

  useEffect(() => {
    const socket = io(FASTIFY_API_BASE, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('task:created', ({ task }: { task: Task }) => {
      callbackRef.current(task);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);
}
