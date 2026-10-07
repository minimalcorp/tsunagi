import type { FastifyInstance } from 'fastify';
import type { Server as SocketIOServer } from 'socket.io';
import type { TabMode } from '@minimalcorp/tsunagi-shared';
import { ptyManager, type PtySession } from '../pty-manager.js';
import { prisma } from '../lib/db.js';
import { ensureActiveLoaded } from '../lib/local-llm.js';
import { buildClaudeCommand, isLocalLlmMode } from '../lib/claude-command.js';
import {
  PtyLaunchError,
  prepareClaudeConfigForSession,
  resolvePtyLaunch,
  startPtySession,
} from '../lib/pty-launch.js';
import { getEnvPending, initPtyEnvSync, respawnSessionNow } from '../lib/pty-env-sync.js';

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

/**
 * 表示中のクライアントがいなくなった PTY の cols をこの幅に縮める。
 * 一定の幅を下回ると Claude(Ink) が full-frame redraw を行い <Static> を再 emit するという
 * 観測に基づくしきい値。元 cols が既にこの値の場合のみ -1 にして必ず cols を変化させる。
 *
 * 再表示時は replay 後にクライアントが実サイズへ resize するため、必ず cols が変わり
 * SIGWINCH が飛んで Claude が現在の画面を描き直す（同一サイズの resize は no-op で
 * SIGWINCH が飛ばない）。縮める処理を切断時に済ませておくことで、縮めた時の再描画が
 * 再表示より前に scrollback に入り、replay と描き直しの順序がタイミングに依存しない。
 */
const REDRAW_BUMP_COLS = 64;

function bumpColsForRedraw(session: PtySession): void {
  const { pty: ptyProcess } = session;
  const cols = ptyProcess.cols === REDRAW_BUMP_COLS ? REDRAW_BUMP_COLS - 1 : REDRAW_BUMP_COLS;
  try {
    ptyProcess.resize(cols, ptyProcess.rows);
  } catch {
    // 終了済みの PTY は無視する
  }
}

interface CreateSessionBody {
  cwd?: string;
  env?: Record<string, string>;
  /** 指定した場合そのIDをセッションIDとして使用する（tab_idと一致させる） */
  sessionId?: string;
  /**
   * PTY起動後にシェルへ書き込むコマンド文字列。
   * 例: "claude --session-id <uuid>\n"
   * 末尾に \n がない場合は自動付加する。
   */
  command?: string;
  /**
   * true なら PTY 起動後に claude を起動する。コマンドはタブの mode に応じてサーバーで組み立てる
   * （ローカルLLMタブは MCP の絞り込み等の引数が付く）。command より優先する。
   */
  claude?: boolean;
}

