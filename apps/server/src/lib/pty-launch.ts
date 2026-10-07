import type { TabMode } from '@minimalcorp/tsunagi-shared';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { ptyManager, type PtySession } from '../pty-manager.js';
import { prisma } from './db.js';
import { getWorktreePath } from './worktree-manager.js';
import { getEnv } from './repositories/environment.js';
import {
  ensureClaudeOnboardingCompleted,
  removeLocalModelFromUserSettings,
  watchUserSettingsForLocalModel,
} from './claude-config-guard.js';
import { LOCAL_LLM_UNSET_ENV_KEYS, LOCAL_MODEL_ALIAS, buildLocalLlmEnv } from './local-llm-env.js';
import { ensureActiveLoaded, getLocalLlmSettings } from './local-llm.js';
import { LOCAL_LLM_PROXY_URL, buildClaudeCommand, isLocalLlmMode } from './claude-command.js';
import { resolveClaudeProfileEnv } from './claude-profiles.js';

// このファイル基準で解決する(cwd 非依存):
//   dev:        apps/server/src/lib      → apps/server/scripts
//   build:      apps/server/dist/lib     → apps/server/scripts
//   npm bundle: <pkg>/dist/server/lib    → <pkg>/dist/scripts
const TSUNAGI_EDITOR_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../scripts/monaco-editor.sh'
);

// Fastify(API) の公開ポート。index.ts と同じ既定値・同じ環境変数(TSUNAGI_SERVER_PORT)を見る。
// monaco-editor.sh など PTY 内のプロセスが API を叩く際の同一ホスト向けベース URL に使う。
const SERVER_PORT = Number(process.env.TSUNAGI_SERVER_PORT) || 2791;

/** PTY 起動時にクライアントが指定する値（環境変数の自動反映で作り直すときも同じ値を使う） */
export interface PtyLaunchRequest {
  cwd?: string;
  env?: Record<string, string>;
}

export interface PtyLaunch {
  workingDir: string;
  mode: TabMode | undefined;
  /** タブ（Task）に紐づくか。紐づくタブは worktree が必須 */
  hasTab: boolean;
  env: Record<string, string>;
  unsetKeys: string[];
}

export class PtyLaunchError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
  }
}

/**
 * sessionId(=tab_id) から PTY の作業ディレクトリと環境変数を解決する。
 * 環境変数の優先順位: リクエストで渡されたenv > ローカルLLMのprovider env >
 * DB env(global/owner/repo、Claude プロファイルを CLAUDE_CONFIG_DIR に変換) > tsunagi独自のEDITOR設定
 */
export async function resolvePtyLaunch(
  sessionId: string,
  request: PtyLaunchRequest
): Promise<PtyLaunch> {
  // Taskに紐づかないタブは Tab レコードが存在しないため null になる。
  const tab = await prisma.tab.findUnique({
    where: { tabId: sessionId },
    include: { task: true },
  });

  // cwd は Task があればサーバー側で worktree パスを導出する（クライアントの state に依存しない）。
  // クライアント指定の cwd は Task に紐づかないタブのフォールバックとしてのみ使う。
  const defaultDir = path.join(os.homedir(), '.tsunagi', 'workspaces');
  let workingDir = tab
    ? getWorktreePath(tab.task.owner, tab.task.repo, tab.task.branch)
    : (request.cwd ?? defaultDir);

  // cwd が存在するか確認。Task のタブは worktree 必須（無ければ起動しない）、
  // それ以外はデフォルトにフォールバック
  try {
    await fs.access(workingDir);
  } catch {
    if (tab) throw new PtyLaunchError(`Worktree not found at ${workingDir}`, 409);
    workingDir = defaultDir;
  }

  // repo スコープまで階層マージした環境変数を取得する（global → owner → repo、後勝ちで上書き）。
  // Taskに紐づかないタブは global のみになる。
  // 読み込みに失敗したら起動しない（空の環境変数で起動・作り直しすると設定が抜け落ちるため）
  const dbEnv = tab ? await getEnv('repo', tab.task.owner, tab.task.repo) : await getEnv('global');
  const profile = resolveClaudeProfileEnv(dbEnv);

  // ローカルLLMタブ: Anthropic の代わりに tsunagi の中継口（→ Ollama / LM Studio）で claude を動かす。
  // DB の環境変数より後に適用し、Anthropic の認証トークンは環境変数ごと取り除く。
  const mode = tab?.mode as TabMode | undefined;
  let providerEnv: Record<string, string> = {};
  let unsetKeys = profile.unsetKeys;
  if (isLocalLlmMode(mode)) {
    const { active, extraEnv } = await getLocalLlmSettings();
    if (!active) {
      throw new PtyLaunchError(
        'ローカルLLMのモデルが未設定です。Settings で使用するモデルを選んでください',
        400
      );
    }
    providerEnv = buildLocalLlmEnv({
      proxyUrl: LOCAL_LLM_PROXY_URL,
      contextTokens: active.contextTokens,
      extraEnv,
    });
    unsetKeys = [...new Set([...unsetKeys, ...LOCAL_LLM_UNSET_ENV_KEYS])];
  }

  // tsunagi-editor.sh をデフォルトにすることで Ctrl+G が Monaco Modal を開く。
  // DB / リクエストで EDITOR が明示設定されている場合はそちらが優先される。
  const tsunagiDefaultEnv: Record<string, string> = {
    EDITOR: TSUNAGI_EDITOR_PATH,
    TSUNAGI_SESSION_ID: sessionId,
    // monaco-editor.sh が API(Fastify) を叩くためのベース URL。サーバーと同一
    // ホストなので localhost。単一ポート化で API は SERVER_PORT(既定 2791)。
    TSUNAGI_API_BASE: `http://localhost:${SERVER_PORT}`,
  };

  return {
    workingDir,
    mode,
    hasTab: Boolean(tab),
    env: { ...tsunagiDefaultEnv, ...profile.env, ...providerEnv, ...request.env },
    unsetKeys,
  };
}

