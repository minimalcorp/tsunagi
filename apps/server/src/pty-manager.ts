import * as pty from 'node-pty';
import * as os from 'os';

const SCROLLBACK_MAX_BYTES = 256 * 1024; // 256KB
const SESSION_GC_INTERVAL_MS = 30 * 60 * 1000; // 30分

/**
 * apps/cli が Fastify サーバー起動時に自分で注入する環境変数
 * （TSUNAGI_SERVER_PORT, NODE_ENV, TSUNAGI_NEXT_PORT, TSUNAGI_OUTER_NODE_ENV）。
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
];

export interface PtySession {
  pty: pty.IPty;
  sessionId: string;
  cwd: string;
  /** PTY出力のリングバッファ（再接続時にまとめて送信） */
  scrollback: string[];
  scrollbackSize: number;
  /** 最後にPTY出力があった時刻（GC判定用） */
  lastOutputAt: number;
  /** 最後にWebSocket接続があった時刻 */
  lastConnectedAt: number;
  /** GCインターバルタイマー */
  gcTimer: ReturnType<typeof setInterval> | null;
}

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

  createSession(sessionId: string, cwd: string, env?: Record<string, string>): PtySession {
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

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env: {
        ...baseEnv,
        ...env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      } as Record<string, string>,
    });

    const now = Date.now();
    const session: PtySession = {
      pty: ptyProcess,
      sessionId,
      cwd,
      scrollback: [],
      scrollbackSize: 0,
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
        session.scrollbackSize -= session.scrollback[0].length;
        session.scrollback.shift();
      }
    });

    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId: string): PtySession | undefined {
    return this.sessions.get(sessionId);
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
}

export const ptyManager = new PtyManager();
