import type { FastifyInstance } from 'fastify';
import { getUpdateStatus } from '../lib/update-check.js';

export async function versionRoutes(fastify: FastifyInstance) {
  // GET /version - 実行中のバージョンと npm の最新バージョン
  fastify.get('/version', async (_request, reply) => {
    return reply.status(200).send({ data: getUpdateStatus() });
  });
}
