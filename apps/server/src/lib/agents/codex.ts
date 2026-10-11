import { createHash, randomUUID } from 'crypto';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type { AgentAuthStatus } from '@minimalcorp/tsunagi-shared';
import { getStateDir } from '../data-path.js';
import { prisma } from '../db.js';
import { planToTodos } from '../tab-todos.js';
import { agentCliEnv, runAgentCli } from './cli.js';
import type { AgentAdapter, AgentProfileSpec, NormalizedHookEvent } from './types.js';

// Fastify(API) の公開ポート。index.ts と同じ既定値・同じ環境変数を見る
const SERVER_PORT = Number(process.env.TSUNAGI_SERVER_PORT) || 2791;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

/** hook の送信元タブを示すヘッダー（Codex のセッションIDはタブIDと別のため PTY の env から渡す） */
const TAB_ID_HEADER = 'x-tsunagi-tab-id';

/**
 * hook のコマンド。タブごとの値は PTY の env（TSUNAGI_API_BASE / TSUNAGI_SESSION_ID）で渡し、
 * 文字列自体は固定にする（trust のハッシュが変わらないように）。
 * Codex は一部の hook の stdout を JSON の指示として読むため捨て、送信に失敗しても 0 で終える。
 * `${VAR}` 形式は Codex が置換するため使わない
 */
const HOOK_COMMAND =
  `curl -s -m 5 -X POST "$TSUNAGI_API_BASE/api/hooks/codex"` +
  ` -H "X-Tsunagi-Tab-Id: $TSUNAGI_SESSION_ID" -H 'Content-Type: application/json'` +
  ` --data-binary @- >/dev/null 2>&1 || true`;

/**
 * 登録する hook と、その trust 用ラベル（hooks.state のキーとハッシュに使う）。
 * SessionEnd / Interrupt は Codex 側で timeout が最大 3 秒に制限される
 */
const HOOK_EVENTS = [
  { event: 'SessionStart', label: 'session_start', timeout: 10 },
  { event: 'UserPromptSubmit', label: 'user_prompt_submit', timeout: 10 },
  { event: 'PermissionRequest', label: 'permission_request', timeout: 10 },
  { event: 'PostToolUse', label: 'post_tool_use', timeout: 10 },
  { event: 'Stop', label: 'stop', timeout: 10 },
  { event: 'Interrupt', label: 'interrupt', timeout: 3 },
  { event: 'SessionEnd', label: 'session_end', timeout: 3 },
] as const;

const SIMPLE_EVENTS: Record<string, Exclude<NormalizedHookEvent['kind'], 'tool-post'>> = {
  UserPromptSubmit: 'prompt',
  PermissionRequest: 'permission',
  Stop: 'stop',
  // Esc での中断
  Interrupt: 'interrupt',
  // /exit・Ctrl+C 等
  SessionEnd: 'session-end',
};

interface CodexHookBody {
  hook_event_name?: string;
  session_id?: string;
  tool_name?: string;
  tool_input?: unknown;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** TOML のキー・文字列（JSON の文字列表現は TOML の basic string として読める） */
const tomlString = (value: string) => JSON.stringify(value);

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])])
    );
  }
  return value;
}

/**
 * `-c` で渡した hook を承認済みにするハッシュ。Codex は正規化した hook 定義（キーを整列した JSON）の
 * sha256 を trust の照合に使う（codex-rs/hooks/src/engine/discovery.rs の hook_hash）
 */
