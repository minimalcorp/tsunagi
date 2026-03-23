import type { FastifyInstance } from 'fastify';

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

export async function hooksRoutes(fastify: FastifyInstance) {
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

    return reply.status(200).send({ ok: true });
  });

  // GET /hooks/events - 受信済みhookイベント一覧（確認用）
  fastify.get('/hooks/events', async () => {
    return { events: hookEvents };
  });
}