export async function terminalRoutes(fastify: FastifyInstance) {
  const io = (fastify as FastifyWithIO).io;
  // 作成中のセッション（sessionId → 作成処理）。存在確認から PTY 作成までの間に await を挟むため、
  // 同じ sessionId の作成要求が並行すると両方が存在確認を通過し、後発が "Session already exists" で
  // 失敗する（開発時の StrictMode による effect の二重実行で必ず起きる）。後発は作成中の処理を待って
  // 再利用として返す。
  const pendingCreations = new Map<string, Promise<void>>();
  initPtyEnvSync(io);

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
      // 環境変数の変更が未反映ならクライアントに伝える（反映待ちバッジ）
      socket.emit('env-pending', { sessionId, pending: getEnvPending(sessionId) });

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

      // リングバッファの内容を一括送信（画面復元）。初回接続・再接続を問わず join のたびに送る。
      // クライアントは replay を受けたら画面をクリアし、xterm を PTY と同じサイズにしてから
      // 書き込み、完了後に実サイズへ resize する（新規セッションは data が空）。
      // 端末クエリ列（ESC[?6n / ESC[c 等）を除去してから replay する。
      // これを怠ると xterm.js が応答を生成し PTY へ注入され、入力欄に "1;2c64;3R..." が
      // 勝手に入力される（stripTerminalQueries のコメント参照）。
      const buffered = isReused ? stripTerminalQueries(session.scrollback.join('')) : '';
      socket.emit('replay', {
        // 末尾の \r\n / \n / \r をトリムする。
        data: buffered.replace(/[\r\n]+$/, ''),
        cols: ptyProcess.cols,
        rows: ptyProcess.rows,
      });

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
        // 環境変数の反映のための作り直し（pty-env-sync）。新しい PTY が同じ sessionId で
        // 既に動いているため、終了扱い・セッション削除はしない
        if (session.respawning) return;
        io.to(room).emit('exit', { exitCode });
        // Ctrl+C等でClaudeが強制終了した場合にclaudeStatusをidleにリセット
        // todos は残す（Claude 側の Task はセッションに永続化され、--resume 後も続きから使われる）
        io.to(room).emit('status-changed', { sessionId, status: 'idle' });
        prisma.tab
          .updateMany({
            where: { tabId: sessionId },
            data: { status: 'idle' },
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
        session.lastInputAt = Date.now();
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
          // 次に表示されたとき Claude に描き直させるため、表示中のクライアントがいない間に
          // cols を縮めておく（REDRAW_BUMP_COLS 参照）
          const session = ptyManager.getSession(boundSessionId);
          if (session) bumpColsForRedraw(session);
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
    const { cwd, env, sessionId: requestedSessionId, claude, command } = request.body ?? {};

    const sessionId = requestedSessionId ?? crypto.randomUUID();

    // 既存セッションが生きていれば再利用
    const existing = ptyManager.getSession(sessionId);
    if (existing) {
      fastify.log.info({ sessionId }, 'Reusing existing PTY session');
      return reply.status(200).send({ sessionId, reused: true });
    }

    const pending = pendingCreations.get(sessionId);
    const creation =
      pending ??
      (async () => {
        const launchRequest = { cwd, env };
        const launch = await resolvePtyLaunch(sessionId, launchRequest);
        await startPtySession(sessionId, launch, {
          request: launchRequest,
          launchClaude: Boolean(claude),
          command,
        });
      })();
    if (!pending) {
      pendingCreations.set(sessionId, creation);
      void creation.catch(() => undefined).finally(() => pendingCreations.delete(sessionId));
    }

    try {
      await creation;
      if (pending) {
        fastify.log.info({ sessionId }, 'Reusing PTY session created by a concurrent request');
        return reply.status(200).send({ sessionId, reused: true });
      }
      return reply.status(201).send({ sessionId, reused: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof PtyLaunchError) {
        fastify.log.warn({ sessionId, err: message }, 'Failed to launch PTY');
        return reply.status(err.statusCode).send({ error: message });
      }
      return reply.status(500).send({ error: message });
    }
  });

  // POST /terminal/sessions/:sessionId/claude - 既存 PTY で claude を（再）起動する
  // コマンドはタブの mode に応じてサーバーで組み立てる（ローカルLLMタブは引数が付くため）
  fastify.post<{ Params: { sessionId: string } }>(
    '/terminal/sessions/:sessionId/claude',
    async (request, reply) => {
      const { sessionId } = request.params;
      const session = ptyManager.getSession(sessionId);
      if (!session) {
        return reply.status(404).send({ error: 'Session not found' });
      }
      const tab = await prisma.tab.findUnique({ where: { tabId: sessionId } }).catch(() => null);
      const mode = (tab?.mode ?? 'claude') as TabMode;
      if (isLocalLlmMode(mode)) {
        // 最初の発言を待たせないよう読み込みを始めておく（未設定等のエラーは中継口がタブに返す）
        ensureActiveLoaded().catch(() => undefined);
      }
      let command: string;
      try {
        command = await buildClaudeCommand(sessionId, mode);
      } catch (err) {
        return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
      }
      // 環境変数の反映で PTY を作り直したときも claude を起動し直す
      session.options.launchClaude = true;
      await prepareClaudeConfigForSession(session);
      session.pty.write(`${command}\n`);
      return reply.status(204).send();
    }
  );

  // POST /terminal/sessions/:sessionId/respawn - 環境変数の変更を今すぐ反映する（PTY を作り直す）
  fastify.post<{ Params: { sessionId: string } }>(
    '/terminal/sessions/:sessionId/respawn',
    async (request, reply) => {
      const ok = await respawnSessionNow(request.params.sessionId);
      if (!ok) return reply.status(404).send({ error: 'Session not found' });
      return reply.status(204).send();
    }
  );

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
