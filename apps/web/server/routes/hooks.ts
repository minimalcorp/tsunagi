import type { FastifyInstance } from 'fastify';
import type { Server as SocketIOServer } from 'socket.io';

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

/** セッションごとのタスクリスト（TaskCreate/TaskUpdateから組み立て） */
interface TaskEntry {
  id: string;
  subject: string;
  status: 'pending' | 'in_progress' | 'completed';
}

const sessionTasks = new Map<string, Map<string, TaskEntry>>();

/** TaskEntryリストをTodo形式に変換 */
function tasksToTodos(tasks: Map<string, TaskEntry>) {
  return Array.from(tasks.values()).map((t) => ({
    content: t.subject,
    status: t.status === 'in_progress' ? ('in_progress' as const) : t.status,
  }));
}

/** Next.js内部APIでタブのステータス（+ todos）をDB更新する */
async function updateTabStatus(
  sessionId: string,
  status: string,
  todos?: unknown[]
): Promise<void> {
  try {
    const response = await fetch(`http://localhost:2791/api/internal/tabs/${sessionId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, ...(todos !== undefined && { todos }) }),
    });
    if (!response.ok) {
      console.warn(`[hooks] Failed to update tab status: ${response.status}`);
    }
  } catch (err) {
    console.warn(`[hooks] Failed to reach Next.js API for status update:`, err);
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
          let todosUpdated = false;

          if (body.tool_name === 'TodoWrite' && body.tool_input) {
            const todos = body.tool_input.todos as Array<{
              content: string;
              status: 'pending' | 'in_progress' | 'completed';
            }>;
            if (Array.isArray(todos)) {
              await updateTabStatus(sessionId, 'running', todos);
              io.to(room).emit('todos-updated', { sessionId, todos });
              todosUpdated = true;
            }
          }

          // TaskCreate: タスクリストに追加
          if (body.tool_name === 'TaskCreate' && body.tool_response) {
            const task = body.tool_response.task as { id: string; subject: string } | undefined;
            if (task?.id) {
              if (!sessionTasks.has(sessionId)) {
                sessionTasks.set(sessionId, new Map());
              }
              sessionTasks.get(sessionId)!.set(task.id, {
                id: task.id,
                subject: task.subject,
                status: 'pending',
              });
              const todos = tasksToTodos(sessionTasks.get(sessionId)!);
              await updateTabStatus(sessionId, 'running', todos);
              io.to(room).emit('todos-updated', { sessionId, todos });
              todosUpdated = true;
            }
          }

          // TaskUpdate: タスクのステータスを更新
          if (body.tool_name === 'TaskUpdate' && body.tool_response && body.tool_input) {
            const taskId = body.tool_input.taskId as string | undefined;
            const statusChange = body.tool_response.statusChange as { to: string } | undefined;
            const tasks = sessionTasks.get(sessionId);
            if (tasks && taskId && statusChange?.to) {
              const entry = tasks.get(taskId);
              if (entry) {
                entry.status = statusChange.to as TaskEntry['status'];
                const todos = tasksToTodos(tasks);
                await updateTabStatus(sessionId, 'running', todos);
                io.to(room).emit('todos-updated', { sessionId, todos });
                todosUpdated = true;
              }
            }
          }

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
          await updateTabStatus(sessionId, 'error');
          io.to(room).emit('status-changed', { sessionId, status: 'failure' });
          break;

        case 'SessionEnd':
          // セッション終了（Escキー中断・Ctrl+C・/exit等）→ idle状態に更新
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

  // POST /internal/emit-status - Socket.IO status-changed を発火（Next.jsから呼び出し用）
  fastify.post<{ Body: { sessionId: string; status: string } }>(
    '/internal/emit-status',
    async (request, reply) => {
      const { sessionId, status } = request.body;
      if (!sessionId || !status) {
        return reply.status(400).send({ error: 'sessionId and status are required' });
      }
      const room = `tab:${sessionId}`;
      io.to(room).emit('status-changed', { sessionId, status });
      return reply.status(200).send({ ok: true });
    }
  );
}
