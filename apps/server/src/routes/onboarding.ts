import type { FastifyInstance } from 'fastify';
import { isLocalLlmReady } from '../lib/local-llm.js';
import {
  DEFAULT_CLAUDE_PROFILE,
  getClaudeAuthStatus,
  listClaudeProfiles,
} from '../lib/claude-profiles.js';

/** システム既定かいずれかの Claude プロファイルがログイン済みか */
async function isClaudeLoggedIn(): Promise<boolean> {
  if ((await getClaudeAuthStatus(DEFAULT_CLAUDE_PROFILE)).loggedIn) return true;
  const profiles = await listClaudeProfiles();
  const statuses = await Promise.all(profiles.map((p) => getClaudeAuthStatus(p.slug)));
  return statuses.some((status) => status.loggedIn);
}

export async function onboardingRoutes(fastify: FastifyInstance) {
  // GET /onboarding/status
  fastify.get('/onboarding/status', async (_request, reply) => {
    try {
      const [claudeLoggedIn, localLlmReady] = await Promise.all([
        isClaudeLoggedIn(),
        // 実験的機能のローカルLLM（Ollama / LM Studio）を設定済みなら、Claude にログインしていなくても claude を起動できる
        isLocalLlmReady(),
      ]);

      return reply.status(200).send({
        data: { completed: claudeLoggedIn || localLlmReady, claudeLoggedIn, localLlmReady },
      });
    } catch (error) {
      fastify.log.error(error, 'GET /onboarding/status error');
      return reply.status(500).send({ error: 'Failed to fetch onboarding status' });
    }
  });
}
