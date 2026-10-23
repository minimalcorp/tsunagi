import * as pty from 'node-pty';
import * as os from 'os';
import * as path from 'path';

const SCROLLBACK_MAX_BYTES = 256 * 1024; // 256KB
const SESSION_GC_INTERVAL_MS = 30 * 60 * 1000; // 30分

/**
 * apps/cli（entry・app）が Fastify サーバー起動時に自分で注入する環境変数
 * （TSUNAGI_SERVER_PORT, NODE_ENV, TSUNAGI_NEXT_PORT, TSUNAGI_OUTER_NODE_ENV, TSUNAGI_PLUGIN_DIR,
 * TSUNAGI_ENTRY_*, TSUNAGI_LAST_GOOD, TSUNAGI_AUTO_UPDATE, TSUNAGI_RESTARTED）。
 * サーバープロセス自身の制御用に後から足された値のため、内部ターミナルには継承しない。
 * 外側 Terminal 由来の環境変数はこのリストと無関係に、これまで通り全て継承する
 * （PORT はここでは扱わない。apps/cli は generic な PORT を上書きせず、専用キー
 * TSUNAGI_SERVER_PORT で自身の待受ポートを伝えるため、ユーザーが Terminal で明示した
 * PORT はそのまま内部ターミナルまで届く）。
 *
 * NODE_ENV は Fastify/Next 等が直接参照するため、PORT と違って専用キーへ逃がせず、
 * サーバープロセス自身には強制的に 'production' が入る。apps/cli はサーバー起動前の
 * 元の値（外側 Terminal 由来、未設定なら undefined）を TSUNAGI_OUTER_NODE_ENV に退避して
 * 渡してくるので、ここで NODE_ENV を一旦除外した後、退避値があれば NODE_ENV として復元する。
 */
const TSUNAGI_INJECTED_ENV_KEYS = [
  'TSUNAGI_SERVER_PORT',
  'NODE_ENV',
  'TSUNAGI_NEXT_PORT',
  'TSUNAGI_OUTER_NODE_ENV',
  'TSUNAGI_PLUGIN_DIR',
  'TSUNAGI_ENTRY_PROTOCOL',
  'TSUNAGI_ENTRY_PACKAGE_ROOT',
  'TSUNAGI_ENTRY_OUTDATED',
  'TSUNAGI_LAST_GOOD',
  'TSUNAGI_AUTO_UPDATE',
  'TSUNAGI_RESTARTED',
];

/**
 * tsunagi の Claude Code プラグイン（hooks・MCP・skill）を、内部ターミナルで起動する claude に
 * セッション単位で読み込ませる。ユーザー設定にはインストールしないため、tsunagi 外の claude には
 * 影響しない。外側 Terminal や DB で CLAUDE_CODE_PLUGIN_DIRS が設定済みなら、その後ろに追加する。
 */
function addTsunagiPluginDir(env: Record<string, string | undefined>): void {
  const pluginDir = process.env.TSUNAGI_PLUGIN_DIR;
  if (!pluginDir) return;
  const dirs = (env.CLAUDE_CODE_PLUGIN_DIRS ?? '').split(':').filter(Boolean);
  if (!dirs.includes(pluginDir)) dirs.push(pluginDir);
  env.CLAUDE_CODE_PLUGIN_DIRS = dirs.join(':');
}

/** PTY 作成時の付随情報（環境変数の変更を反映するために作り直すときに使う） */
export interface PtySessionOptions {
  /** クライアントが指定した cwd / env */
  request?: { cwd?: string; env?: Record<string, string> };
  /** 作成時にエージェントを起動したか（作り直し後もエージェントを resume で起動する） */
  launchAgent?: boolean;
  /** tsunagi の環境変数の変更を自動で反映する対象か（Claude のログイン用 PTY 等は対象外） */
  syncEnv?: boolean;
}

