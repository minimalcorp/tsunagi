import { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { getLlmServerStatus, startLlmServer, stopLlmServer } from '../lib/llm-process.js';

// ユーザーが依存関係(pipパッケージ)をセットアップ済みのローカル常駐サーバー
// (apps/llm-server, 実体は mlx_lm.server)を指す。依存関係のインストール自体は
// tsunagi側では行わず、プロセスの起動・停止のみ管理する。
const LLM_SERVER_URL = process.env.TSUNAGI_LLM_SERVER_URL || 'http://127.0.0.1:8766';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function llmRoutes(fastify: FastifyInstance) {
  // GET /llm/server/status
  fastify.get('/llm/server/status', async (_request, reply) => {
    return reply.status(200).send(await getLlmServerStatus());
  });

  // POST /llm/server/start
  fastify.post('/llm/server/start', async (_request, reply) => {
    const result = startLlmServer();
    if (!result.started) {
      return reply.status(409).send({ error: result.error });
    }
    return reply.status(202).send(await getLlmServerStatus());
  });

  // POST /llm/server/stop
  fastify.post('/llm/server/stop', async (_request, reply) => {
    const result = stopLlmServer();
    if (!result.stopped) {
      return reply.status(409).send({ error: result.error });
    }
    return reply.status(200).send(await getLlmServerStatus());
  });

  // POST /llm/chat
  // mlx_lm.server の OpenAI互換 /v1/chat/completions (SSEストリーミング) を
  // そのままクライアントへ中継する。
  fastify.post('/llm/chat', async (request, reply) => {
    const body = request.body as { messages?: ChatMessage[] };
    if (!body?.messages?.length) {
      return reply.status(400).send({ error: 'messages is required' });
    }

    let upstream: Response;
    try {
      upstream = await fetch(`${LLM_SERVER_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: body.messages, stream: true }),
      });
    } catch (error) {
      fastify.log.error(error, 'LLM chat request error');
      return reply.status(502).send({
        error: error instanceof Error ? error.message : 'Is apps/llm-server running?',
      });
    }

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => '');
      return reply
        .status(502)
        .send({ error: `llm-server responded with ${upstream.status}: ${text}` });
    }

    // Fastifyの自動シリアライズを止め、SSEチャンクを到着次第そのまま転送する。
    reply.hijack();
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });

    const nodeStream = Readable.fromWeb(upstream.body);
    nodeStream.pipe(reply.raw);
    request.raw.on('close', () => {
      nodeStream.destroy();
    });
  });
}
