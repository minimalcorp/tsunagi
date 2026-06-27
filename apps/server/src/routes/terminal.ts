import type { FastifyInstance } from 'fastify';
import type { Server as SocketIOServer } from 'socket.io';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ptyManager } from '../pty-manager.js';
import { prisma } from '../lib/db.js';

// サーバーはプロジェクトルートから起動されるため process.cwd() でルートを取得
const TSUNAGI_EDITOR_PATH = path.resolve(process.cwd(), 'scripts/monaco-editor.sh');

// Fastify(API) の公開ポート。index.ts と同じ既定値。monaco-editor.sh など PTY 内の
// プロセスが API を叩く際の同一ホスト向けベース URL に使う。
const SERVER_PORT = Number(process.env.PORT) || 2791;

interface FastifyWithIO extends FastifyInstance {
  io: SocketIOServer;
}

/**
 * 再接続時の画面復元用 scrollback から「端末への問い合わせ（クエリ）」シーケンスを除去する。
 *
 * Claude(Ink) は描画中に DECXCPR(ESC[?6n) や DA(ESC[c) を大量に出力する。これらは生の
 * まま scrollback に蓄積される。再接続時に scrollback をそのまま replay すると、xterm.js が
 * 「今ホストから来たクエリ」と誤認して応答を生成し（deviceStatusPrivate / sendDeviceAttributes →
 * triggerDataEvent）、その応答が onData → emit('input') → PTY へ注入される。
 * 結果、シェルや Claude の入力欄に "1;2c64;3R64;3R..."（DA応答 ESC[?1;2c / CPR応答 ESC[?r;cR の
 * 可視部）が勝手に入力される。
 *
 * クエリ列は視覚出力を持たないため、replay からは除去して構わない（画面復元は壊れない）。
 * 対象は CSI ... n（DSR系: ESC[?6n / ESC[6n / ESC[5n）と CSI ... c（DA系: ESC[c / ESC[0c /
 * ESC[>c）。チャンク境界を跨ぐクエリ列を取りこぼさないよう、必ず scrollback を join した
 * 後の文字列に適用する。
 *
 * 注意: ライブ出力（onData 経由の emit('output')）には適用しない。動作中の Claude が正当に
 * 要求しているクエリへの応答は PTY に返す必要があるため、除去は replay 限定とする。
 */
