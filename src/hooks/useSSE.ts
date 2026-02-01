import { useSyncExternalStore } from 'react';

export type ConnectionState = 'connected' | 'connecting' | 'disconnected';

const STALE_TIMEOUT = 60000; // 60秒

// シングルトンのSSE接続管理
class SSEConnectionManager {
  private static instance: SSEConnectionManager;
  private eventSource: EventSource | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private lastMessageAt: number = 0;
  private refCount: number = 0;
  private checkInterval: NodeJS.Timeout | null = null;
  private listeners: Set<() => void> = new Set();
  private cachedSnapshot: { eventSource: EventSource | null; connectionState: ConnectionState } = {
    eventSource: null,
    connectionState: 'disconnected',
  };

  private constructor() {}

  static getInstance(): SSEConnectionManager {
    if (!SSEConnectionManager.instance) {
      SSEConnectionManager.instance = new SSEConnectionManager();
    }
    return SSEConnectionManager.instance;
  }

  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    this.refCount++;

    // 初回のsubscribe時にEventSourceを作成（非同期で実行）
    if (this.refCount === 1) {
      // subscribe中に状態変更を通知しないよう、非同期で接続
      setTimeout(() => this.connect(), 0);
    }

    return () => {
      this.listeners.delete(callback);
      this.refCount--;

      // すべてのsubscriberが削除されたら接続を切断
      if (this.refCount === 0) {
        this.disconnect();
      }
    };
  }

  private connect(): void {
    if (this.eventSource) return;

    console.log('[SSE] Creating singleton EventSource connection');
    const es = new EventSource('/api/events');
    this.eventSource = es;

    // EventSourceが作成された時点でスナップショットを更新
    this.updateCachedSnapshot();

    // 初期接続時刻を設定
    this.lastMessageAt = Date.now();

    // メッセージ受信時刻を更新するハンドラー
    const updateLastMessage = () => {
      this.lastMessageAt = Date.now();
      this.updateConnectionState();
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
      this.updateConnectionState();
      // ブラウザが自動的に再接続を試みる
    };

    // 定期的に接続状態をチェック（5秒ごと）
    this.checkInterval = setInterval(() => {
      this.updateConnectionState();
    }, 5000);

    // 初回の状態更新は非同期で実行（subscribe中の通知を避ける）
    setTimeout(() => this.updateConnectionState(), 0);
  }

  private disconnect(): void {
    if (!this.eventSource) return;

    console.log('[SSE] Closing singleton connection');
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.eventSource.close();
    this.eventSource = null;
    this.connectionState = 'disconnected';
    this.updateCachedSnapshot();
    this.notifyListeners();
  }

  private updateConnectionState(): void {
    if (!this.eventSource) {
      this.connectionState = 'disconnected';
      this.updateCachedSnapshot();
      this.notifyListeners();
      return;
    }

    const now = Date.now();
    const isStale = now - this.lastMessageAt > STALE_TIMEOUT;

    let newState: ConnectionState;
    switch (this.eventSource.readyState) {
      case EventSource.CONNECTING:
        newState = 'connecting';
        break;
      case EventSource.OPEN:
        newState = isStale ? 'disconnected' : 'connected';
        break;
      case EventSource.CLOSED:
        newState = 'disconnected';
        break;
      default:
        newState = 'disconnected';
    }

    if (this.connectionState !== newState) {
      this.connectionState = newState;
      this.updateCachedSnapshot();
      this.notifyListeners();
    }
  }

  private updateCachedSnapshot(): void {
    // 状態が実際に変わった場合のみ新しいオブジェクトを作成
    if (
      this.cachedSnapshot.eventSource !== this.eventSource ||
      this.cachedSnapshot.connectionState !== this.connectionState
    ) {
      this.cachedSnapshot = {
        eventSource: this.eventSource,
        connectionState: this.connectionState,
      };
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach((callback) => callback());
  }

  getSnapshot(): { eventSource: EventSource | null; connectionState: ConnectionState } {
    return this.cachedSnapshot;
  }
}

const manager = SSEConnectionManager.getInstance();

export function useSSE() {
  // useSyncExternalStoreを使ってシングルトンの状態を購読
  const snapshot = useSyncExternalStore(
    (callback) => manager.subscribe(callback),
    () => manager.getSnapshot(),
    () => manager.getSnapshot()
  );

  return snapshot;
}