export interface PtySession {
  pty: pty.IPty;
  sessionId: string;
  cwd: string;
  /** 作成時に渡した環境変数と取り除いたキー（変更検知の比較元） */
  appliedEnv: Record<string, string>;
  appliedUnsetKeys: string[];
  options: PtySessionOptions;
  /** tsunagi の環境変数が変わり、作り直し待ちの状態 */
  envPending: boolean;
  /** 環境変数の反映のために kill 中。onExit で「セッション終了」として扱わない */
  respawning: boolean;
  /** 最後にユーザー入力があった時刻（入力中の作り直しを避けるため） */
  lastInputAt: number;
  /**
   * PTY出力のリングバッファ（再接続時にまとめて送信）。
   * 文字列は PTY 出力、TerminalSize は「ここで PTY がこのサイズに変わった」印。
   * replay 時にサイズの区切りごとに xterm を resize してから書くことで、録画時と同じ幅で再生する
   * （幅の違う出力を一つの幅で再生すると、列指定が切り詰められて崩れる）。
   */
  scrollback: ScrollbackEntry[];
  /** scrollback 中の出力のバイト数（サイズ印は含まない） */
  scrollbackSize: number;
  /** scrollback の先頭時点の PTY サイズ（最初のサイズ印より前の出力がこの幅で描かれた） */
  scrollbackStartSize: TerminalSize;
  /** 最後にPTY出力があった時刻（GC判定用） */
  lastOutputAt: number;
  /** 最後にWebSocket接続があった時刻 */
  lastConnectedAt: number;
  /** GCインターバルタイマー */
  gcTimer: ReturnType<typeof setInterval> | null;
}

export interface TerminalSize {
  cols: number;
  rows: number;
}

/** scrollback の要素。文字列は PTY 出力、TerminalSize は PTY の resize 位置を示す印 */
export type ScrollbackEntry = string | TerminalSize;

/** replay 用に scrollback をサイズごとに区切ったもの。data はそのサイズで描かれた出力 */
export interface ReplaySegment extends TerminalSize {
  data: string;
}

const INITIAL_PTY_SIZE: TerminalSize = { cols: 80, rows: 24 };

class PtyManager {
  private sessions = new Map<string, PtySession>();
  /** sessionId → 最後に input を送信した socket.id */
  private activeSocketIds = new Map<string, string>();

  setActiveSocket(sessionId: string, socketId: string): void {
    this.activeSocketIds.set(sessionId, socketId);
  }

  getActiveSocket(sessionId: string): string | undefined {
    return this.activeSocketIds.get(sessionId);
  }

  clearActiveSocket(sessionId: string, socketId: string): void {
    if (this.activeSocketIds.get(sessionId) === socketId) {
      this.activeSocketIds.delete(sessionId);
    }
  }

  /** sessionId → (socket.id → その socket の xterm サイズ)。挿入順 = 最後に resize/claim した順 */
  private terminalSizes = new Map<string, Map<string, TerminalSize>>();

  setTerminalSize(sessionId: string, socketId: string, size: TerminalSize): void {
    let sizes = this.terminalSizes.get(sessionId);
    if (!sizes) {
      sizes = new Map();
      this.terminalSizes.set(sessionId, sizes);
    }
    // 末尾に移して「最後に使われた socket」を末尾で表す
    sizes.delete(socketId);
    sizes.set(socketId, size);
  }

  /** socket の登録を外し、残っている socket のうち最後に使われたものを返す */
  removeTerminalSocket(
    sessionId: string,
    socketId: string
  ): { socketId: string; size: TerminalSize } | undefined {
    const sizes = this.terminalSizes.get(sessionId);
    if (!sizes) return undefined;
    sizes.delete(socketId);
    const last = Array.from(sizes.entries()).at(-1);
    if (!last) {
      this.terminalSizes.delete(sessionId);
      return undefined;
    }
    return { socketId: last[0], size: last[1] };
  }

