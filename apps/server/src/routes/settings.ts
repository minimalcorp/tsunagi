import type { FastifyInstance } from 'fastify';
import {
  getOllamaSettings,
  listOllamaModels,
  parseOllamaSettings,
  saveOllamaSettings,
} from '../lib/ollama-settings.js';

export async function settingsRoutes(fastify: FastifyInstance) {
  // GET /settings/ollama
  fastify.get('/settings/ollama', async (_request, reply) => {
    try {
      return reply.status(200).send({ data: await getOllamaSettings() });
    } catch (error) {
      fastify.log.error(error, 'GET /settings/ollama error');
      return reply.status(500).send({ error: 'Failed to fetch ollama settings' });
    }
  });

  // PUT /settings/ollama
  fastify.put('/settings/ollama', async (request, reply) => {
    const parsed = parseOllamaSettings(request.body);
    if ('error' in parsed) {
      return reply.status(400).send({ error: parsed.error });
    }
    try {
      return reply.status(200).send({ data: await saveOllamaSettings(parsed.settings) });
    } catch (error) {
      fastify.log.error(error, 'PUT /settings/ollama error');
      return reply.status(500).send({ error: 'Failed to save ollama settings' });
    }
  });

  // GET /settings/ollama/models - Ollama に pull 済みのモデル一覧
  // ブラウザから直接叩くと CORS / Docker 内外のホスト名差異が問題になるためサーバー経由にする
  fastify.get<{ Querystring: { baseUrl?: string } }>(
    '/settings/ollama/models',
    async (request, reply) => {
      const baseUrl = (request.query.baseUrl || (await getOllamaSettings()).baseUrl).replace(
        /\/+$/,
        ''
      );
      if (!/^https?:\/\//.test(baseUrl)) {
        return reply.status(400).send({ error: 'baseUrl must be a valid http(s) URL' });
      }
      try {
        return reply.status(200).send({ data: { models: await listOllamaModels(baseUrl) } });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return reply
          .status(502)
          .send({ error: `Ollama に接続できません (${baseUrl}): ${message}` });
      }
    }
  );
}
