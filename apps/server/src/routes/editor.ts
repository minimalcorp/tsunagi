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

      // Ink の <Static>（Claude の welcome splash や会話履歴など）は emit-once 設計で、
      // $EDITOR から復帰した後の通常 rerender では再 emit されず、画面から消えてしまう。
      // Claude 2.1.119 では cols 変更の SIGWINCH でも Static は再 emit されないため、
      // 代わりにユーザーによる実キーストロークを模倣して Ink の input-driven rerender を
      // 発火させる: "/" で slash-command menu を開いて即 backspace で閉じる。
      // menu open/close の state 遷移で Ink が full frame emit を行い Static が復帰する。
      //
      // - 300ms 遅延: sh の polling(最大100ms) + exit + claude foreground 復帰 を待つ
      // - 50ms 間隔: `/` 処理後に slash menu が開いた状態で backspace を送る
      // - net: 入力欄は元の状態に戻る（`/` を打って消したのと同じ）
      if (session.tabId) {
        const ptySession = ptyManager.getSession(session.tabId);
        if (ptySession) {
          setTimeout(() => {
            ptySession.pty.write('/');
            setTimeout(() => {
              ptySession.pty.write('\x7f'); // DEL (backspace)
            }, 50);
          }, 300);
        }
      }

      return reply.send({ ok: true });
    }
  );
}
