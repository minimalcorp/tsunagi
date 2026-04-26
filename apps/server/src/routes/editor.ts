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
      // ユーザー操作で「ブラウザ window を 1 文字分 resize」したケースでは Static を含む
      // フレーム全体が再 emit され、それなりに適切な見た目に復帰することが分かっている。
      // /complete 後に同等の SIGWINCH を発火させるため、PTY を cols-1 に bump → 元 cols
      // に戻す。
      // cols+1 ではなく cols-1 を使う理由: bump 中は PTY 側が xterm より狭くなるだけで
      // 出力は必ず xterm 幅に収まる。逆に cols+1 だと bump 中に Claude が xterm より
      // 広い行を出力し、xterm 側で wrap → 余計なスクロールを誘発する。
      // 別案として `/` + backspace を PTY に注入する方法もあるが、`/` は空入力先頭で
      // slash-command menu を起動する一方、文字入力済みの状況では単なる文字挿入として
      // 扱われ、期待する full-frame rerender が発火しないため不採用。
      //
      // - 300ms 遅延: sh の polling(最大100ms) + exit + claude foreground 復帰 を待つ
      // - 100ms 間隔: Ink の re-layout 完了後に元の cols に戻す
      if (session.tabId) {
        const ptySession = ptyManager.getSession(session.tabId);
        if (ptySession) {
          const { cols, rows } = ptySession.pty;
          // cols が 1 以下のときは bump できない（resize(0, ...) は無効）。実用上ほぼ
          // 起き得ないが安全側に倒して何もしない。
          if (cols > 1) {
            setTimeout(() => {
              ptySession.pty.resize(cols - 1, rows);
              setTimeout(() => {
                ptySession.pty.resize(cols, rows);
              }, 100);
            }, 300);
          }
        }
      }

      return reply.send({ ok: true });
    }
  );
}
