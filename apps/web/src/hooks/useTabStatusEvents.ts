'use client';

import { useEffect, useRef } from 'react';
import type { Tab } from '@minimalcorp/tsunagi-shared';
import { clearRoomSubscriptions, getSharedSocket, syncRoomSubscriptions } from '@/lib/socket';

// Socket.IOのAgentStatusをTab.statusにマッピング
function toTabStatus(agentStatus: string): Tab['status'] | null {
  switch (agentStatus) {
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
 *
 * 共有 socket を使うため、他の hook が購読している room のイベントも届く。
 * 呼び出し側はタブIDで自分の対象かを判定すること。
 */
export function useTabStatusEvents(
  tabIds: string[],
  onStatusChange: (tabId: string, status: Tab['status']) => void
): void {
  const subscriptionsRef = useRef<Map<string, () => void>>(new Map());
  const onStatusChangeRef = useRef(onStatusChange);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  });

  useEffect(() => {
    const socket = getSharedSocket();
    const handler = ({ sessionId, status }: { sessionId: string; status: string }) => {
      const tabStatus = toTabStatus(status);
      if (tabStatus !== null) {
        onStatusChangeRef.current(sessionId, tabStatus);
      }
    };
    socket.on('status-changed', handler);
    return () => {
      socket.off('status-changed', handler);
    };
  }, []);

  // tabIds の増減に合わせて room の購読を差分更新する（購読のみ: PTY IO を接続しない）
  useEffect(() => {
    syncRoomSubscriptions(
      subscriptionsRef.current,
      tabIds.map((tabId) => `tab:${tabId}`)
    );
  }, [tabIds]);

  useEffect(() => {
    const subscriptions = subscriptionsRef.current;
    return () => {
      clearRoomSubscriptions(subscriptions);
    };
  }, []);
}