function hookTrustHash(label: string, timeout: number): string {
  const identity = {
    event_name: label,
    hooks: [{ type: 'command', command: HOOK_COMMAND, timeout, async: false }],
  };
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(sortKeys(identity)))
    .digest('hex')}`;
}

/**
 * tsunagi 連携用の `-c` 引数。ユーザーの config.toml には書き込まない（このプロセスだけに効く）
 * - hooks: 状態遷移・todos の通知。`-c` で渡した hook の trust は `<session-flags>` のキーで照合される。
 *   キーにドットを含むため、`hooks.state` はインラインテーブルで丸ごと渡す
 * - tools.update_plan: 計画ツール（todos の元）を有効にする
 * - mcp_servers.tsunagi: タスク管理の MCP
 */
function tsunagiConfigArgs(extra: { developerInstructions?: string; agentRoleFile?: string }) {
  const args: string[] = ['--dangerously-bypass-approvals-and-sandbox'];
  const state: string[] = [];
  for (const { event, label, timeout } of HOOK_EVENTS) {
    args.push(
      '-c',
      `hooks.${event}=[{hooks=[{type="command",command=${tomlString(HOOK_COMMAND)},timeout=${timeout}}]}]`
    );
    state.push(
      `${tomlString(`/<session-flags>/config.toml:${label}:0:0`)}={trusted_hash=${tomlString(hookTrustHash(label, timeout))}}`
    );
  }
  args.push('-c', `hooks.state={${state.join(',')}}`);
  args.push('-c', 'tools.update_plan.enabled=true');
  args.push('-c', `mcp_servers.tsunagi.url=${tomlString(`${SERVER_URL}/api/mcp`)}`);
  if (extra.developerInstructions) {
    args.push('-c', `developer_instructions=${tomlString(extra.developerInstructions)}`);
  }
  if (extra.agentRoleFile) {
    args.push(
      '-c',
      `agents.tsunagi-task-curator={description=${tomlString(CURATOR_DESCRIPTION)},config_file=${tomlString(extra.agentRoleFile)}}`
    );
  }
  return args;
}

const CURATOR_DESCRIPTION =
  'tsunagiタスクの並び替え（優先度変更）・棚卸し（backlog整理）を専門に行うエージェント。' +
  '「優先度を並び替えて」「棚卸しして」「backlogを整理して」等の要望があった時に使用する。';

/**
 * Claude Code 用のプラグイン（TSUNAGI_PLUGIN_DIR = <marketplace>/plugins/tsunagi-plugin）からの相対パスで
 * Codex 向けの本文を読む。skill は Codex 向けに書き直したもの（<marketplace>/codex）、
 * subagent は vendor 中立のためプラグインのものを共用する
 */
async function readPluginFile(...segments: string[]): Promise<string | undefined> {
  const pluginDir = process.env.TSUNAGI_PLUGIN_DIR;
  if (!pluginDir) return undefined;
  try {
    return await readFile(path.resolve(pluginDir, ...segments), 'utf-8');
  } catch {
    return undefined;
  }
}

/** Markdown 先頭の YAML frontmatter を外す */
function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n/, '').trimStart();
}

/** 複数タブの同時起動で書きかけのファイルを読まないよう、書き終えてから置き換える */
async function writeAtomic(file: string, content: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, content);
  await rename(tmp, file);
}

/** subagent の role ファイル（Codex の設定レイヤー）を state ディレクトリに書き出す */
async function writeCuratorRole(): Promise<string | undefined> {
  const markdown = await readPluginFile('agents', 'tsunagi-task-curator.md');
  if (!markdown) return undefined;
  const file = path.join(getStateDir(), 'codex', 'tsunagi-task-curator.toml');
  await writeAtomic(file, `developer_instructions = ${tomlString(stripFrontmatter(markdown))}\n`);
  return file;
}

/**
 * codex の起動スクリプトを書き出し、そのパスを返す。`sh <script> [<codex-session-id>]` で起動する。
 * Codex にはセッションIDを指定して新規作成する手段がないため、タブには前回の Codex のセッションIDを
 * 保存しておき（SessionStart hook）、その会話記録が CODEX_HOME にあれば resume、なければ新規作成する。
 * 引数は長く、PTY の1行上限（MAX_CANON）で切り捨てられるためスクリプトに閉じ込める
 */
async function writeLauncher(): Promise<string> {
  const [developerInstructions, agentRoleFile] = await Promise.all([
    readPluginFile('..', '..', 'codex', 'tsunagi-task.md'),
    writeCuratorRole(),
  ]);
  const args = tsunagiConfigArgs({ developerInstructions, agentRoleFile }).map(shellQuote);
  const script = `#!/bin/sh
# usage: launch-codex.sh [<codex-session-id>]
session_id=$1
set -- ${args.join(' \\\n  ')}
codex_home=\${CODEX_HOME:-$HOME/.codex}
if [ -n "$session_id" ] &&
  [ -n "$(find "$codex_home/sessions" -name "rollout-*-$session_id.jsonl" 2>/dev/null | head -n 1)" ]; then
  exec codex resume "$@" "$session_id"
