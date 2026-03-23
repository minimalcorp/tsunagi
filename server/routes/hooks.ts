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
          io.to(room).emit('status-changed', { sessionId, status: 'waiting' });
          break;

        case 'PostToolUse':
          // ツール実行完了（PermissionRequest後のAllow含む）→ runningに戻す
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
          io.to(room).emit('status-changed', { sessionId, status: 'running' });
          break;

        case 'PreToolUse':
          // ログ記録のみ
          break;

        case 'Stop':
          // 正常完了 → success状態に更新
          await updateTabStatus(sessionId, 'idle');
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
