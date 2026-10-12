import type { FastifyInstance } from 'fastify';
import type { Server as SocketIOServer } from 'socket.io';
import { prisma } from '../lib/db.js';
import { parseTodos } from '../lib/tab-todos.js';
import { getAgent, type NormalizedHookEvent } from '../lib/agents/index.js';

interface FastifyWithIO extends FastifyInstance {
  io: SocketIOServer;
}

// 受信したhookイベントをメモリに保持（確認用）
export interface HookEvent {
  receivedAt: string;
  agent: string;
  event?: string;
  tabId?: string;
  raw: Record<string, unknown>;
}

export const hookEvents: HookEvent[] = [];

/**
 * status から未読フラグを導出する。
 * 完了(success/error)で未読を立て、再実行・セッション終了で落とす。
 * web 側 (apps/web/src/lib/agent-status.ts の unreadForStatus) と同じルール。
 */
function unreadForStatus(status: string): boolean | undefined {
  switch (status) {
    case 'success':
    case 'error':
      return true;
    case 'running':
    case 'idle':
      return false;
    default:
      // waiting 等は未読状態を変えない
      return undefined;
  }
}

/**
 * セッションごとに todos の読み書きを直列化する。
 * TaskUpdate 等は並列実行されうるため、read-modify-write が重なると更新が失われる
 */
const todosQueues = new Map<string, Promise<unknown>>();

function withTodosLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  const prev = todosQueues.get(sessionId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  const settled = next.catch(() => undefined);
  todosQueues.set(sessionId, settled);
  void settled.then(() => {
    if (todosQueues.get(sessionId) === settled) todosQueues.delete(sessionId);
  });
  return next;
}

/** DB上のタブの todos を読む（タブが無ければ空） */
async function loadTabTodos(sessionId: string) {
  try {
    const tab = await prisma.tab.findFirst({
      where: { tabId: sessionId },
      select: { todos: true },
    });
    return parseTodos(tab?.todos);
  } catch (err) {
    console.warn(`[hooks] Failed to load tab todos from DB:`, err);
    return [];
  }
}

/** DBでタブのステータス（+ todos / 未読フラグ）を直接更新する */
async function updateTabStatus(
  sessionId: string,
  status: string,
  todos?: unknown[]
): Promise<{ count: number }> {
  try {
    const unread = unreadForStatus(status);
    const result = await prisma.tab.updateMany({
      where: { tabId: sessionId },
      data: {
        status,
        ...(todos !== undefined && { todos: JSON.stringify(todos) }),
        ...(unread !== undefined && { unread }),
      },
    });
    return { count: result.count };
  } catch (err) {
    console.warn(`[hooks] Failed to update tab status in DB:`, err);
    return { count: 0 };
  }
}

/** 正規化した hook イベントでタブの状態を更新し、購読中のクライアントに通知する */
async function applyHookEvent(
  fastify: FastifyInstance,
  io: SocketIOServer,
  event: NormalizedHookEvent
): Promise<void> {
  const { tabId } = event;
  const room = `tab:${tabId}`;
  const setStatus = async (status: string, emitted: string = status) => {
    await updateTabStatus(tabId, status);
    io.to(room).emit('status-changed', { sessionId: tabId, status: emitted });
  };

  switch (event.kind) {
    case 'session-start':
      // エージェントが起動しただけ（まだプロンプト処理していない）→ idleのまま通知のみ。
      // タブIDと別のセッションIDを振るエージェント（Codex）は、次回の resume 用に保存する
      if (event.agentSessionId) {
        await prisma.tab
          .updateMany({ where: { tabId }, data: { agentSessionId: event.agentSessionId } })
          .catch((err: unknown) =>
            fastify.log.warn(err, '[hooks] Failed to save agent session id')
          );
      }
      io.to(room).emit('status-changed', { sessionId: tabId, status: 'idle' });
      break;

    case 'prompt':
      // プロンプト送信開始 → running
      await setStatus('running');
      break;

    case 'permission':
      // ツール実行許可待ち → waiting
      await setStatus('waiting');
      break;

    case 'tool-post': {
      // ツール実行完了（許可待ち後のAllow含む）→ runningに戻す。todos を更新するツールなら todos も更新する
      const { applyTodos } = event;
      const todosUpdated =
        applyTodos !== undefined &&
        (await withTodosLock(tabId, async () => {
          const todos = applyTodos(await loadTabTodos(tabId));
          if (!todos) {
            fastify.log.debug(
              { tabId, tool: event.toolName },
              '[hooks] todo tool ignored (unknown task or unexpected payload)'
            );
            return false;
          }
          const { count } = await updateTabStatus(tabId, 'running', todos);
          fastify.log.info(
            { tabId, tool: event.toolName, todosCount: todos.length, updatedTabCount: count },
            '[hooks] todos updated'
          );
          io.to(room).emit('todos-updated', { sessionId: tabId, todos });
          return true;
        }));
      if (!todosUpdated) {
        await updateTabStatus(tabId, 'running');
      }
      io.to(room).emit('status-changed', { sessionId: tabId, status: 'running' });
      break;
    }

    case 'stop':
      // 正常完了 → success
      await setStatus('success');
      break;

    case 'stop-failure':
      // APIエラーでターン終了 → error
      // todos は残す（エージェント側の進捗はセッションに永続化され、resume 後も続きから使われる）
      await setStatus('error', 'failure');
      break;

    case 'interrupt':
    case 'session-end':
      // 中断・セッション終了 → idle（todos は stop-failure と同じ理由で残す）
      await setStatus('idle');
      break;
  }
}

export async function hooksRoutes(fastify: FastifyInstance) {
  const io = (fastify as FastifyWithIO).io;

  // POST /hooks/:agent - エージェント CLI からの hook 受信
  fastify.post<{ Params: { agent: string }; Body: Record<string, unknown> }>(
    '/hooks/:agent',
    async (request, reply) => {
      const adapter = getAgent(request.params.agent);
      if (!adapter) return reply.status(404).send({ error: 'Unknown agent' });

      const body = request.body ?? {};
      const event = adapter.normalizeHook({ body, headers: request.headers });
      const eventName = typeof body.hook_event_name === 'string' ? body.hook_event_name : undefined;
      fastify.log.info(
        { agent: adapter.id, eventName, tabId: event?.tabId },
        'Agent hook received'
      );

      // メモリに記録（確認用）
      hookEvents.push({
        receivedAt: new Date().toISOString(),
        agent: adapter.id,
        event: eventName,
        tabId: event?.tabId,
        raw: body,
      });
      // 最新100件のみ保持
      if (hookEvents.length > 100) hookEvents.splice(0, hookEvents.length - 100);

      if (event) {
        await applyHookEvent(fastify, io, event);
      } else {
        fastify.log.debug({ agent: adapter.id, eventName }, 'Unhandled hook event');
      }
      return reply.status(200).send({ ok: true });
    }
  );

  // GET /hooks/events - 受信済みhookイベント一覧（確認用）
  fastify.get('/hooks/events', async () => {
    return { events: hookEvents };
  });
}