function stripTerminalQueries(s: string): string {
  return s
    .replace(/\x1b\[[?>]?[0-9;]*n/g, '') // DSR: ESC[?6n(主犯) / ESC[6n / ESC[5n など
    .replace(/\x1b\[[?>=]?[0-9;]*c/g, ''); // DA: ESC[c / ESC[0c / ESC[>c / ESC[=c
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

    // join: roomに参加する。
    // - mode='terminal': PTY の入出力を接続する。TerminalView 用。明示指定が必須。
    // - mode='subscribe'（既定。mode 省略・不明値もここに含む）: status-changed /
    //   todos-updated のブロードキャスト受信のみ。PTY IO は接続しない。
    //   タスク一覧 / プランナーの購読 hook 用。PTY が未起動でも参加できる。
    socket.on('join', ({ room, mode }: { room: string; mode?: 'terminal' | 'subscribe' }) => {
      const sessionId = room.startsWith('tab:') ? room.slice(4) : room;

      // PTY バインドは mode==='terminal' を明示した socket のみ。
      // mode 省略・不明な値はすべて購読扱いにし、PTY IO を絶対に接続しない。
      // （購読 hook の join が mode 省略で誤って PTY バインドし、input/onData/exit
      //   ハンドラ登録や GC 干渉で入力多重化を招く事故を構造的に防ぐ）
      // 購読のみ: room メンバーシップだけ付与して終了。boundSessionId もセットしない
      // （disconnect 時に他人のセッションへ GC を仕掛けないため）。
      if (mode !== 'terminal') {
        socket.join(room);
        return;
      }

      boundSessionId = sessionId;

      const session = ptyManager.getSession(sessionId);
      if (!session) {
        socket.emit('error', { message: `Session not found: ${sessionId}` });
        return;
      }

      // 同一 socket が複数回 join した場合に、前回登録した PTY ハンドラ・input/resize
      // リスナーを必ず解放してから張り直す。これを怠ると ptyProcess.onData が多重登録され
      // 出力が多重 emit され、input ハンドラの多重化で 1 入力が複数回 PTY へ書き込まれる。
      dataHandlerDispose?.();
      exitHandlerDispose?.();
      dataHandlerDispose = null;
      exitHandlerDispose = null;
      socket.removeAllListeners('resize');
      socket.removeAllListeners('input');

      socket.join(room);

      // 接続確立 → GCタイマーをキャンセル
      ptyManager.cancelGc(sessionId);

      // この socket を PTY の所有者(active socket)にする。input の書き込みは所有者の
      // socket からのみ許可し（下記 input ハンドラのゲート参照）、複数 socket が同一 PTY に
      // バインドしても 1 キーストロークが多重書き込みされないことを構造的に保証する。
      const prevOwner = ptyManager.getActiveSocket(sessionId);
      if (prevOwner && prevOwner !== socket.id) {
        console.log(
          `[terminal] session ${sessionId}: owner ${prevOwner} -> ${socket.id} (previous terminal socket still bound)`
        );
      }
      ptyManager.setActiveSocket(sessionId, socket.id);

      const { pty: ptyProcess } = session;
      const isReused = session.scrollback.length > 0;

      // リングバッファの内容を一括送信（再接続時の画面復元）
      if (isReused) {
        // 端末クエリ列（ESC[?6n / ESC[c 等）を除去してから replay する。
        // これを怠ると xterm.js が応答を生成し PTY へ注入され、入力欄に "1;2c64;3R..." が
        // 勝手に入力される（stripTerminalQueries のコメント参照）。
        const buffered = stripTerminalQueries(session.scrollback.join(''));
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
        // Ctrl+C等でClaudeが強制終了した場合にclaudeStatusをidleにリセット、todosをクリア
        io.to(room).emit('status-changed', { sessionId, status: 'idle' });
        io.to(room).emit('todos-updated', { sessionId, todos: [] });
        prisma.tab
          .updateMany({
            where: { tabId: sessionId },
            data: { status: 'idle', todos: '[]' },
          })
          .catch(() => {
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

      // input イベント: 所有者 socket からの入力のみ PTY へ書き込む。
      // ゾンビ/非所有 socket（再接続前の旧 socket・誤バインド socket 等）からの重複 input は
      // 破棄し、1 キーストロークの多重書き込み（例: /clear が連続入力される）を防ぐ。
      socket.on('input', ({ sessionId: sid, data }: { sessionId: string; data: string }) => {
        if (sid !== sessionId) return;
        if (ptyManager.getActiveSocket(sessionId) !== socket.id) return;
        ptyProcess.write(data);
      });
    });

    // leave: room から退出（status/todos hook がタブ購読を解除する際に emit する）
    socket.on('leave', ({ room }: { room: string }) => {
      socket.leave(room);
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
        // 所有者だった socket の切断時のみ GC をスケジュールする。
        // 再接続で新しい socket が既に所有者になっている場合や、ゾンビ/非所有 socket の
        // 遅延切断では GC を張らない（現役セッションが誤って GC 対象になるのを防ぐ）。
        const wasOwner = ptyManager.getActiveSocket(boundSessionId) === socket.id;
        ptyManager.clearActiveSocket(boundSessionId, socket.id);
        if (wasOwner) {
          ptyManager.scheduleGc(boundSessionId);
        }
      }
    });
  });

  // GET /terminal/sessions - セッション一覧（デバッグ用）
  fastify.get('/terminal/sessions', async () => {
    return { sessions: ptyManager.listSessions() };
  });

  // POST /terminal/sessions - セッション作成（または既存セッション再利用）
  fastify.post<{ Body: CreateSessionBody }>('/terminal/sessions', async (request, reply) => {
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
        // monaco-editor.sh が API(Fastify) を叩くためのベース URL。サーバーと同一
        // ホストなので localhost。単一ポート化で API は SERVER_PORT(既定 2791)。
        TSUNAGI_API_BASE: `http://localhost:${SERVER_PORT}`,
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

  // DELETE /terminal/sessions/:sessionId - セッション明示削除（PTY kill）
  fastify.delete<{ Params: { sessionId: string } }>(
    '/terminal/sessions/:sessionId',
    async (request, reply) => {
      const { sessionId } = request.params;
      ptyManager.deleteSession(sessionId);
      return reply.status(204).send();
    }
  );

  // GET /terminal/sessions/:sessionId/scrollback - リングバッファ内容をdump（デバッグ用）
  fastify.get<{ Params: { sessionId: string } }>(
    '/terminal/sessions/:sessionId/scrollback',
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
