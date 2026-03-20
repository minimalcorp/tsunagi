import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import * as os from 'os';
import * as path from 'path';
import { ptyManager } from '../pty-manager';

interface CreateSessionBody {
  cwd?: string;
  env?: Record<string, string>;
}

interface WsMessage {
  type: 'input' | 'resize';
  data?: string;
  cols?: number;
  rows?: number;
}

export async function terminalRoutes(fastify: FastifyInstance) {
  // GET /api/terminal/sessions - セッション一覧（デバッグ用）
  fastify.get('/api/terminal/sessions', async () => {
    return { sessions: ptyManager.listSessions() };
  });

  // POST /api/terminal/sessions - セッション作成
  fastify.post<{ Body: CreateSessionBody }>('/api/terminal/sessions', async (request, reply) => {
    const { cwd, env } = request.body ?? {};

    const sessionId = crypto.randomUUID();
    const workingDir = cwd ?? path.join(os.homedir(), '.tsunagi', 'workspaces');

    try {
      ptyManager.createSession(sessionId, workingDir, env);
      return reply.status(201).send({ sessionId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: message });
    }
  });

  // DELETE /api/terminal/sessions/:sessionId - セッション削除
  fastify.delete<{ Params: { sessionId: string } }>(
    '/api/terminal/sessions/:sessionId',
    async (request, reply) => {
      const { sessionId } = request.params;
      ptyManager.deleteSession(sessionId);
      return reply.status(204).send();
    }
  );

  // WebSocket /api/terminal/sessions/:sessionId/ws - PTY入出力
  fastify.get<{ Params: { sessionId: string } }>(
    '/api/terminal/sessions/:sessionId/ws',
    { websocket: true },
    (socket: WebSocket, request) => {
      const { sessionId } = request.params as { sessionId: string };
      const session = ptyManager.getSession(sessionId);

      if (!session) {
        socket.send(JSON.stringify({ type: 'error', message: `Session not found: ${sessionId}` }));
        socket.close();
        return;
      }

      const { pty: ptyProcess } = session;

      // PTY出力 → クライアントへ送信
      const dataHandler = ptyProcess.onData((data: string) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ type: 'output', data }));
        }
      });

      // PTYプロセス終了 → クライアントへ通知 + セッション削除
      const exitHandler = ptyProcess.onExit(({ exitCode }) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ type: 'exit', exitCode }));
          socket.close();
        }
        ptyManager.deleteSession(sessionId);
      });

      // クライアントからのメッセージ処理
      socket.on('message', (raw: Buffer | string) => {
        let msg: WsMessage;
        try {
          msg = JSON.parse(raw.toString()) as WsMessage;
        } catch {
          return;
        }

        if (msg.type === 'input' && msg.data !== undefined) {
          ptyProcess.write(msg.data);
        } else if (msg.type === 'resize' && msg.cols && msg.rows) {
          ptyProcess.resize(msg.cols, msg.rows);
        }
      });

      // WebSocket切断 → ハンドラ解除（PTYは生かしておく）
      socket.on('close', () => {
        dataHandler.dispose();
        exitHandler.dispose();
      });
    }
  );
}
