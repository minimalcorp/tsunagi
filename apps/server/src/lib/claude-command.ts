import { randomUUID } from 'crypto';
import { mkdir, rename, writeFile } from 'fs/promises';
import * as path from 'path';
import type { LocalLlmProvider, TabMode } from '@minimalcorp/tsunagi-shared';
import { getStateDir } from './data-path.js';
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

/** 起動スクリプトの type 引数。original: Anthropic、ollama / lm-studio: ローカルLLM */
export type LaunchType = 'original' | 'ollama' | 'lm-studio';

const LAUNCH_TYPE_PROVIDER: Record<Exclude<LaunchType, 'original'>, LocalLlmProvider> = {
  ollama: 'ollama',
  'lm-studio': 'lmstudio',
};

/**
 * ローカルLLMタブの claude に付ける引数。
 * - モデルは Settings でだけ切り替える: /model の一覧を中継口の名前1件にし、PreModelSwitch フックで
 *   それ以外への切り替えを拒否する（Enter での切り替えは ~/.claude/settings.json に保存され、
 *   通常の Claude タブが壊れるため）
 * - ANTHROPIC_BASE_URL を変えたセッションでは MCP の tool search が無効になり、全 MCP のツール定義が
 *   毎回プロンプトに載る（prefill が遅くなり tool 選択の精度も落ちる）。そのため MCP を tsunagi の
 *   タスク管理と web_search だけに絞る
 */
function localLlmArgs(provider: LocalLlmProvider, webSearch: 'local' | 'ollama'): string[] {
  // ollama.com による WebSearch の代行は、使用中のモデルが Ollama のときだけ使える
  const localWebSearch = webSearch === 'local' || provider !== 'ollama';

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

/**
 * タスク進捗（プログレスバー）の元になる Task 系ツール。
 * Claude Code は旧モデル以外ではこれらを既定で無効にしており、--allowedTools で明示すると有効になる
 */
const TASK_TOOLS = 'TaskCreate,TaskGet,TaskUpdate,TaskList';

/**
 * claude の起動スクリプトを書き出し、そのパスを返す。`sh <script> <type> <session-id>` で起動し、
 * 既存セッションがあれば resume、なければ新規作成する。
 * 起動コマンドは PTY に1行で書き込むため、macOS の端末入力の1行上限（MAX_CANON = 1024 バイト）を
 * 超えると後ろが切り捨てられる。引数の JSON をコマンドに直接載せると上限を超え、
 * `|| claude ... --session-id` 側が途中で切れてタブと別のセッションIDで起動してしまう
 * （hooks がタブに紐づかず、--settings / --mcp-config も効かない）。そのため引数はスクリプトに閉じ込める。
 * ローカルLLMの引数は Settings に依存するため起動のたびに書き直す
 */
async function writeLauncher(): Promise<string> {
  const { webSearch } = await getLocalLlmSettings();
  const branches = (Object.keys(LAUNCH_TYPE_PROVIDER) as (keyof typeof LAUNCH_TYPE_PROVIDER)[])
    .map(
      (type) =>
        `  ${type}) set -- ${localLlmArgs(LAUNCH_TYPE_PROVIDER[type], webSearch).join(' ')} ;;`
    )
    .join('\n');
  const script = `#!/bin/sh
# usage: launch-claude.sh <original|ollama|lm-studio> <session-id>
type=$1
session_id=$2
case "$type" in
  original) set -- ;;
${branches}
  *) echo "launch-claude.sh: unknown type: $type" >&2; exit 2 ;;
esac
claude --dangerously-skip-permissions --allowedTools ${TASK_TOOLS} "$@" --resume "$session_id" 2>/dev/null ||
  exec claude --dangerously-skip-permissions --allowedTools ${TASK_TOOLS} "$@" --session-id "$session_id"
`;
  const file = path.join(getStateDir(), 'launch-claude.sh');
  await mkdir(path.dirname(file), { recursive: true });
  // 複数タブの同時起動で書きかけのファイルを読まないよう、書き終えてから置き換える
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, script);
  await rename(tmp, file);
  return file;
}

/** タブの mode から起動スクリプトの type を決める。ローカルLLMは Settings で選んだ使用中のモデルに従う */
async function resolveLaunchType(mode: TabMode): Promise<LaunchType> {
  if (!isLocalLlmMode(mode)) return 'original';
  const { active } = await getLocalLlmSettings();
  if (!active) {
    throw new Error('ローカルLLMのモデルが未設定です。Settings で使用するモデルを選んでください');
  }
  return active.provider === 'ollama' ? 'ollama' : 'lm-studio';
}

/** タブの mode に応じた claude の起動コマンド（既存セッションがあれば resume） */
export async function buildClaudeCommand(sessionId: string, mode: TabMode): Promise<string> {
  const type = await resolveLaunchType(mode);
  return `sh ${shellQuote(await writeLauncher())} ${type} ${sessionId}`;
}
