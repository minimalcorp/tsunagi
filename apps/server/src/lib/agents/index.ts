import type { TabMode } from '@minimalcorp/tsunagi-shared';
import { claudeAdapter } from './claude.js';
import type { AgentAdapter, AgentId } from './types.js';

export * from './types.js';

const ADAPTERS: Record<AgentId, AgentAdapter> = {
  claude: claudeAdapter,
};

export function getAgent(id: string): AgentAdapter | undefined {
  return Object.hasOwn(ADAPTERS, id) ? ADAPTERS[id as AgentId] : undefined;
}

/**
 * タブの mode で起動するエージェント。terminal はエージェントを起動しない。
 * local（旧 ollama / lmstudio 含む）はローカルLLMに繋いだ claude
 */
export function getAgentForMode(mode: TabMode | undefined): AgentAdapter | undefined {
  if (mode === 'terminal') return undefined;
  return claudeAdapter;
}
