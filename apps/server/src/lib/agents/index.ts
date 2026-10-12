import type { TabMode } from '@minimalcorp/tsunagi-shared';
import { claudeAdapter } from './claude.js';
import { codexAdapter } from './codex.js';
import type { AgentAdapter, AgentId } from './types.js';

export * from './types.js';
export { getAgentAvailability } from './cli.js';

const ADAPTERS: Record<AgentId, AgentAdapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
};

export const AGENTS: readonly AgentAdapter[] = Object.values(ADAPTERS);

export function getAgent(id: string): AgentAdapter | undefined {
  return Object.hasOwn(ADAPTERS, id) ? ADAPTERS[id as AgentId] : undefined;
}

/**
 * タブの mode で起動するエージェント。local（旧 ollama / lmstudio 含む）はローカルLLMに繋いだ claude。
 * terminal は自動では起動しないが、Run ボタンで起動するのは claude
 */
export function getAgentForMode(mode: TabMode | undefined): AgentAdapter {
  return mode === 'codex' ? codexAdapter : claudeAdapter;
}
