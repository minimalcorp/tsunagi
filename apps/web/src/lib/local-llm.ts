import type { LocalLlmProvider } from '@minimalcorp/tsunagi-shared';

export const LOCAL_LLM_PROVIDER_LABEL: Record<LocalLlmProvider, string> = {
  ollama: 'Ollama',
  lmstudio: 'LM Studio',
};

/** ローカルLLMタブのラベル。使用中のモデルのプロバイダー名（未設定なら汎用の名前） */
export function localLlmTabLabel(provider: LocalLlmProvider | null): string {
  return provider ? LOCAL_LLM_PROVIDER_LABEL[provider] : 'ローカルLLM';
}
