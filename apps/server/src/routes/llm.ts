import type { FastifyInstance } from 'fastify';
import { getLlmServerStatus, startLlmServer, stopLlmServer } from '../lib/llm-process.js';

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
}
