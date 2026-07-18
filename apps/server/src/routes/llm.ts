import { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import {
  getLlmServerStatus,
  getLlmServerUrl,
  startLlmServer,
  stopLlmServer,
  type LlmProfile,
} from '../lib/llm-process.js';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function parseProfile(value: unknown): LlmProfile | null {
  return value === 'instruct' || value === 'thinking' ? value : null;
}

export async function llmRoutes(fastify: FastifyInstance) {
  // GET /llm/server/:profile/status
  fastify.get<{ Params: { profile: string } }>(
    '/llm/server/:profile/status',
    async (request, reply) => {
      const profile = parseProfile(request.params.profile);
      if (!profile) return reply.status(400).send({ error: 'invalid profile' });
      return reply.status(200).send(await getLlmServerStatus(profile));
    }
  );

  // POST /llm/server/:profile/start
  fastify.post<{ Params: { profile: string } }>(
    '/llm/server/:profile/start',
    async (request, reply) => {
      const profile = parseProfile(request.params.profile);
      if (!profile) return reply.status(400).send({ error: 'invalid profile' });
      const result = startLlmServer(profile);
      if (!result.started) {
        return reply.status(409).send({ error: result.error });
      }
      return reply.status(202).send(await getLlmServerStatus(profile));
    }
  );

  // POST /llm/server/:profile/stop
  fastify.post<{ Params: { profile: string } }>(
    '/llm/server/:profile/stop',
    async (request, reply) => {
      const profile = parseProfile(request.params.profile);
      if (!profile) return reply.status(400).send({ error: 'invalid profile' });
      const result = await stopLlmServer(profile);
      if (!result.stopped) {
        return reply.status(409).send({ error: result.error });
      }
      return reply.status(200).send(await getLlmServerStatus(profile));
    }
  );

  // POST /llm/chat
  // mlx_lm.server の OpenAI互換 /v1/chat/completions (SSEストリーミング) を
  // そのままクライアントへ中継する。profileでinstruct/thinkingどちらのサーバーに
  // 転送するかを切り替える(省略時はinstruct)。
  fastify.post('/llm/chat', async (request, reply) => {
    const body = request.body as {
      messages?: ChatMessage[];
      profile?: string;
      max_tokens?: number;
    };
    const profile = parseProfile(body?.profile) ?? 'instruct';
    if (!body?.messages?.length) {
      return reply.status(400).send({ error: 'messages is required' });
    }

    // クライアント(ブラウザ)が切断・中断した場合にupstreamへのfetchも道連れで
    // アボートする。シンキングモードは生成が長時間に及ぶことがあるため、
    // ユーザーが送信を取り消した際にmlx_lm.server側の生成も止められるようにする。
    // 注意: request.raw(受信側)の'close'はリクエストボディを読み終えた直後にも
    // 発火してしまい、送信直後に誤ってabortされる。クライアントへのレスポンス
    // 接続が切れたことを表す reply.raw(送信側)を監視する必要がある。
    const upstreamAbort = new AbortController();
    reply.raw.on('close', () => upstreamAbort.abort());

    let upstream: Response;
    try {
      upstream = await fetch(`${getLlmServerUrl(profile)}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // max_tokensを省略するとmlx_lm.serverのデフォルト(512)が使われる。
        // シンキングモードは回答本文に到達する前に思考過程だけで数千トークン
        // 消費することがあるため、クライアント側で十分大きい値を明示させる。
        body: JSON.stringify({
          messages: body.messages,
          stream: true,
          ...(body.max_tokens ? { max_tokens: body.max_tokens } : {}),
        }),
        signal: upstreamAbort.signal,
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
  });
}