/**
 * claude 起動前の補正。claude logout で .claude.json の hasCompletedOnboarding がリセットされて
 * いると、次回 claude 起動時にオンボーディングウィザードが表示され --resume/--session-id を前提にした
 * 自動起動フローが止まるため補正する。監視の取りこぼしに備え、中継口の名前が既定モデルに残って
 * いないかも補正する。対象はタブが使う Claude プロファイルの設定ディレクトリ。
 */
async function prepareClaudeConfig(env: Record<string, string>): Promise<void> {
  // PTY は外側 Terminal の環境を継承するため、プロファイル未指定なら外側の CLAUDE_CONFIG_DIR に従う
  const configDir = env.CLAUDE_CONFIG_DIR ?? process.env.CLAUDE_CONFIG_DIR;
  await ensureClaudeOnboardingCompleted(configDir);
  await removeLocalModelFromUserSettings(LOCAL_MODEL_ALIAS, configDir);
  watchUserSettingsForLocalModel(LOCAL_MODEL_ALIAS, configDir);
}

/**
 * 解決済みの launch で PTY を作り、claude を起動する。
 * 新規作成（POST /terminal/sessions）と環境変数変更時の作り直し（pty-env-sync）で共用する。
 */
export async function startPtySession(
  sessionId: string,
  launch: PtyLaunch,
  options: { request: PtyLaunchRequest; launchClaude: boolean; command?: string }
): Promise<PtySession> {
  await fs.mkdir(launch.workingDir, { recursive: true });

  let command = options.command;
  if (options.launchClaude) {
    if (isLocalLlmMode(launch.mode)) {
      // 最初の発言を待たせないよう読み込みを始めておく（完了は待たない）
      ensureActiveLoaded().catch(() => undefined);
    }
    command = await buildClaudeCommand(sessionId, launch.mode ?? 'claude');
  }

  const session = ptyManager.createSession(
    sessionId,
    launch.workingDir,
    launch.env,
    launch.unsetKeys,
    {
      request: options.request,
      launchClaude: options.launchClaude,
      syncEnv: true,
    }
  );

  // コマンドが指定されていればPTY起動後にシェルへ書き込む
  if (command) {
    const cmd = command.endsWith('\n') ? command : command + '\n';
    await prepareClaudeConfig(launch.env);
    // シェルの初期化（プロンプト表示）を待つため少し遅延させて書き込む
    setTimeout(() => {
      session.pty.write(cmd);
    }, 300);
  }

  return session;
}

/** 既存 PTY で claude を（再）起動する前の補正。PTY 作成時の環境変数のプロファイルを対象にする */
export async function prepareClaudeConfigForSession(session: PtySession): Promise<void> {
  await prepareClaudeConfig(session.appliedEnv);
}
