import * as pty from 'node-pty';
import * as os from 'os';

export interface PtySession {
  pty: pty.IPty;
  sessionId: string;
  cwd: string;
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

    const session: PtySession = { pty: ptyProcess, sessionId, cwd };
    this.sessions.set(sessionId, session);

    return session;
  }

  getSession(sessionId: string): PtySession | undefined {
    return this.sessions.get(sessionId);
  }

  deleteSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      session.pty.kill();
    } catch {
      // already dead
    }
    this.sessions.delete(sessionId);
  }

  listSessions(): string[] {
    return Array.from(this.sessions.keys());
  }
}

export const ptyManager = new PtyManager();
