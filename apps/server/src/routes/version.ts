import type { FastifyInstance } from 'fastify';
import { checkForUpdateNow, getUpdateStatus } from '../lib/update-check.js';

export async function versionRoutes(fastify: FastifyInstance) {
  // GET /version - 実行中のバージョンと npm の最新バージョン
  fastify.get('/version', async (_request, reply) => {
    return reply.status(200).send({ data: getUpdateStatus() });
  });

  // POST /version/check - npm の最新バージョンを今すぐ確認する
  fastify.post('/version/check', async (_request, reply) => {
    if (!getUpdateStatus().current) {
      return reply.status(400).send({ error: 'Version is unknown (dev build)' });
    }
    const ok = await checkForUpdateNow();
    if (!ok) {
      return reply.status(502).send({ error: 'Failed to reach npm registry' });
    }
    return reply.status(200).send({ data: getUpdateStatus() });
  });
}
