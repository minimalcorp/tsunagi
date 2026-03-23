import * as pty from 'node-pty';
import * as os from 'os';

const SCROLLBACK_MAX_BYTES = 256 * 1024; // 256KB
const SESSION_GC_TIMEOUT_MS = 30 * 60 * 1000; // 30分

export interface PtySession {
  pty: pty.IPty;
  sessionId: string;
  cwd: string;
  /** PTY出力のリングバッファ（再接続時にまとめて送信） */
  scrollback: string[];
  scrollbackSize: number;
  /** 最後にWebSocket接続があった時刻（GC用） */
  lastConnectedAt: number;
  /** GCタイマー */
  gcTimer: ReturnType<typeof setTimeout> | null;
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

    const session: PtySession = {
      pty: ptyProcess,
      sessionId,
      cwd,
      scrollback: [],
      scrollbackSize: 0,
      lastConnectedAt: Date.now(),
      gcTimer: null,
    };

    // PTY出力をリングバッファに蓄積
    ptyProcess.onData((data) => {
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

    if (session.gcTimer) clearTimeout(session.gcTimer);

    try {
      session.pty.kill();
    } catch {
      // already dead
    }
    this.sessions.delete(sessionId);
  }

  /**
   * WebSocket接続が切れた際に呼ぶ。
   * GCタイマーをセットし、一定時間再接続がなければセッションを削除する。
   */
  scheduleGc(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // 既存タイマーをリセット
    if (session.gcTimer) clearTimeout(session.gcTimer);

    session.gcTimer = setTimeout(() => {
      console.log(`[PtyManager] GC: deleting inactive session ${sessionId}`);
      this.deleteSession(sessionId);
    }, SESSION_GC_TIMEOUT_MS);
  }

  /**
   * WebSocket接続が確立した際に呼ぶ。GCタイマーをキャンセルする。
   */
  cancelGc(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.gcTimer) {
      clearTimeout(session.gcTimer);
      session.gcTimer = null;
    }
    session.lastConnectedAt = Date.now();
  }

  listSessions(): string[] {
    return Array.from(this.sessions.keys());
  }
}

export const ptyManager = new PtyManager();
