import type { FastifyInstance } from 'fastify';
import { isLocalLlmReady } from '../lib/local-llm.js';
import { AGENTS, getAgentAvailability, type AgentAdapter } from '../lib/agents/index.js';
import { DEFAULT_PROFILE, getProfileAuthStatus, listProfiles } from '../lib/agent-profiles.js';

/** 導入済みのエージェントで、システム既定かいずれかのプロファイルがログイン済みか */
async function isAgentLoggedIn(agent: AgentAdapter): Promise<boolean> {
  if (!(await getAgentAvailability(agent)).installed) return false;
  if ((await getProfileAuthStatus(agent, DEFAULT_PROFILE)).loggedIn) return true;
  const profiles = await listProfiles(agent);
  const statuses = await Promise.all(profiles.map((p) => getProfileAuthStatus(agent, p.slug)));
  return statuses.some((status) => status.loggedIn);
}

export async function onboardingRoutes(fastify: FastifyInstance) {
  // GET /onboarding/status
  fastify.get('/onboarding/status', async (_request, reply) => {
    try {
      const [loggedIn, localLlmReady] = await Promise.all([
        Promise.all(AGENTS.map(async (agent) => [agent.id, await isAgentLoggedIn(agent)] as const)),
        // 実験的機能のローカルLLM（Ollama / LM Studio）を設定済みなら、ログインしていなくても claude を起動できる
        isLocalLlmReady(),
      ]);
      const agentLoggedIn = Object.fromEntries(loggedIn);
      const anyLoggedIn = loggedIn.some(([, value]) => value);

      return reply.status(200).send({
        data: {
          completed: anyLoggedIn || localLlmReady,
          agentLoggedIn,
          localLlmReady,
        },
      });
    } catch (error) {
      fastify.log.error(error, 'GET /onboarding/status error');
      return reply.status(500).send({ error: 'Failed to fetch onboarding status' });
    }
  });
}
