import { useEffect, useState, useCallback } from 'react';

export type ConnectionState = 'connected' | 'connecting' | 'disconnected';

const STALE_TIMEOUT = 60000; // 60秒

export function useSSE() {
  const [eventSource, setEventSource] = useState<EventSource | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [lastMessageAt, setLastMessageAt] = useState<number>(0);

  // 接続状態を更新する関数
  const updateConnectionState = useCallback((es: EventSource | null, lastMsg: number) => {
    if (!es) {
      setConnectionState('disconnected');
      return;
    }

    const now = Date.now();
    const isStale = now - lastMsg > STALE_TIMEOUT;

    switch (es.readyState) {
      case EventSource.CONNECTING:
        setConnectionState('connecting');
        break;
      case EventSource.OPEN:
        setConnectionState(isStale ? 'disconnected' : 'connected');
        break;
      case EventSource.CLOSED:
        setConnectionState('disconnected');
        break;
    }
  }, []);

  useEffect(() => {
    const es = new EventSource('/api/events');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEventSource(es);

    // 初期接続時刻を設定
    setLastMessageAt(Date.now());

    // メッセージ受信時刻を更新するハンドラー
    const updateLastMessage = () => {
      setLastMessageAt(Date.now());
    };

    // connected イベント
    es.addEventListener('connected', () => {
      console.log('[SSE] Connected');
      updateLastMessage();
    });

    // すべてのイベントで最終受信時刻を更新
    es.addEventListener('message', updateLastMessage);
    es.addEventListener('task:created', updateLastMessage);
    es.addEventListener('task:updated', updateLastMessage);
    es.addEventListener('task:deleted', updateLastMessage);
    es.addEventListener('tab:created', updateLastMessage);
    es.addEventListener('tab:updated', updateLastMessage);
    es.addEventListener('resync:hint', updateLastMessage);

    // エラーハンドリング
    es.onerror = () => {
      console.log('[SSE] Error occurred');
      // ブラウザが自動的に再接続を試みる
    };

    // 定期的に接続状態をチェック（5秒ごと）
    const checkInterval = setInterval(() => {
      updateConnectionState(es, Date.now());
    }, 5000);

    // クリーンアップ
    return () => {
      console.log('[SSE] Closing connection');
      clearInterval(checkInterval);
      es.close();
    };
  }, [updateConnectionState]);

  // lastMessageAtが更新されたら接続状態を再評価
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    updateConnectionState(eventSource, lastMessageAt);
  }, [eventSource, lastMessageAt, updateConnectionState]);

  return { eventSource, connectionState };
}
