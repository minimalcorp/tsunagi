import type { AgentAuthStatus, TabMode } from '@minimalcorp/tsunagi-shared';
import { LOCAL_LLM_PROXY_URL, buildClaudeCommand, isLocalLlmMode } from '../claude-command.js';
import {
  ensureClaudeOnboardingCompleted,
  removeLocalModelFromUserSettings,
  watchUserSettingsForLocalModel,
} from '../claude-config-guard.js';
import { LOCAL_LLM_UNSET_ENV_KEYS, LOCAL_MODEL_ALIAS, buildLocalLlmEnv } from '../local-llm-env.js';
import { ensureActiveLoaded, getLocalLlmSettings } from '../local-llm.js';
import { TODO_TOOL_NAMES, applyToolToTodos } from '../tab-todos.js';
import { agentCliEnv, runAgentCli } from './cli.js';
import {
  AgentLaunchError,
  type AgentAdapter,
  type AgentProfileSpec,
  type NormalizedHookEvent,
} from './types.js';

// Claude CLIのhookイベント型
interface ClaudeHookBody {
  hook_event_name?: string;
  session_id?: string;
  // PreToolUse / PostToolUse / PostToolUseFailure
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: Record<string, unknown>;
}

const SIMPLE_EVENTS: Record<string, Exclude<NormalizedHookEvent['kind'], 'tool-post'>> = {
  // claudeが起動しただけ（まだプロンプト処理していない）
  SessionStart: 'session-start',
  UserPromptSubmit: 'prompt',
  // ツール実行許可待ち
  PermissionRequest: 'permission',
  Stop: 'stop',
  // APIエラーでターン終了
  StopFailure: 'stop-failure',
  // Escキー中断・Ctrl+C・/exit等
  SessionEnd: 'session-end',
};

const claudeProfile: AgentProfileSpec = {
  envKey: 'TSUNAGI_CLAUDE_PROFILE',
  configDirEnvKey: 'CLAUDE_CONFIG_DIR',
  // Claude Code が /login のログインより優先する認証情報
  authEnvKeys: ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'],
  defaultConfigDir: '~/.claude',
  loginCommand: 'claude auth login',

  // `claude auth status --json` でログイン状態を取得する
  async getAuthStatus(configDir) {
    const env = agentCliEnv(claudeProfile, configDir);
    try {
      const { stdout } = await runAgentCli('claude', ['auth', 'status', '--json'], env);
      const raw = JSON.parse(stdout) as Record<string, unknown>;
      const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
      return {
        loggedIn: raw.loggedIn === true,
        authMethod: str(raw.authMethod),
        email: str(raw.email),
        orgName: str(raw.orgName),
        subscriptionType: str(raw.subscriptionType),
      } satisfies AgentAuthStatus;
    } catch (err) {
      // claude auth status は未ログイン時に非 0 で終了するが、stdout には JSON が出る
      const stdout = (err as { stdout?: string }).stdout;
      if (stdout) {
        try {
          const raw = JSON.parse(stdout) as { loggedIn?: boolean; authMethod?: string };
          return { loggedIn: raw.loggedIn === true, authMethod: raw.authMethod };
        } catch {
          // fallthrough
        }
      }
      return { loggedIn: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  // ログイン情報（macOS は Keychain）を残さないよう、プロファイル削除前に logout する
  async logout(configDir) {
    await runAgentCli('claude', ['auth', 'logout'], agentCliEnv(claudeProfile, configDir));
  },
};

export const claudeAdapter: AgentAdapter = {
  id: 'claude',
  label: 'Claude Code',
  cli: 'claude',
  // CLAUDE_CODE_PLUGIN_DIRS に対応した最初のバージョン（apps/cli の起動チェックと同じ）
  minVersion: [2, 1, 280],
  profile: claudeProfile,

  // ローカルLLMタブ: Anthropic の代わりに tsunagi の中継口（→ Ollama / LM Studio）で claude を動かす。
  // Anthropic の認証トークンは環境変数ごと取り除く
  async resolveLaunchEnv(mode: TabMode) {
    if (!isLocalLlmMode(mode)) return { env: {}, unsetKeys: [] };
    const { active, extraEnv } = await getLocalLlmSettings();
    if (!active) {
      throw new AgentLaunchError(
        'ローカルLLMのモデルが未設定です。Settings で使用するモデルを選んでください',
        400
      );
    }
    return {
      env: buildLocalLlmEnv({
        proxyUrl: LOCAL_LLM_PROXY_URL,
        contextTokens: active.contextTokens,
        extraEnv,
      }),
      unsetKeys: LOCAL_LLM_UNSET_ENV_KEYS,
    };
  },

  /**
   * claude logout で .claude.json の hasCompletedOnboarding がリセットされていると、次回 claude 起動時に
   * オンボーディングウィザードが表示され --resume/--session-id を前提にした自動起動フローが止まるため補正する。
   * 監視の取りこぼしに備え、中継口の名前が既定モデルに残っていないかも補正する。
   * 対象はタブが使う Claude プロファイルの設定ディレクトリ
   */
  async prepareLaunch(env) {
    // PTY は外側 Terminal の環境を継承するため、プロファイル未指定なら外側の CLAUDE_CONFIG_DIR に従う
    const configDir = env.CLAUDE_CONFIG_DIR ?? process.env.CLAUDE_CONFIG_DIR;
    await ensureClaudeOnboardingCompleted(configDir);
    await removeLocalModelFromUserSettings(LOCAL_MODEL_ALIAS, configDir);
    watchUserSettingsForLocalModel(LOCAL_MODEL_ALIAS, configDir);
  },

  async buildCommand(tabId, mode) {
    if (isLocalLlmMode(mode)) {
      // 最初の発言を待たせないよう読み込みを始めておく（完了は待たない。未設定等のエラーは中継口がタブに返す）
      ensureActiveLoaded().catch(() => undefined);
    }
    return buildClaudeCommand(tabId, mode);
  },

  // Claude のセッションIDはタブIDと同じ（--session-id / --resume で揃えている）
  normalizeHook({ body }) {
    const { hook_event_name: eventName, session_id: tabId } = body as ClaudeHookBody;
    if (!tabId || !eventName) return null;

    const kind = SIMPLE_EVENTS[eventName];
    if (kind) return { tabId, kind };

    if (eventName === 'PostToolUse') {
      // ツール実行完了（PermissionRequest後のAllow含む）。TodoWrite / Task 系ツールなら todos も更新する
      const {
        tool_name: toolName,
        tool_input: input,
        tool_response: response,
      } = body as ClaudeHookBody;
      return {
        tabId,
        kind: 'tool-post',
        toolName,
        ...(toolName !== undefined &&
          TODO_TOOL_NAMES.has(toolName) && {
            applyTodos: (current) => applyToolToTodos(current, toolName, input, response),
          }),
      };
    }
    return null;
  },
};
