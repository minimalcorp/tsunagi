'use client';

import { useState, useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

export interface Todo {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

/** タブIDをキーにしたTodosのMap */
export type TabTodosMap = Map<string, Todo[]>;

const FASTIFY_API_BASE = 'http://localhost:2792';

/**
 * Fastify socket.ioに接続してTodo更新を受信するhook。
 * KanbanページのProgress Bar表示に使用。
 */
export function useTerminalTodos(runningTabIds: string[]): TabTodosMap {
  const [todosMap, setTodosMap] = useState<TabTodosMap>(new Map());
  const socketRef = useRef<Socket | null>(null);
  const joinedRoomsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // 接続がなければ作成
    if (!socketRef.current) {
      const socket = io(FASTIFY_API_BASE, { transports: ['websocket'] });
      socketRef.current = socket;

      socket.on('todos-updated', ({ sessionId, todos }: { sessionId: string; todos: Todo[] }) => {
        setTodosMap((prev) => {
          const next = new Map(prev);
          next.set(sessionId, todos);
          return next;
        });
      });

      socket.on(
        'status-changed',
        ({ sessionId, status }: { sessionId: string; status: string }) => {
          // idle/errorになったらtodosをクリア
          if (status === 'idle' || status === 'error') {
            setTodosMap((prev) => {
              const next = new Map(prev);
              next.delete(sessionId);
              return next;
            });
          }
        }
      );
    }

    const socket = socketRef.current;

    // running中のタブのroomに参加
    for (const tabId of runningTabIds) {
      const room = `tab:${tabId}`;
      if (!joinedRoomsRef.current.has(room)) {
        socket.emit('join', { room });
        joinedRoomsRef.current.add(room);
      }
    }

    // running中でなくなったタブのroomから退出
    for (const room of joinedRoomsRef.current) {
      const tabId = room.replace('tab:', '');
      if (!runningTabIds.includes(tabId)) {
        socket.emit('leave', { room });
        joinedRoomsRef.current.delete(room);
      }
    }
  }, [runningTabIds]);

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
      joinedRoomsRef.current.clear();
    };
  }, []);

  return todosMap;
}
