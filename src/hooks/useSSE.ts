import { useEffect, useState } from 'react';

export function useSSE() {
  const [eventSource, setEventSource] = useState<EventSource | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const es = new EventSource('/api/events');

    es.addEventListener('connected', () => {
      console.log('[SSE] Connected');
      setIsConnected(true);
    });

    es.onerror = () => {
      console.log('[SSE] Disconnected');
      setIsConnected(false);
      // ブラウザが自動的に再接続を試みる
    };

    // EventSourceをstateに設定
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEventSource(es);

    return () => {
      console.log('[SSE] Closing connection');
      es.close();
    };
  }, []);

  return { eventSource, isConnected };
}
