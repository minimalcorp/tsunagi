import { v4 as uuid } from 'uuid';
import { query, type Query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

/**
 * キューに追加されるメッセージ
 */
export interface QueuedMessage {
  id: string;
  content: string;
  timestamp: number;
}

/**
 * タブごとのメッセージキュー
 */
interface TabMessageQueue {
  messages: QueuedMessage[];
  resolver?: (message: QueuedMessage | null) => void;
}

/**
 * セッション情報
 */
interface SessionInfo {
  generator: AsyncGenerator<SDKUserMessage, void, unknown>;
  queryPromise: Promise<void>;
  queryObject?: Query;
}

/**
 * Message Queue Manager
 * タブごとにメッセージキューを管理し、Streaming Input ModeでClaude Agent SDKを実行
 */
class MessageQueueManager {
  private queues = new Map<string, TabMessageQueue>();
  private sessionIds = new Map<string, string>();
  private sessions = new Map<string, SessionInfo>();

  /**
   * メッセージをキューに追加
   */
  async enqueueMessage(tabId: string, message: string): Promise<void> {
    const queuedMsg: QueuedMessage = {
      id: uuid(),
      content: message,
      timestamp: Date.now(),
    };

    // キューを取得または作成
    let queue = this.queues.get(tabId);
    if (!queue) {
      queue = { messages: [] };
      this.queues.set(tabId, queue);
    }

    // メッセージをキューに追加
    queue.messages.push(queuedMsg);

    // 待機中のresolverがあれば即座に通知
    if (queue.resolver) {
      const resolver = queue.resolver;
      queue.resolver = undefined;
      resolver(queuedMsg);
    }
  }

  /**
   * AsyncGeneratorを作成（メッセージキューからyield）
   */
  private async *createMessageGenerator(
    tabId: string
  ): AsyncGenerator<SDKUserMessage, void, unknown> {
    while (true) {
      const queue = this.queues.get(tabId);

      if (queue && queue.messages.length > 0) {
        // キューにメッセージがある場合
        const message = queue.messages.shift()!;
        yield {
          type: 'user' as const,
          message: {
            role: 'user' as const,
            content: message.content,
          },
          parent_tool_use_id: null,
          session_id: '',
        };
      } else {
        // キューが空の場合はPromiseで待機
        const message = await new Promise<QueuedMessage | null>((resolve) => {
          const queue = this.queues.get(tabId);
          if (queue) {
            queue.resolver = resolve;
          } else {
            // キューが削除されている場合は終了
            resolve(null);
          }
        });

        if (message === null) {
          // 終了シグナル
          break;
        }

        yield {
          type: 'user' as const,
          message: {
            role: 'user' as const,
            content: message.content,
          },
          parent_tool_use_id: null,
          session_id: '',
        };
      }
    }
  }

  /**
   * セッションを開始
   */
  async startSession(
    tabId: string,
    options: {
      cwd: string;
      env?: Record<string, string>;
      resumeSessionId?: string;
      permissionMode?: 'bypassPermissions';
      allowDangerouslySkipPermissions?: boolean;
      bypassPermissions?: boolean;
      settingSources?: Array<'user' | 'project' | 'local'>;
    },
    callbacks: {
      onRawMessage?: (message: unknown) => void;
      onStatusChange?: (status: 'running' | 'success' | 'error') => void;
      onAgentSessionId?: (sessionId: string) => void;
    }
  ): Promise<void> {
    // 既にセッション実行中の場合はスキップ
    if (this.sessions.has(tabId)) {
      console.log('[MessageQueueManager] Session already running:', { tabId });
      return;
    }

    const generator = this.createMessageGenerator(tabId);

    const queryOptions = {
      cwd: options.cwd,
      env: options.env,
      permissionMode: options.permissionMode,
      allowDangerouslySkipPermissions: options.allowDangerouslySkipPermissions,
      bypassPermissions: options.bypassPermissions,
      settingSources: options.settingSources,
      ...(options.resumeSessionId && { resume: options.resumeSessionId }),
    };

    callbacks.onStatusChange?.('running');

    // query()を開始
    const queryResult = query({
      prompt: generator,
      options: queryOptions,
    });

    // セッション情報を保存
    const queryPromise = (async () => {
      try {
        for await (const message of queryResult) {
          // Raw messageコールバック
          callbacks.onRawMessage?.(message);

          // system initメッセージからsession_idを取得
          if (message.type === 'system' && message.subtype === 'init' && message.session_id) {
            this.sessionIds.set(tabId, message.session_id);
            callbacks.onAgentSessionId?.(message.session_id);
          }

          // result メッセージでステータス更新
          if (message.type === 'result') {
            if (message.subtype === 'success') {
              callbacks.onStatusChange?.('success');
            } else {
              callbacks.onStatusChange?.('error');
            }
            // result success後もgeneratorは継続（次のメッセージを待機）
          }
        }
      } catch (error) {
        console.error('[MessageQueueManager] Query error:', error);

        // AbortErrorは意図的な中断
        if (
          error instanceof Error &&
          (error.name === 'AbortError' || error.message.includes('was aborted'))
        ) {
          return;
        }

        callbacks.onStatusChange?.('error');
        throw error;
      } finally {
        // クリーンアップ
        this.sessions.delete(tabId);
      }
    })();

    this.sessions.set(tabId, {
      generator,
      queryPromise,
      queryObject: queryResult,
    });

    // 非同期で実行（awaitしない）
    queryPromise.catch((error) => {
      console.error('[MessageQueueManager] Session error:', { tabId, error });
    });
  }

  /**
   * セッションを終了
   */
  async endSession(tabId: string): Promise<void> {
    const queue = this.queues.get(tabId);
    if (queue?.resolver) {
      // 終了シグナルを送る
      queue.resolver(null);
      queue.resolver = undefined;
    }

    // キューをクリア
    this.queues.delete(tabId);
    this.sessionIds.delete(tabId);

    // セッション情報をクリーンアップ
    const session = this.sessions.get(tabId);
    if (session) {
      // generatorは自動的に終了する
      this.sessions.delete(tabId);
    }
  }

  /**
   * セッションを中断
   */
  async interruptSession(tabId: string): Promise<void> {
    const session = this.sessions.get(tabId);
    if (session?.queryObject) {
      await session.queryObject.interrupt();
    }

    // キューをクリア
    const queue = this.queues.get(tabId);
    if (queue) {
      queue.messages = [];
    }
  }

  /**
   * セッションIDを取得
   */
  getSessionId(tabId: string): string | undefined {
    return this.sessionIds.get(tabId);
  }

  /**
   * セッションが実行中かチェック
   */
  isSessionRunning(tabId: string): boolean {
    return this.sessions.has(tabId);
  }

  /**
   * キューの状態を取得（デバッグ用）
   */
  getQueueStatus(tabId: string): { queueLength: number; hasResolver: boolean; isRunning: boolean } {
    const queue = this.queues.get(tabId);
    return {
      queueLength: queue?.messages.length ?? 0,
      hasResolver: !!queue?.resolver,
      isRunning: this.isSessionRunning(tabId),
    };
  }
}

// シングルトンインスタンス
export const messageQueueManager = new MessageQueueManager();
