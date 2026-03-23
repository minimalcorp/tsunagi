import * as pty from 'node-pty';
import * as os from 'os';

const SCROLLBACK_MAX_BYTES = 256 * 1024; // 256KB
const SESSION_GC_INTERVAL_MS = 30 * 60 * 1000; // 30分

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

  createSession(sessionId: string, cwd: string, env?: Record<string, string>): PtySession {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session already exists: ${sessionId}`);
    }

    const shell = process.env.SHELL || (os.platform() === 'win32' ? 'cmd.exe' : 'bash');

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env: {
        ...process.env,
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
