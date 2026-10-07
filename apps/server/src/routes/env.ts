import type { FastifyInstance } from 'fastify';
import * as envRepo from '../lib/repositories/environment.js';
import { RESERVED_ENV_KEYS } from '../lib/claude-profiles.js';
import { notifyEnvChanged } from '../lib/pty-env-sync.js';

const RESERVED_KEY_ERROR = 'Claude の認証は Settings の Claude Profile で設定してください';

/** 変更後、起動中のターミナルに反映する（失敗しても API 自体は成功扱い） */
function syncPtyEnv(fastify: FastifyInstance): void {
  notifyEnvChanged().catch((err: unknown) => fastify.log.warn(err, 'Failed to sync PTY env'));
}

interface EnvBody {
  key: string;
  value: string;
  scope: 'global' | 'owner' | 'repo';
  owner?: string;
  repo?: string;
}

interface ToggleBody {
  key: string;
  scope: 'global' | 'owner' | 'repo';
  enabled: boolean;
  owner?: string;
  repo?: string;
}

export async function envRoutes(fastify: FastifyInstance) {
  // GET /env
  fastify.get<{
    Querystring: { scope?: string; owner?: string; repo?: string };
  }>('/env', async (request, reply) => {
    try {
      const { owner, repo } = request.query;
      const scope = (request.query.scope as 'global' | 'owner' | 'repo') || 'global';

      if (scope === 'owner' && !owner) {
        return reply.status(400).send({
          error: 'Missing required query parameter: owner for scope=owner',
        });
      }

      if (scope === 'repo' && (!owner || !repo)) {
        return reply.status(400).send({
          error: 'Missing required query parameters: owner, repo for scope=repo',
        });
      }

      const env = await envRepo.getEnv(scope, owner || undefined, repo || undefined);
      return reply.status(200).send({ data: { env } });
    } catch (error) {
      fastify.log.error(error, 'GET /env error');
      return reply.status(500).send({ error: 'Failed to fetch environment variables' });
    }
  });

  // POST /env
  fastify.post<{ Body: EnvBody }>('/env', async (request, reply) => {
    try {
      const { key, value, scope, owner, repo } = request.body;

      if (!key || !value || !scope) {
        return reply.status(400).send({ error: 'Missing required fields: key, value, scope' });
      }

      if (RESERVED_ENV_KEYS.includes(key)) {
        return reply.status(400).send({ error: RESERVED_KEY_ERROR });
      }

      if (scope === 'owner' && !owner) {
        return reply.status(400).send({ error: 'Missing required field: owner for scope=owner' });
      }

      if (scope === 'repo' && (!owner || !repo)) {
        return reply.status(400).send({
          error: 'Missing required fields: owner, repo for scope=repo',
        });
      }

      await envRepo.setEnv(key, value, scope, owner, repo);
      syncPtyEnv(fastify);
      return reply.status(201).send({ data: { success: true } });
    } catch (error) {
      fastify.log.error(error, 'POST /env error');
      return reply.status(500).send({ error: 'Failed to set environment variable' });
    }
  });

  // PUT /env
  fastify.put<{ Body: EnvBody }>('/env', async (request, reply) => {
    try {
      const { key, value, scope, owner, repo } = request.body;

      if (!key || !value || !scope) {
        return reply.status(400).send({ error: 'Missing required fields: key, value, scope' });
      }

      if (RESERVED_ENV_KEYS.includes(key)) {
        return reply.status(400).send({ error: RESERVED_KEY_ERROR });
      }

      if (scope === 'owner' && !owner) {
        return reply.status(400).send({ error: 'Missing required field: owner for scope=owner' });
      }

      if (scope === 'repo' && (!owner || !repo)) {
        return reply.status(400).send({
          error: 'Missing required fields: owner, repo for scope=repo',
        });
      }

      await envRepo.setEnv(key, value, scope, owner, repo);
      syncPtyEnv(fastify);
      return reply.status(200).send({ data: { success: true } });
    } catch (error) {
      fastify.log.error(error, 'PUT /env error');
      return reply.status(500).send({ error: 'Failed to update environment variable' });
    }
  });

  // DELETE /env
  fastify.delete<{
    Querystring: { key?: string; scope?: string; owner?: string; repo?: string };
  }>('/env', async (request, reply) => {
    try {
      const { owner, repo } = request.query;
      const key = request.query.key;
      const scope = request.query.scope as 'global' | 'owner' | 'repo' | undefined;

      if (!key || !scope) {
        return reply.status(400).send({
          error: 'Missing required query parameters: key, scope',
        });
      }

      if (RESERVED_ENV_KEYS.includes(key)) {
        return reply.status(400).send({ error: RESERVED_KEY_ERROR });
      }

      if (scope === 'owner' && !owner) {
        return reply.status(400).send({
          error: 'Missing required query parameter: owner for scope=owner',
        });
      }

      if (scope === 'repo' && (!owner || !repo)) {
        return reply.status(400).send({
          error: 'Missing required query parameters: owner, repo for scope=repo',
        });
      }

      const success = await envRepo.deleteEnv(key, scope, owner || undefined, repo || undefined);

      if (!success) {
        return reply.status(404).send({ error: 'Environment variable not found' });
      }
      syncPtyEnv(fastify);

      return reply.status(200).send({ data: { success: true } });
    } catch (error) {
      fastify.log.error(error, 'DELETE /env error');
      return reply.status(500).send({ error: 'Failed to delete environment variable' });
    }
  });

  // GET /env/list
  fastify.get<{
    Querystring: { scope?: string; owner?: string; repo?: string };
  }>('/env/list', async (request, reply) => {
    try {
      const { owner, repo } = request.query;
      const scope = (request.query.scope as 'global' | 'owner' | 'repo') || 'global';

      if (scope === 'owner' && !owner) {
        return reply.status(400).send({
          error: 'Missing required query parameter: owner for scope=owner',
        });
      }

      if (scope === 'repo' && (!owner || !repo)) {
        return reply.status(400).send({
          error: 'Missing required query parameters: owner, repo for scope=repo',
        });
      }

      // 予約キー（Claude プロファイルの割り当て）は専用 UI で扱うため一覧に含めない
      const envVars = (
        await envRepo.getAllEnv(scope, owner || undefined, repo || undefined)
      ).filter((env) => !RESERVED_ENV_KEYS.includes(env.key));
      return reply.status(200).send({ data: { envVars } });
    } catch (error) {
      fastify.log.error(error, 'GET /env/list error');
      return reply.status(500).send({ error: 'Failed to fetch environment variables' });
    }
  });

  // PATCH /env/toggle
  fastify.patch<{ Body: ToggleBody }>('/env/toggle', async (request, reply) => {
    try {
      const { key, scope, enabled, owner, repo } = request.body;

      if (!key || !scope || typeof enabled !== 'boolean') {
        return reply.status(400).send({ error: 'key, scope, and enabled are required' });
      }

      if (RESERVED_ENV_KEYS.includes(key)) {
        return reply.status(400).send({ error: RESERVED_KEY_ERROR });
      }

      await envRepo.toggleEnv(key, scope, enabled, owner, repo);
      syncPtyEnv(fastify);
      return reply.status(200).send({ data: { success: true } });
    } catch (error) {
      fastify.log.error(error, 'Failed to toggle environment variable');
      return reply.status(500).send({
        error: error instanceof Error ? error.message : 'Failed to toggle environment variable',
      });
    }
  });
}