  /**
   * @param unsetKeys 外側 Terminal や DB 由来でも内部ターミナルに渡さない環境変数キー
   *   （例: Ollama タブでは Anthropic の認証トークンを取り除く）
   */
  createSession(
    sessionId: string,
    cwd: string,
    env: Record<string, string> = {},
    unsetKeys: string[] = [],
    options: PtySessionOptions = {}
  ): PtySession {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session already exists: ${sessionId}`);
    }

    const shell = process.env.SHELL || (os.platform() === 'win32' ? 'cmd.exe' : 'bash');

    // tsunagi 自身が注入した環境変数は内部ターミナルに継承しない（TSUNAGI_INJECTED_ENV_KEYS 参照）。
    // /settings 等で明示的に同名キーを設定した場合は env（dbEnv 経由）が後勝ちで上書きするため、
    // カスケードの優先順位・挙動は変わらない。
    const baseEnv = { ...process.env };
    for (const key of TSUNAGI_INJECTED_ENV_KEYS) {
      delete baseEnv[key];
    }
    // 外側 Terminal に元々 NODE_ENV があった場合は復元する。なければ未設定のままにする
    // （tsunagi が強制した 'production' を内部ターミナルに漏らさないため）。
    if (process.env.TSUNAGI_OUTER_NODE_ENV !== undefined) {
      baseEnv.NODE_ENV = process.env.TSUNAGI_OUTER_NODE_ENV;
    }

    const spawnEnv: Record<string, string | undefined> = {
      ...baseEnv,
      ...env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    };
    for (const key of unsetKeys) {
      delete spawnEnv[key];
    }
    addTsunagiPluginDir(spawnEnv);

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: INITIAL_PTY_SIZE.cols,
      rows: INITIAL_PTY_SIZE.rows,
      cwd,
      env: spawnEnv as Record<string, string>,
    });

    const now = Date.now();
    const session: PtySession = {
      pty: ptyProcess,
      sessionId,
      cwd,
      appliedEnv: env,
      appliedUnsetKeys: unsetKeys,
      options,
      envPending: false,
      respawning: false,
      lastInputAt: 0,
      scrollback: [],
      scrollbackSize: 0,
      scrollbackStartSize: INITIAL_PTY_SIZE,
      lastOutputAt: now,
      lastConnectedAt: now,
      gcTimer: null,
    };

    // PTY出力をリングバッファに蓄積
    ptyProcess.onData((data) => {
      session.lastOutputAt = Date.now();
      session.scrollback.push(data);
      session.scrollbackSize += data.length;
      // バッファ上限を超えたら古いものから削除
      while (session.scrollbackSize > SCROLLBACK_MAX_BYTES && session.scrollback.length > 0) {
        const head = session.scrollback.shift()!;
        if (typeof head === 'string') {
          session.scrollbackSize -= head.length;
        } else {
          // サイズ印を捨てる → 残りの先頭はこのサイズで描かれている
          session.scrollbackStartSize = head;
        }
      }
    });

    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId: string): PtySession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * PTY を resize する。サイズが変わったときだけ SIGWINCH が飛び、scrollback にサイズ印を残す。
   * PTY の resize は必ずここを通し、replay が「どの出力がどの幅で描かれたか」を再現できるようにする。
   * @returns 実際にサイズが変わったか
   */
  resizePty(session: PtySession, size: TerminalSize): boolean {
    const { pty: ptyProcess } = session;
    if (ptyProcess.cols === size.cols && ptyProcess.rows === size.rows) return false;
    try {
      ptyProcess.resize(size.cols, size.rows);
    } catch {
      // 終了済みの PTY は無視する
      return false;
    }
    // 直前の印以降に出力が無ければ、その印は不要なので置き換える
    // （ウィンドウのドラッグ中など、出力を挟まず resize が連続しても印が溜まらないようにする）
    const last = session.scrollback.at(-1);
    if (last !== undefined && typeof last !== 'string') {
      session.scrollback[session.scrollback.length - 1] = { cols: size.cols, rows: size.rows };
    } else {
      session.scrollback.push({ cols: size.cols, rows: size.rows });
    }
    return true;
  }

  /**
   * 再接続時の画面復元用に、scrollback を PTY サイズごとの区間に分ける。
   * 末尾の区間は必ず現在の PTY サイズになる（出力が無くても返す）。
   * @param transform 各区間の出力に適用する加工（端末クエリの除去など。区間ごとに join 済みの文字列を渡す）
   */
  getReplaySegments(session: PtySession, transform: (data: string) => string): ReplaySegment[] {
    const segments: ReplaySegment[] = [];
    let size = session.scrollbackStartSize;
    let chunks: string[] = [];
    const flush = () => {
      if (chunks.length > 0) {
        segments.push({ ...size, data: transform(chunks.join('')) });
        chunks = [];
      }
    };
    for (const entry of session.scrollback) {
      if (typeof entry === 'string') {
        chunks.push(entry);
      } else {
        flush();
        size = entry;
      }
    }
    flush();
    const current = { cols: session.pty.cols, rows: session.pty.rows };
    const last = segments.at(-1);
    if (!last || last.cols !== current.cols || last.rows !== current.rows) {
      segments.push({ ...current, data: '' });
    }
    return segments;
  }

  deleteSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.gcTimer) clearInterval(session.gcTimer);

    try {
      session.pty.kill();
    } catch {
      // already dead
    }
    this.sessions.delete(sessionId);
  }

  /**
   * WebSocket接続が切れた際に呼ぶ。
   * 30分間隔のGCインターバルをセットする。
   * 各チェック時点でlastOutputAtが30分以上前であればセッションを削除する。
   * これによりプロセスが動作中（出力あり）の場合はGCされない。
   */
  scheduleGc(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // 既存タイマーをリセット
    if (session.gcTimer) clearInterval(session.gcTimer);

    session.gcTimer = setInterval(() => {
      const s = this.sessions.get(sessionId);
      if (!s) {
        // セッションが既に削除されていればインターバルも止める
        if (session.gcTimer) clearInterval(session.gcTimer);
        return;
      }
      const idleMs = Date.now() - s.lastOutputAt;
      if (idleMs >= SESSION_GC_INTERVAL_MS) {
        console.log(
          `[PtyManager] GC: deleting inactive session ${sessionId} (idle ${Math.floor(idleMs / 60000)}min)`
        );
        this.deleteSession(sessionId);
      } else {
        console.log(
          `[PtyManager] GC check: session ${sessionId} still active (idle ${Math.floor(idleMs / 60000)}min), skipping`
        );
      }
    }, SESSION_GC_INTERVAL_MS);
  }

  /**
   * WebSocket接続が確立した際に呼ぶ。GCインターバルをキャンセルする。
   */
  cancelGc(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.gcTimer) {
      clearInterval(session.gcTimer);
      session.gcTimer = null;
    }
    session.lastConnectedAt = Date.now();
  }

  listSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /** サーバー終了時に全セッションを止める（SIGHUP 任せにせず明示的に kill する） */
  deleteAllSessions(): void {
    for (const sessionId of Array.from(this.sessions.keys())) {
      this.deleteSession(sessionId);
    }
  }
}

export const ptyManager = new PtyManager();

/** 前面にいればシェルのプロンプトとみなすプロセス名（ログインシェルの先頭の `-` は外して比べる） */
const SHELL_NAMES = new Set(['bash', 'zsh', 'sh', 'dash', 'fish', 'ksh']);

/**
 * PTY の前面がシェルか（エージェントなどのコマンドが動いていないか）。
 * 判定できない環境（Windows）では true を返す
 */
export function isShellForeground(session: PtySession): boolean {
  if (os.platform() === 'win32') return true;
  const name = path.basename(session.pty.process).replace(/^-/, '');
  return SHELL_NAMES.has(name) || name === path.basename(process.env.SHELL ?? '');
}
