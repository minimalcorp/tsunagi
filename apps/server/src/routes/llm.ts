import type { FastifyInstance } from 'fastify';
import { getLlmServerStatus, startLlmServer, stopLlmServer } from '../lib/llm-process.js';
import {
  getInferenceServiceConfig,
  setInferenceServiceConfig,
  validateInferenceServiceConfigBody,
} from '../lib/inference-config.js';

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
    const result = await stopLlmServer();
    if (!result.stopped) {
      return reply.status(409).send({ error: result.error });
    }
    return reply.status(200).send(await getLlmServerStatus());
  });

  // POST /llm/server/config
  fastify.post('/llm/server/config', async (request, reply) => {
    const result = validateInferenceServiceConfigBody(request.body);
    if ('error' in result) {
      return reply.status(400).send({ error: result.error });
    }

    const previousMode = getInferenceServiceConfig('llm').mode;
    setInferenceServiceConfig('llm', result.config);
    // ローカル→リモート切替時は、動いているローカルサーバーを止める。URL解決は
    // 既にリモートを向いているため、停止処理の完了を待たずレスポンスを返してよい。
    if (previousMode === 'local' && result.config.mode === 'remote') {
      void stopLlmServer();
    }

    return reply.status(200).send(await getLlmServerStatus());
  });
}
