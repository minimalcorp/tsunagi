import type { FastifyInstance } from 'fastify';
import type { Server as SocketIOServer } from 'socket.io';
import { prisma } from '../lib/db.js';
import { applyToolToTodos, parseTodos, TODO_TOOL_NAMES } from '../lib/tab-todos.js';

interface FastifyWithIO extends FastifyInstance {
  io: SocketIOServer;
}

// Claude CLIのhookイベント型
interface ClaudeHookBody {
  hook_event_name: string;
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  permission_mode?: string;
  // UserPromptSubmit
  prompt?: string;
  // PreToolUse / PostToolUse / PostToolUseFailure
  tool_name?: string;
  tool_use_id?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: Record<string, unknown>;
  // StopFailure
  error?: string;
  error_details?: string;
  // SessionEnd
  reason?: string;
}

// 受信したhookイベントをメモリに保持（確認用）
export interface HookEvent {
  receivedAt: string;
  event: string;
  sessionId?: string;
  raw: ClaudeHookBody;
}

export const hookEvents: HookEvent[] = [];

/**
 * status から未読フラグを導出する。
 * 完了(success/error)で未読を立て、再実行・セッション終了で落とす。
 * web 側 (apps/web/src/lib/claude-status.ts の unreadForStatus) と同じルール。
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

export async function hooksRoutes(fastify: FastifyInstance) {
  const io = (fastify as FastifyWithIO).io;

  // POST /hooks/claude - Claude CLIからのhook受信
  fastify.post<{ Body: ClaudeHookBody }>('/hooks/claude', async (request, reply) => {
    const body = request.body;
    const eventName = body.hook_event_name;
    const sessionId = body.session_id;

    fastify.log.info({ eventName, sessionId }, 'Claude hook received');

    // メモリに記録（確認用）
    hookEvents.push({
      receivedAt: new Date().toISOString(),
      event: eventName,
      sessionId,
      raw: body,
    });
    // 最新100件のみ保持
    if (hookEvents.length > 100) hookEvents.splice(0, hookEvents.length - 100);

    if (sessionId) {
      const room = `tab:${sessionId}`;

      switch (eventName) {
        case 'SessionStart':
          // claudeが起動しただけ（まだプロンプト処理していない）→ idleのまま通知のみ
          io.to(room).emit('status-changed', { sessionId, status: 'idle' });
          break;

        case 'UserPromptSubmit':
          // プロンプト送信開始 → running状態に更新
          await updateTabStatus(sessionId, 'running');
          io.to(room).emit('status-changed', { sessionId, status: 'running' });
          break;

        case 'PermissionRequest':
          // ツール実行許可待ち → waiting状態に更新
          await updateTabStatus(sessionId, 'waiting');
          io.to(room).emit('status-changed', { sessionId, status: 'waiting' });
          break;

        case 'PostToolUse': {
          // ツール実行完了（PermissionRequest後のAllow含む）→ runningに戻す
          // TodoWrite / Task 系ツールなら todos も更新する
          const toolName = body.tool_name;
          const todosUpdated =
            toolName !== undefined &&
            TODO_TOOL_NAMES.has(toolName) &&
            (await withTodosLock(sessionId, async () => {
              const todos = applyToolToTodos(
                await loadTabTodos(sessionId),
                toolName,
                body.tool_input,
                body.tool_response
              );
              if (!todos) {
                fastify.log.debug(
                  { sessionId, tool: toolName, input: body.tool_input },
                  '[hooks] todo tool ignored (unknown task or unexpected payload)'
                );
                return false;
              }
              const { count } = await updateTabStatus(sessionId, 'running', todos);
              fastify.log.info(
                { sessionId, tool: toolName, todosCount: todos.length, updatedTabCount: count },
                '[hooks] todos updated'
              );
              io.to(room).emit('todos-updated', { sessionId, todos });
              return true;
            }));
          if (!todosUpdated) {
            await updateTabStatus(sessionId, 'running');
          }
          io.to(room).emit('status-changed', { sessionId, status: 'running' });
          break;
        }

        case 'PreToolUse':
          // ログ記録のみ
          break;

        case 'Stop':
          // 正常完了 → success状態に更新
          await updateTabStatus(sessionId, 'success');
          io.to(room).emit('status-changed', { sessionId, status: 'success' });
          break;

        case 'StopFailure':
          // APIエラーでターン終了 → failure状態に更新
          // todos は残す（Claude 側の Task はセッションに永続化され、--resume 後も続きから使われる）
          await updateTabStatus(sessionId, 'error');
          io.to(room).emit('status-changed', { sessionId, status: 'failure' });
          break;

        case 'SessionEnd':
          // セッション終了（Escキー中断・Ctrl+C・/exit等）→ idle状態に更新（todos は StopFailure と同じ理由で残す）
          // reason: "prompt_input_exit" = ユーザー中断、"other" = プロセスkill等
          fastify.log.info({ sessionId, reason: body.reason }, 'SessionEnd received');
          await updateTabStatus(sessionId, 'idle');
          io.to(room).emit('status-changed', { sessionId, status: 'idle' });
          break;

        default:
          fastify.log.debug({ eventName }, 'Unhandled hook event');
      }
    }

    return reply.status(200).send({ ok: true });
  });

  // GET /hooks/events - 受信済みhookイベント一覧（確認用）
  fastify.get('/hooks/events', async () => {
    return { events: hookEvents };
  });
}
