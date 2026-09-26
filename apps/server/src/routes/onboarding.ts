import type { FastifyInstance } from 'fastify';
import { getEnv } from '../lib/repositories/environment.js';
import { isLocalLlmReady } from '../lib/local-llm.js';

export async function onboardingRoutes(fastify: FastifyInstance) {
  // GET /onboarding/status
  fastify.get('/onboarding/status', async (_request, reply) => {
    try {
      const globalEnv = await getEnv('global');
      const hasGlobalToken = Boolean(
        globalEnv.ANTHROPIC_API_KEY || globalEnv.CLAUDE_CODE_OAUTH_TOKEN
      );
      // 実験的機能のローカルLLM（Ollama / LM Studio）を設定済みなら、Anthropic のトークンがなくても claude を起動できる
      const localLlmReady = await isLocalLlmReady();

      return reply.status(200).send({
        data: { completed: hasGlobalToken || localLlmReady, hasGlobalToken, localLlmReady },
      });
    } catch (error) {
      fastify.log.error(error, 'GET /onboarding/status error');
      return reply.status(500).send({ error: 'Failed to fetch onboarding status' });
    }
  });
}
