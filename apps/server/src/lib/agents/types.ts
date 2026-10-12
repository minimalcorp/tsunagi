import type { AgentAuthStatus, AgentId, TabMode, Todo } from '@minimalcorp/tsunagi-shared';

export type { AgentId };

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
  | {
      tabId: string;
      kind: 'session-start';
      /** エージェント側のセッションID（タブIDと別の ID を振るエージェントのみ）。resume 用に保存する */
      agentSessionId?: string;
    }
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

/** プロファイル（エージェントの設定ディレクトリ）の扱い */
export interface AgentProfileSpec {
  /** タブで使うプロファイルの割り当てを保存する予約キー（global → owner → repo で継承） */
  envKey: string;
  /** 設定ディレクトリを指す環境変数（CLAUDE_CONFIG_DIR / CODEX_HOME） */
  configDirEnvKey: string;
  /**
   * プロファイルのログインより優先される認証情報の環境変数。
   * プロファイルを選んだタブでは外側 Terminal から継承した値も取り除く
   */
  authEnvKeys: string[];
  /** システム既定の設定ディレクトリ（表示用） */
  defaultConfigDir: string;
  /** ログイン用 PTY に書き込むコマンド */
  loginCommand: string;
  /**
   * ブラウザでの OAuth の戻り先として CLI が 127.0.0.1 で待ち受けるポート（使用中のときの予備を含む）。
   * ブラウザから届かない環境（コンテナ内）では、ブラウザで開けなかった URL を貼り付けて CLI に渡す（login-callback.ts）
   */
  loginCallbackPorts?: number[];
  /** configDir が undefined ならシステム既定 */
  getAuthStatus(configDir: string | undefined): Promise<AgentAuthStatus>;
  logout(configDir: string): Promise<void>;
}

export interface AgentAdapter {
  id: AgentId;
  /** 表示名 */
  label: string;
  /** CLI のコマンド名 */
  cli: string;
  /** tsunagi が必要とする最低バージョン */
  minVersion: readonly [number, number, number];
  profile: AgentProfileSpec;
  /** タブの mode に応じた追加の環境変数（DB の環境変数より後に適用する） */
  resolveLaunchEnv(mode: TabMode): Promise<AgentLaunchEnv>;
  /** 起動前の補正（設定ファイルの修正など）。env は PTY に渡す環境変数 */
  prepareLaunch(env: Record<string, string>): Promise<void>;
  /** PTY に書き込む起動コマンド（既存セッションがあれば resume） */
  buildCommand(tabId: string, mode: TabMode): Promise<string>;
  /** hook の受信内容を正規化する。状態遷移に関係しないイベントは null */
  normalizeHook(request: HookRequest): NormalizedHookEvent | null;
}
