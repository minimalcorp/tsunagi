import type { FastifyInstance } from 'fastify';
import { findRestartBlockers, getAutoUpdateStatus } from '../lib/auto-update.js';
import { requestRestart } from '../lib/restart.js';
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

  // POST /version/restart - インストール済みの新しいバージョンを再起動で適用する。
  // 実行中（running / waiting）のタスクがあれば止まってしまうため 409 で拒否する
  fastify.post('/version/restart', async (_request, reply) => {
    if (getAutoUpdateStatus().state !== 'ready') {
      return reply.status(400).send({ error: 'No update is ready to apply' });
    }
    const blockers = await findRestartBlockers();
    if (blockers.length > 0) {
      return reply.status(409).send({ error: 'Tasks are running', data: { blockers } });
    }
    // 応答を返してから終了処理に入る
    reply.raw.once('finish', requestRestart);
    return reply.status(202).send({ data: getUpdateStatus() });
  });
}
