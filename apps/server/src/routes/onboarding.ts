import type { FastifyInstance } from 'fastify';
import { getEnv } from '../lib/repositories/environment.js';
import { getOllamaSettings, isOllamaReady } from '../lib/ollama-settings.js';

export async function onboardingRoutes(fastify: FastifyInstance) {
  // GET /onboarding/status
  fastify.get('/onboarding/status', async (_request, reply) => {
    try {
      const globalEnv = await getEnv('global');
      const hasGlobalToken = Boolean(
        globalEnv.ANTHROPIC_API_KEY || globalEnv.CLAUDE_CODE_OAUTH_TOKEN
      );
      // 実験的機能の Ollama を設定済みなら、Anthropic のトークンがなくても claude を起動できる
      const ollamaReady = isOllamaReady(await getOllamaSettings());

      return reply.status(200).send({
        data: { completed: hasGlobalToken || ollamaReady, hasGlobalToken, ollamaReady },
      });
    } catch (error) {
      fastify.log.error(error, 'GET /onboarding/status error');
      return reply.status(500).send({ error: 'Failed to fetch onboarding status' });
    }
  });
}
