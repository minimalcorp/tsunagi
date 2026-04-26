import { readFile, writeFile } from 'fs/promises';
import type { FastifyInstance } from 'fastify';
import type { Server as SocketIOServer } from 'socket.io';
import { randomUUID } from 'crypto';
import { editorSessionStore } from '../editor-session-store.js';
import { ptyManager } from '../pty-manager.js';

interface FastifyWithIO extends FastifyInstance {
  io: SocketIOServer;
}

export async function editorRoutes(fastify: FastifyInstance) {
  const f = fastify as FastifyWithIO;

  // セッション作成: CLIスクリプトが filePath を送信、サーバーがファイルを読む
  f.post<{ Body: { filePath: string; tabId?: string } }>(
    '/editor/session',
    async (request, reply) => {
      const { filePath, tabId } = request.body;
      if (!filePath) {
        return reply.status(400).send('filePath is required');
      }

      let content = '';
      try {
        content = await readFile(filePath, 'utf8');
      } catch {
        // ファイルが存在しない or 空の場合は空文字で続行
      }

      const sessionId = randomUUID();
      editorSessionStore.set(sessionId, {
        filePath,
        content,
        status: 'pending',
        createdAt: Date.now(),
        tabId: tabId ?? null,
      });

      // tabIdが指定されていれば、最後にinputを送信したソケットにのみ送信
      // （同じtabルームに複数ブラウザタブのソケットが参加している場合の隔離）
      if (tabId) {
        const activeSocketId = ptyManager.getActiveSocket(tabId);
        if (activeSocketId) {
          f.io.to(activeSocketId).emit('editor:open', { sessionId, content });
        } else {
          f.io.to(`tab:${tabId}`).emit('editor:open', { sessionId, content });
        }
      } else {
        f.io.emit('editor:open', { sessionId, content });
      }

      // sessionId のみプレーンテキストで返す（Shell script が JSON パース不要）
      return reply.type('text/plain').send(sessionId);
    }
  );

  // セッション状態取得: CLIスクリプトがポーリングで使用
  // "done" or "pending" をプレーンテキストで返す（Shell script が JSON パース不要）
  f.get<{ Params: { id: string } }>('/editor/session/:id', async (request, reply) => {
    const session = editorSessionStore.get(request.params.id);
    if (!session) {
      return reply.status(404).send('not found');
    }
    return reply.type('text/plain').send(session.status);
  });

  // セッション完了: ブラウザが編集完了時に呼び出す。サーバーがファイルに書き戻す
  f.post<{ Params: { id: string }; Body: { content: string } }>(
    '/editor/session/:id/complete',
    async (request, reply) => {
      const session = editorSessionStore.get(request.params.id);
      if (!session) {
        return reply.status(404).send({ error: 'Session not found' });
      }
      await writeFile(session.filePath, request.body.content, 'utf8');
      session.status = 'done';

      // Ink の <Static> 再 emit を発火させる cols bump はフロントエンド (TerminalView)
      // 側で行う。理由: ユーザー操作の window resize と同等の挙動（xterm と PTY が
      // 同時に新サイズになる）にしたいため。サーバー側で PTY だけ resize すると xterm
      // との dimension mismatch が発生する。

      return reply.send({ ok: true });
    }
  );
}