fi
exec codex "$@"
`;
  const file = path.join(getStateDir(), 'launch-codex.sh');
  await writeAtomic(file, script);
  return file;
}

/** JWT の payload を読む（署名は検証しない。表示用） */
function decodeJwtPayload(token: unknown): Record<string, unknown> | undefined {
  if (typeof token !== 'string') return undefined;
  const payload = token.split('.')[1];
  if (!payload) return undefined;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as Record<
      string,
      unknown
    >;
  } catch {
    return undefined;
  }
}

/** ChatGPT ログインのアカウント情報（auth.json の id_token）。keyring 保存などで読めなければ空 */
async function readChatgptAccount(
  codexHome: string
): Promise<Pick<AgentAuthStatus, 'email' | 'subscriptionType'>> {
  try {
    const auth = JSON.parse(await readFile(path.join(codexHome, 'auth.json'), 'utf-8')) as {
      tokens?: { id_token?: unknown };
    };
    const claims = decodeJwtPayload(auth.tokens?.id_token);
    if (!claims) return {};
    const openai = claims['https://api.openai.com/auth'] as Record<string, unknown> | undefined;
    return {
      ...(typeof claims.email === 'string' && { email: claims.email }),
      ...(typeof openai?.chatgpt_plan_type === 'string' && {
        subscriptionType: openai.chatgpt_plan_type,
      }),
    };
  } catch {
    return {};
  }
}

const codexProfile: AgentProfileSpec = {
  envKey: 'TSUNAGI_CODEX_PROFILE',
  configDirEnvKey: 'CODEX_HOME',
  // auth.json のログインより優先される認証情報
  authEnvKeys: ['CODEX_API_KEY', 'CODEX_ACCESS_TOKEN'],
  defaultConfigDir: '~/.codex',
  // ブラウザでの OAuth（127.0.0.1:1455 で待ち受け）。戻れない環境ではユーザーが --device-auth に切り替える
  loginCommand: 'codex login',

  // `codex login status` は終了コードでログイン状態を返し、stderr に1行だけ方式を出す
  async getAuthStatus(configDir) {
    const env = agentCliEnv(codexProfile, configDir);
    const codexHome = configDir ?? process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex');
    try {
      const { stdout, stderr } = await runAgentCli('codex', ['login', 'status'], env);
      const line = `${stderr}\n${stdout}`.trim().split('\n').pop() ?? '';
      const method = /^Logged in using (.+?)(?: - .*)?$/.exec(line)?.[1];
      return {
        loggedIn: true,
        authMethod: method,
        ...(method === 'ChatGPT' && (await readChatgptAccount(codexHome))),
      };
    } catch (err) {
      // 未ログインは終了コード 1（"Not logged in"）
      const code = (err as { code?: unknown }).code;
      if (typeof code === 'number') return { loggedIn: false };
      return { loggedIn: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  async logout(configDir) {
    await runAgentCli('codex', ['logout'], agentCliEnv(codexProfile, configDir));
  },
};

export const codexAdapter: AgentAdapter = {
  id: 'codex',
  label: 'Codex',
  cli: 'codex',
  // tsunagi が使う `-c` キー（hooks.state / tools.update_plan 等）を確認したバージョン
  minVersion: [0, 162, 0],
  profile: codexProfile,

  async resolveLaunchEnv() {
    return { env: {}, unsetKeys: [] };
  },

  // CODEX_HOME は存在しないと codex が起動しない（プロファイル作成時に作るが、消されていた場合に備える）
  async prepareLaunch(env) {
    if (env.CODEX_HOME) await mkdir(env.CODEX_HOME, { recursive: true });
  },

  async buildCommand(tabId) {
    const [launcher, tab] = await Promise.all([
      writeLauncher(),
      prisma.tab.findUnique({ where: { tabId }, select: { agentSessionId: true } }),
    ]);
    const sessionId = tab?.agentSessionId;
    return sessionId
      ? `sh ${shellQuote(launcher)} ${shellQuote(sessionId)}`
      : `sh ${shellQuote(launcher)}`;
  },

  normalizeHook({ body, headers }) {
    const header = headers[TAB_ID_HEADER];
    const tabId = Array.isArray(header) ? header[0] : header;
    const { hook_event_name: eventName, session_id: sessionId } = body as CodexHookBody;
    if (!tabId || !eventName) return null;

    if (eventName === 'SessionStart') {
      return { tabId, kind: 'session-start', ...(sessionId && { agentSessionId: sessionId }) };
    }
    const kind = SIMPLE_EVENTS[eventName];
    if (kind) return { tabId, kind };

    if (eventName === 'PostToolUse') {
      const { tool_name: toolName, tool_input: input } = body as CodexHookBody;
      return {
        tabId,
        kind: 'tool-post',
        toolName,
        // update_plan は毎回計画全体が渡されるため全置換する
        ...(toolName === 'update_plan' && { applyTodos: () => planToTodos(input) }),
      };
    }
    return null;
  },
};
