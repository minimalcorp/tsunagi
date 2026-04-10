'use client';

import { useEffect, useRef, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Tab } from '@minimalcorp/tsunagi-shared';
import { getServerUrl } from '@/lib/api-url';

// Socket.IOのClaudeStatusをTab.statusにマッピング
function toTabStatus(claudeStatus: string): Tab['status'] | null {
  switch (claudeStatus) {
    case 'running':
      return 'running';
    case 'waiting':
      return 'waiting';
    case 'success':
      return 'success';
    case 'failure':
    case 'error':
      return 'error';
    case 'idle':
      return 'idle';
    default:
      return null;
  }
}

/**
 * 指定したタブIDのSocket.IO roomを購読し、status-changedイベントを受信するhook。
 * タスク一覧 / プランナーのリアルタイムステータス更新に使用。
 */
export function useTabStatusEvents(
  tabIds: string[],
  onStatusChange: (tabId: string, status: Tab['status']) => void
): void {
  const socketRef = useRef<Socket | null>(null);
  const joinedRoomsRef = useRef<Set<string>>(new Set());
  const onStatusChangeRef = useRef(onStatusChange);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  });

  const ensureConnected = useCallback(() => {
    if (!socketRef.current) {
      const socket = io(getServerUrl(), { transports: ['websocket'] });
      socketRef.current = socket;

      socket.on(
        'status-changed',
        ({ sessionId, status }: { sessionId: string; status: string }) => {
          const tabStatus = toTabStatus(status);
          if (tabStatus !== null) {
            onStatusChangeRef.current(sessionId, tabStatus);
          }
        }
      );
    }
    return socketRef.current;
  }, []);

  useEffect(() => {
    if (tabIds.length === 0) return;

    const socket = ensureConnected();

    // 新しいタブのroomに参加
    for (const tabId of tabIds) {
      const room = `tab:${tabId}`;
      if (!joinedRoomsRef.current.has(room)) {
        socket.emit('join', { room });
        joinedRoomsRef.current.add(room);
      }
    }

    // 不要になったroomから退出
    const tabIdSet = new Set(tabIds);
    for (const room of joinedRoomsRef.current) {
      const tabId = room.replace('tab:', '');
      if (!tabIdSet.has(tabId)) {
        socket.emit('leave', { room });
        joinedRoomsRef.current.delete(room);
      }
    }
  }, [tabIds, ensureConnected]);

  useEffect(() => {
    const joinedRooms = joinedRoomsRef.current;
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
      joinedRooms.clear();
    };
  }, []);
}
