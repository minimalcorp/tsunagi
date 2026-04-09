import type { FastifyInstance } from 'fastify';
import type { Server as SocketIOServer } from 'socket.io';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ptyManager } from '../pty-manager.js';
import { prisma } from '../lib/db.js';

// サーバーはプロジェクトルートから起動されるため process.cwd() でルートを取得
const TSUNAGI_EDITOR_PATH = path.resolve(process.cwd(), 'scripts/monaco-editor.sh');

interface FastifyWithIO extends FastifyInstance {
  io: SocketIOServer;
}

interface CreateSessionBody {
  cwd?: string;
  env?: Record<string, string>;
  /** 指定した場合そのIDをセッションIDとして使用する（tab_idと一致させる） */
  sessionId?: string;
  /** settings.local.json を生成するworktreeパス */
  worktreePath?: string;
  /**
   * PTY起動後にシェルへ書き込むコマンド文字列。
   * 例: "claude --session-id <uuid>\n"
   * 末尾に \n がない場合は自動付加する。
   */
  command?: string;
}

export async function terminalRoutes(fastify: FastifyInstance) {
  const io = (fastify as FastifyWithIO).io;

  // socket.io イベントハンドラ
  io.on('connection', (socket) => {
    let boundSessionId: string | null = null;
    let dataHandlerDispose: (() => void) | null = null;
    let exitHandlerDispose: (() => void) | null = null;

    // join: roomに参加してPTYセッションと接続
    socket.on('join', ({ room }: { room: string }) => {
      const sessionId = room.startsWith('tab:') ? room.slice(4) : room;
      boundSessionId = sessionId;

      const session = ptyManager.getSession(sessionId);
      if (!session) {
        socket.emit('error', { message: `Session not found: ${sessionId}` });
        return;
      }

      socket.join(room);

      // 接続確立 → GCタイマーをキャンセル
      ptyManager.cancelGc(sessionId);

      const { pty: ptyProcess } = session;
      const isReused = session.scrollback.length > 0;

      // リングバッファの内容を一括送信（再接続時の画面復元）
      if (isReused) {
        const buffered = session.scrollback.join('');
        // 末尾の \r\n / \n / \r をトリムする。
        const trimmed = buffered.replace(/[\r\n]+$/, '');
        socket.emit('output', { data: trimmed });
      }

      // reused の場合、最初の resize まで onData 出力をバッファリング
      let initialResizeHandled = !isReused;
      const pendingOutput: string[] = [];

      // PTY出力 → このsocketのみに送信（io.to(room)だと同一PTYに複数socket接続時に重複するため）
      const dataHandler = ptyProcess.onData((data: string) => {
        if (!initialResizeHandled) {
          pendingOutput.push(data);
          return;
        }
        socket.emit('output', { data });
      });
      dataHandlerDispose = () => dataHandler.dispose();

      // PTYプロセス終了 → room全体に通知（全接続クライアントに終了を伝える）+ セッション削除
      const exitHandler = ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
        io.to(room).emit('exit', { exitCode });
        // Ctrl+C等でClaudeが強制終了した場合にclaudeStatusをidleにリセット
        io.to(room).emit('status-changed', { sessionId, status: 'idle' });
        fetch(`http://localhost:2791/api/internal/tabs/${sessionId}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'idle' }),
        }).catch(() => {
          /* DB更新失敗は無視 */
        });
        ptyManager.deleteSession(sessionId);
      });
      exitHandlerDispose = () => exitHandler.dispose();

      // resize イベント: PTYリサイズ
      socket.on(
        'resize',
        ({ sessionId: sid, cols, rows }: { sessionId: string; cols: number; rows: number }) => {
          if (sid !== sessionId) return;
          ptyProcess.resize(cols, rows);

          // reused時: 初回 resize 後にバッファリングしていた出力をフラッシュ
          if (!initialResizeHandled) {
            initialResizeHandled = true;
            if (pendingOutput.length > 0) {
              const flushed = pendingOutput.join('');
              pendingOutput.length = 0;
              socket.emit('output', { data: flushed });
            }
          }
        }
      );

      // input イベント: PTYへ書き込み + アクティブソケット追跡
      socket.on('input', ({ sessionId: sid, data }: { sessionId: string; data: string }) => {
        if (sid !== sessionId) return;
        ptyManager.setActiveSocket(sessionId, socket.id);
        ptyProcess.write(data);
      });
    });

    // health-check: クライアントからの接続生死確認に即応答
    socket.on('health-check', () => {
      socket.emit('health-check-ack');
    });

    // disconnect → ハンドラ解除・アクティブソケットクリア・GCタイマーセット
    socket.on('disconnect', () => {
      dataHandlerDispose?.();
      exitHandlerDispose?.();
      if (boundSessionId) {
        ptyManager.clearActiveSocket(boundSessionId, socket.id);
        ptyManager.scheduleGc(boundSessionId);
      }
    });
  });

  // GET /api/terminal/sessions - セッション一覧（デバッグ用）
  fastify.get('/api/terminal/sessions', async () => {
    return { sessions: ptyManager.listSessions() };
  });

  // POST /api/terminal/sessions - セッション作成（または既存セッション再利用）
  fastify.post<{ Body: CreateSessionBody }>('/api/terminal/sessions', async (request, reply) => {
    const { cwd, env, sessionId: requestedSessionId, command } = request.body ?? {};

    const sessionId = requestedSessionId ?? crypto.randomUUID();
    const defaultDir = path.join(os.homedir(), '.tsunagi', 'workspaces');
    let workingDir = cwd ?? defaultDir;

    // cwd が存在するか確認、なければデフォルトにフォールバック
    try {
      await fs.access(workingDir);
    } catch {
      fastify.log.warn({ workingDir }, 'cwd does not exist, falling back to default');
      workingDir = defaultDir;
    }
    // デフォルトディレクトリが存在しない場合も作成する
    await fs.mkdir(workingDir, { recursive: true });

    // 既存セッションが生きていれば再利用
    const existing = ptyManager.getSession(sessionId);
    if (existing) {
      fastify.log.info({ sessionId }, 'Reusing existing PTY session');
      return reply.status(200).send({ sessionId, reused: true });
    }

    try {
      // DBからglobal環境変数を取得（有効なもののみ）
      const globalEnv: Record<string, string> = {};
      try {
        const globalEnvVars = await prisma.environmentVariable.findMany({
          where: { scope: 'global', enabled: true },
        });
        globalEnvVars.forEach((e: { key: string; value: string }) => {
          globalEnv[e.key] = e.value;
        });
        fastify.log.info({ count: globalEnvVars.length }, 'Loaded global env vars');
      } catch (err) {
        fastify.log.warn({ err }, 'Failed to load global env vars');
      }

      // 優先順位: リクエストで渡されたenv > DBのglobal env > tsunagi独自のEDITOR設定
      // tsunagi-editor.sh をデフォルトにすることで Ctrl+G が Monaco Modal を開く。
      // DB / リクエストで EDITOR が明示設定されている場合はそちらが優先される。
      const tsunagiDefaultEnv: Record<string, string> = {
        EDITOR: TSUNAGI_EDITOR_PATH,
        TSUNAGI_SESSION_ID: sessionId,
      };
      const mergedEnv = { ...tsunagiDefaultEnv, ...globalEnv, ...env };

      const session = ptyManager.createSession(sessionId, workingDir, mergedEnv);

      // コマンドが指定されていればPTY起動後にシェルへ書き込む
      if (command) {
        const cmd = command.endsWith('\n') ? command : command + '\n';
        // シェルの初期化（プロンプト表示）を待つため少し遅延させて書き込む
        setTimeout(() => {
          session.pty.write(cmd);
        }, 300);
      }

      return reply.status(201).send({ sessionId, reused: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: message });
    }
  });

  // DELETE /api/terminal/sessions/:sessionId - セッション明示削除（PTY kill）
  fastify.delete<{ Params: { sessionId: string } }>(
    '/api/terminal/sessions/:sessionId',
    async (request, reply) => {
      const { sessionId } = request.params;
      ptyManager.deleteSession(sessionId);
      return reply.status(204).send();
    }
  );

  // GET /api/terminal/sessions/:sessionId/scrollback - リングバッファ内容をdump（デバッグ用）
  fastify.get<{ Params: { sessionId: string } }>(
    '/api/terminal/sessions/:sessionId/scrollback',
    async (request, reply) => {
      const { sessionId } = request.params;
      const session = ptyManager.getSession(sessionId);
      if (!session) {
        return reply.status(404).send({ error: 'Session not found' });
      }
      const raw = session.scrollback.join('');
      // 制御文字を可視化して返す
      const visible = raw.replace(/\x1b/g, '<ESC>').replace(/\r/g, '<CR>').replace(/\n/g, '<LF>\n');
      return reply.send({
        sessionId,
        chunks: session.scrollback.length,
        sizeBytes: session.scrollbackSize,
        raw: Buffer.from(raw).toString('base64'),
        visible,
      });
    }
  );
}
