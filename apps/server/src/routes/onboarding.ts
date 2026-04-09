import type { FastifyInstance } from 'fastify';
import { getEnv } from '../lib/repositories/environment.js';

export async function onboardingRoutes(fastify: FastifyInstance) {
  // GET /onboarding/status
  fastify.get('/onboarding/status', async (_request, reply) => {
    try {
      const globalEnv = await getEnv('global');
      const hasGlobalToken = Boolean(
        globalEnv.ANTHROPIC_API_KEY || globalEnv.CLAUDE_CODE_OAUTH_TOKEN
      );

      return reply.status(200).send({ data: { completed: hasGlobalToken, hasGlobalToken } });
    } catch (error) {
      fastify.log.error(error, 'GET /onboarding/status error');
      return reply.status(500).send({ error: 'Failed to fetch onboarding status' });
    }
  });
}
