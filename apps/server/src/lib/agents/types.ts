import type { TabMode, Todo } from '@minimalcorp/tsunagi-shared';

/** タブで起動するコーディングエージェント（CLI） */
export type AgentId = 'claude';

/** エージェントの起動に必要な設定が足りないなど、起動前に分かる失敗 */
export class AgentLaunchError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
  }
}

/**
 * vendor ごとの hook を tsunagi の状態遷移に正規化したもの。
 * tabId は tsunagi のタブID（Claude はセッションID = タブID、それ以外は PTY の TSUNAGI_SESSION_ID）
 */
export type NormalizedHookEvent =
  | { tabId: string; kind: 'session-start' }
  | {
      tabId: string;
      kind: 'prompt' | 'permission' | 'stop' | 'stop-failure' | 'interrupt' | 'session-end';
    }
  | {
      tabId: string;
      kind: 'tool-post';
      toolName?: string;
      /** todos を更新するツールなら、現在の todos に適用する関数（解釈できなければ null を返す） */
      applyTodos?: (current: Todo[]) => Todo[] | null;
    };

export interface HookRequest {
  body: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
}

/** PTY に渡すエージェント固有の環境変数 */
export interface AgentLaunchEnv {
  env: Record<string, string>;
  unsetKeys: string[];
}

export interface AgentAdapter {
  id: AgentId;
  /** タブの mode に応じた追加の環境変数（DB の環境変数より後に適用する） */
  resolveLaunchEnv(mode: TabMode): Promise<AgentLaunchEnv>;
  /** 起動前の補正（設定ファイルの修正など）。env は PTY に渡す環境変数 */
  prepareLaunch(env: Record<string, string>): Promise<void>;
  /** PTY に書き込む起動コマンド（既存セッションがあれば resume） */
  buildCommand(tabId: string, mode: TabMode): Promise<string>;
  /** hook の受信内容を正規化する。状態遷移に関係しないイベントは null */
  normalizeHook(request: HookRequest): NormalizedHookEvent | null;
}
