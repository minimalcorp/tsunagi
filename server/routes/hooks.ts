import type { FastifyInstance } from 'fastify';
import type { Server as SocketIOServer } from 'socket.io';
import { todoStore } from '../todo-store.js';

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
}

// 受信したhookイベントをメモリに保持（確認用）
export interface HookEvent {
  receivedAt: string;
  event: string;
  sessionId?: string;
  raw: ClaudeHookBody;
}

export const hookEvents: HookEvent[] = [];

/** Next.js内部APIでタブのステータスをDB更新する */
async function updateTabStatus(sessionId: string, status: string): Promise<void> {
  try {
    const response = await fetch(`http://localhost:2791/api/internal/tabs/${sessionId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
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
          // running状態に更新
          await updateTabStatus(sessionId, 'running');
          io.to(room).emit('status-changed', { sessionId, status: 'running' });
          break;

        case 'UserPromptSubmit':
          // running状態に更新（冪等）
          await updateTabStatus(sessionId, 'running');
          io.to(room).emit('status-changed', { sessionId, status: 'running' });
          break;

        case 'PreToolUse':
          // ログ記録のみ
          break;

        case 'PostToolUse':
          // TodoWriteツールの場合はtodosを更新
          if (body.tool_name === 'TodoWrite' && body.tool_input) {
            const todos = body.tool_input.todos as Array<{
              content: string;
              status: 'pending' | 'in_progress' | 'completed';
            }>;
            if (Array.isArray(todos)) {
              todoStore.set(sessionId, todos);
              io.to(room).emit('todos-updated', { sessionId, todos });
            }
          }
          break;

        case 'Stop':
          // idle状態に更新
          await updateTabStatus(sessionId, 'idle');
          io.to(room).emit('status-changed', { sessionId, status: 'idle' });
          break;

        case 'StopFailure':
          // error状態に更新
          await updateTabStatus(sessionId, 'error');
          io.to(room).emit('status-changed', { sessionId, status: 'error' });
          break;

        default:
          fastify.log.debug({ eventName }, 'Unknown hook event');
      }
    }

    return reply.status(200).send({ ok: true });
  });

  // GET /hooks/events - 受信済みhookイベント一覧（確認用）
  fastify.get('/hooks/events', async () => {
    return { events: hookEvents };
  });
}
