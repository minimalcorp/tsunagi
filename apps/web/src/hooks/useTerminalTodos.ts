'use client';

import { useState, useEffect, useRef } from 'react';
import type { Todo } from '@minimalcorp/tsunagi-shared';
import { clearRoomSubscriptions, getSharedSocket, syncRoomSubscriptions } from '@/lib/socket';

export type { Todo };

/** タブIDをキーにしたTodosのMap */
export type TabTodosMap = Map<string, Todo[]>;

/**
 * 共有 socket で Todo 更新（todos-updated）を受信する hook。
 * タスクカードの Progress Bar 表示に使用。
 */
export function useTerminalTodos(runningTabIds: string[]): TabTodosMap {
  const [todosMap, setTodosMap] = useState<TabTodosMap>(new Map());
  const subscriptionsRef = useRef<Map<string, () => void>>(new Map());

  useEffect(() => {
    const socket = getSharedSocket();
    const handler = ({ sessionId, todos }: { sessionId: string; todos: Todo[] }) => {
      setTodosMap((prev) => {
        const next = new Map(prev);
        next.set(sessionId, todos);
        return next;
      });
    };
    socket.on('todos-updated', handler);
    return () => {
      socket.off('todos-updated', handler);
    };
  }, []);

  // running 中のタブの room だけ購読する（購読のみ: PTY IO を接続しない）
  useEffect(() => {
    syncRoomSubscriptions(
      subscriptionsRef.current,
      runningTabIds.map((tabId) => `tab:${tabId}`)
    );
  }, [runningTabIds]);

  useEffect(() => {
    const subscriptions = subscriptionsRef.current;
    return () => {
      clearRoomSubscriptions(subscriptions);
    };
  }, []);

  return todosMap;
}
