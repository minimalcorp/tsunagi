import type { TabMode } from '@minimalcorp/tsunagi-shared';
import { LOCAL_MODEL_ALIAS } from './local-llm-env.js';
import { getLocalLlmSettings } from './local-llm.js';

// Fastify(API) の公開ポート。index.ts と同じ既定値・同じ環境変数を見る
const SERVER_PORT = Number(process.env.TSUNAGI_SERVER_PORT) || 2791;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

/** ローカルLLMタブの Claude Code の接続先（tsunagi の中継口） */
export const LOCAL_LLM_PROXY_URL = `${SERVER_URL}/api/local-llm/proxy`;

/** ローカル検索に切り替えたタブで、組み込み WebSearch の代わりに使うよう促す */
const LOCAL_WEB_SEARCH_PROMPT =
  'The built-in WebSearch tool is unavailable in this session. ' +
  'When you need information from the web, first call mcp__tsunagi-web__web_search to find pages. ' +
  'Do not guess URLs: only use WebFetch on URLs returned by web_search or given by the user.';

export function isLocalLlmMode(mode: TabMode | undefined): boolean {
  return mode === 'local' || mode === 'ollama' || mode === 'lmstudio';
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * ローカルLLMタブの claude に付ける引数。
 * - モデルは Settings でだけ切り替える: /model の一覧を中継口の名前1件にし、PreModelSwitch フックで
 *   それ以外への切り替えを拒否する（Enter での切り替えは ~/.claude/settings.json に保存され、
 *   通常の Claude タブが壊れるため）
 * - ANTHROPIC_BASE_URL を変えたセッションでは MCP の tool search が無効になり、全 MCP のツール定義が
 *   毎回プロンプトに載る（prefill が遅くなり tool 選択の精度も落ちる）。そのため MCP を tsunagi の
 *   タスク管理と web_search だけに絞る
 */
async function localLlmArgs(): Promise<string[]> {
  const { active, webSearch } = await getLocalLlmSettings();
  // ollama.com による WebSearch の代行は、使用中のモデルが Ollama のときだけ使える
  const localWebSearch = webSearch === 'local' || active?.provider !== 'ollama';

  const settings = {
    modelPicker: {
      options: [
        {
          model: LOCAL_MODEL_ALIAS,
          label: 'ローカルLLM',
          description: 'tsunagi の Settings で選んだモデル（切り替えも Settings で行う）',
        },
      ],
      replaceBuiltInOptions: true,
    },
    hooks: {
      PreModelSwitch: [
        {
          hooks: [
            {
              type: 'http',
              url: `${SERVER_URL}/api/hooks/local-llm/pre-model-switch`,
              timeout: 10,
            },
          ],
        },
      ],
    },
  };

  const mcpServers: Record<string, { type: 'http'; url: string }> = {
    tsunagi: { type: 'http', url: `${SERVER_URL}/api/mcp` },
  };
  if (localWebSearch) {
    mcpServers['tsunagi-web'] = { type: 'http', url: `${SERVER_URL}/api/mcp/web` };
  }

  const args = [
    // 会話記録には転送先の実モデル名が残り、再開時に Claude Code がそれを復元しうるため、
    // 中継口の名前に固定する（--model は会話記録より優先され、settings.json にも保存されない）
    '--model',
    LOCAL_MODEL_ALIAS,
    '--settings',
    shellQuote(JSON.stringify(settings)),
    '--strict-mcp-config',
    '--mcp-config',
    shellQuote(JSON.stringify({ mcpServers })),
  ];
  if (localWebSearch) {
    args.push(
      '--disallowedTools',
      'WebSearch',
      '--append-system-prompt',
      shellQuote(LOCAL_WEB_SEARCH_PROMPT)
    );
  }
  return args;
}

/** タブの mode に応じた claude の起動コマンド（既存セッションがあれば resume） */
export async function buildClaudeCommand(sessionId: string, mode: TabMode): Promise<string> {
  const args = ['--dangerously-skip-permissions'];
  if (isLocalLlmMode(mode)) args.push(...(await localLlmArgs()));
  const claude = `claude ${args.join(' ')}`;
  return `${claude} --resume ${sessionId} 2>/dev/null || ${claude} --session-id ${sessionId}`;
}
