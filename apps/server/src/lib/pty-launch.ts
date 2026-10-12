import type { TabMode } from '@minimalcorp/tsunagi-shared';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { ptyManager, type PtySession } from '../pty-manager.js';
import { prisma } from './db.js';
import { getWorktreePath } from './worktree-manager.js';
import { getEnv } from './repositories/environment.js';
import { resolveAgentProfileEnv } from './agent-profiles.js';
import { AgentLaunchError as PtyLaunchError, getAgentForMode } from './agents/index.js';

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

export { PtyLaunchError };

/**
 * sessionId(=tab_id) から PTY の作業ディレクトリと環境変数を解決する。
 * 環境変数の優先順位: リクエストで渡されたenv > エージェント固有のenv（ローカルLLMの provider 等） >
 * DB env(global/owner/repo、エージェントのプロファイルを設定ディレクトリに変換) > tsunagi独自のEDITOR設定
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
  const profile = resolveAgentProfileEnv(dbEnv);

  // エージェント固有の環境変数は DB の環境変数より後に適用する
  const mode = tab?.mode as TabMode | undefined;
  const agentEnv = await getAgentForMode(mode).resolveLaunchEnv(mode ?? 'claude');
  const providerEnv = agentEnv.env;
  const unsetKeys = [...new Set([...profile.unsetKeys, ...agentEnv.unsetKeys])];

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
 * 解決済みの launch で PTY を作り、エージェントを起動する。
 * 新規作成（POST /terminal/sessions）と環境変数変更時の作り直し（pty-env-sync）で共用する。
 */
export async function startPtySession(
  sessionId: string,
  launch: PtyLaunch,
  options: { request: PtyLaunchRequest; launchAgent: boolean; command?: string }
): Promise<PtySession> {
  await fs.mkdir(launch.workingDir, { recursive: true });

  const agent = options.launchAgent ? getAgentForMode(launch.mode) : undefined;
  const command = agent
    ? await agent.buildCommand(sessionId, launch.mode ?? 'claude')
    : options.command;

  const session = ptyManager.createSession(
    sessionId,
    launch.workingDir,
    launch.env,
    launch.unsetKeys,
    {
      request: options.request,
      launchAgent: options.launchAgent,
      syncEnv: true,
    }
  );

  // コマンドが指定されていればPTY起動後にシェルへ書き込む
  if (command) {
    const cmd = command.endsWith('\n') ? command : command + '\n';
    await agent?.prepareLaunch(launch.env);
    // シェルの初期化（プロンプト表示）を待つため少し遅延させて書き込む
    setTimeout(() => {
      session.pty.write(cmd);
    }, 300);
  }

  return session;
}

/** 既存 PTY でエージェントを（再）起動する前の補正。PTY 作成時の環境変数のプロファイルを対象にする */
export async function prepareAgentLaunchForSession(
  session: PtySession,
  mode: TabMode | undefined
): Promise<void> {
  await getAgentForMode(mode)?.prepareLaunch(session.appliedEnv);
}
