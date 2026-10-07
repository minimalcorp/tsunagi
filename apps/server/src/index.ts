import net from 'node:net';

import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import httpProxy from '@fastify/http-proxy';
import { Server as SocketIOServer } from 'socket.io';

import { tasksRoutes } from './routes/tasks.js';
import { reposRoutes } from './routes/repos.js';
import { envRoutes } from './routes/env.js';
import { worktreesRoutes } from './routes/worktrees.js';
import { commandsRoutes } from './routes/commands.js';
import { onboardingRoutes } from './routes/onboarding.js';
import { claudeProfilesRoutes } from './routes/claude-profiles.js';
import { internalRoutes } from './routes/internal.js';
import { hooksRoutes } from './routes/hooks.js';
import { mcpRoutes } from './routes/mcp.js';
import { mcpWebRoutes } from './routes/mcp-web.js';
import { localLlmRoutes } from './routes/local-llm.js';
import { unloadOnShutdown } from './lib/local-llm.js';
import { watchUserSettingsForLocalModel } from './lib/claude-config-guard.js';
import { LOCAL_MODEL_ALIAS } from './lib/local-llm-env.js';
import { terminalRoutes } from './routes/terminal.js';
import { editorRoutes } from './routes/editor.js';
import { whisperRoutes } from './routes/whisper.js';
import { stopWhisperServerOnExit } from './lib/whisper-process.js';
import { settingsRoutes } from './routes/settings.js';
import { versionRoutes } from './routes/version.js';
import { startUpdateCheck, stopUpdateCheck } from './lib/update-check.js';
import { stopAutoUpdate } from './lib/auto-update.js';
import { RESTART_EXIT_CODE, onRestartRequested } from './lib/restart.js';
import { ptyManager } from './pty-manager.js';
import { stopSearxngOnExit, syncSearxng } from './lib/searxng.js';
import { createBasicAuth } from './basic-auth.js';

// Fastify は単一の公開エンドポイント。Next.js は内部ポートで動かしプロキシする。
// PORT ではなく TSUNAGI_SERVER_PORT を見る（apps/cli が注入する専用キー）。generic な PORT を
// 使うと、ユーザーが Terminal で明示的に設定した PORT と衝突し、内部ターミナルへの伝播を
// 区別できなくなるため（pty-manager.ts 参照）。
const PORT = Number(process.env.TSUNAGI_SERVER_PORT) || 2791;
const NEXT_PORT = Number(process.env.TSUNAGI_NEXT_PORT) || 2792;

const extraOrigins = (process.env.TSUNAGI_EXTRA_CORS_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
// 本番(cloudflared 等)は同一オリジンで CORS 不要。dev は Next を 2792 で直接開く
// ため、その origin からの cross-origin リクエストを許可する。
const corsOrigins = [`http://localhost:${NEXT_PORT}`, ...extraOrigins];

// TSUNAGI_BASIC_AUTH_USER / TSUNAGI_BASIC_AUTH_PASSWORD が両方ある時だけ有効。
const basicAuth = createBasicAuth();

const SHUTDOWN_TIMEOUT_MS = 20_000;

async function start() {
  const fastify = Fastify({
    // 終了時に処理中のリクエスト（プロキシ中・ロングポーリング等）も閉じ、close() が待ち続けないようにする
    forceCloseConnections: true,
    logger: {
      level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'error' : 'info'),
    },
  });

  await fastify.register(fastifyCors, {
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await fastify.register(fastifyMultipart, {
    limits: { fileSize: 25 * 1024 * 1024 },
  });

  // Basic 認証（有効時のみ）。CORS の後に登録することで preflight(OPTIONS) は
  // @fastify/cors が先に応答し、認証で弾かれない。
  if (basicAuth) {
    fastify.addHook('onRequest', async (request, reply) => {
      if (basicAuth.isAuthorized(request.headers, request.url, request.socket.remoteAddress)) {
        return;
      }
      reply
        .header('WWW-Authenticate', basicAuth.challenge)
        .code(401)
        .send('Authentication required');
      return reply;
    });
  }

  const io = new SocketIOServer(fastify.server, {
    // polling を許可しておく。iOS Safari/Chrome(WebKit) は Basic 認証のキャッシュ
    // 資格情報を WebSocket ハンドシェイクには付与しない既知の挙動があり、WS のみだと
    // 認証付き公開時に iOS 端末から接続できず "connecting..." のまま固まる。polling は
    // XHR なので Authorization が乗り、認証を通過できる（デスクトップは WS に自動昇格）。
    transports: ['polling', 'websocket'],
    cors: { origin: corsOrigins },
    // Basic 認証（有効時）。polling は XHR、WS はハンドシェイクの Authorization を検証する。
    allowRequest: basicAuth
      ? (req, callback) =>
          callback(null, basicAuth.isAuthorized(req.headers, req.url, req.socket.remoteAddress))
      : undefined,
    // 死んだ接続（スリープ・ネットワーク断等）を検出して、ぶら下がった socket が
    // 保持する PTY の onData/onExit ハンドラを解放する。フォアグラウンド表示中の詰まり検知は
    // クライアント側の能動的なヘルスチェック（TerminalView.tsx の visibilitychange/interval）に
    // 委ね、ここは主にバックグラウンド/スリープ由来のゾンビ socket 検出用。
    // 既定 (25s/20s) より短いが、cloudflared 等のトンネル越しの一時的な詰まりを誤って
    // 切断と判定しないよう、15s/10s よりは緩めている。
    pingInterval: 20000,
    pingTimeout: 15000,
  });
  fastify.decorate('io', io);
  // fastify.close() は upgrade 済みの WebSocket を閉じず、engine.io は http server の close を待って
  // 閉じるため、互いに待ち合って close() が返らない（ブラウザが開いていると再起動が止まる）。先に閉じる
  fastify.addHook('preClose', (done) => {
    io.close();
    done();
  });

  fastify.get('/health', async () => ({ status: 'ok' }));

  await fastify.register(tasksRoutes, { prefix: '/api' });
  await fastify.register(reposRoutes, { prefix: '/api' });
  await fastify.register(envRoutes, { prefix: '/api' });
  await fastify.register(worktreesRoutes, { prefix: '/api' });
  await fastify.register(commandsRoutes, { prefix: '/api' });
  await fastify.register(onboardingRoutes, { prefix: '/api' });
  await fastify.register(claudeProfilesRoutes, { prefix: '/api' });
  await fastify.register(internalRoutes, { prefix: '/api' });
  await fastify.register(hooksRoutes, { prefix: '/api' });
  await fastify.register(mcpRoutes, { prefix: '/api' });
  await fastify.register(mcpWebRoutes, { prefix: '/api' });
  await fastify.register(terminalRoutes, { prefix: '/api' });
  await fastify.register(editorRoutes, { prefix: '/api' });
  await fastify.register(whisperRoutes, { prefix: '/api' });
  await fastify.register(settingsRoutes, { prefix: '/api' });
  await fastify.register(localLlmRoutes, { prefix: '/api' });
  await fastify.register(versionRoutes, { prefix: '/api' });

  // catch-all リバースプロキシ: /api・/socket.io・/health 以外を内部 Next.js へ転送。
  // - /api/* と /health は上で定義済みルートが wildcard より優先される。
  // - /socket.io は Socket.IO が HTTP サーバ層で先取りするためここには来ない。
  // - websocket は false。HMR は下の透過リレーで、Socket.IO は engine.io が終端する。
  // - OPTIONS は除外。@fastify/cors が `OPTIONS *` を登録済みで、proxy が同じ
  //   `OPTIONS /*` を登録すると "Method 'OPTIONS' already declared" で起動失敗する。
  //   preflight は cors が処理するため proxy 側で OPTIONS を扱う必要はない。
  await fastify.register(httpProxy, {
    upstream: `http://localhost:${NEXT_PORT}`,
    prefix: '/',
    websocket: false,
    httpMethods: ['DELETE', 'GET', 'HEAD', 'PATCH', 'POST', 'PUT'],
  });

  // 開発時のみ: Next.js の HMR(WebSocket = /_next/webpack-hmr) を 2791 経由でも
  // 使えるよう透過 TCP リレーする。これにより dev も本番と同じく単一ポート(2791)で
  // 完結し、HMR / API / Socket.IO がすべて同一オリジンで動く。
  //
  // 注意: @fastify/http-proxy の websocket:true は upgrade を Fastify router 経由で
  // ディスパッチするため、/socket.io の upgrade まで catch-all ルートが拾い例外を
  // 投げる（Socket.IO 接続毎にエラーログ）。そのため WS は自前で /_next/webpack-hmr
  // だけを対象にし、/socket.io には一切触れず engine.io に委ねる。
  // 本番(standalone Next)は HMR が無いので何もしない。
  if (process.env.NODE_ENV !== 'production') {
    fastify.server.on('upgrade', (req, socket, head) => {
      if (!req.url?.startsWith('/_next/webpack-hmr')) return;
      if (basicAuth && !basicAuth.isAuthorized(req.headers, req.url, req.socket.remoteAddress)) {
        socket.destroy();
        return;
      }
      const upstream = net.connect(NEXT_PORT, '127.0.0.1', () => {
        upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n`);
        const raw = req.rawHeaders;
        for (let i = 0; i < raw.length; i += 2) {
          upstream.write(`${raw[i]}: ${raw[i + 1]}\r\n`);
        }
        upstream.write('\r\n');
        if (head?.length) upstream.write(head);
        socket.pipe(upstream);
        upstream.pipe(socket);
      });
      upstream.on('error', () => socket.destroy());
      socket.on('error', () => upstream.destroy());
    });
  }

  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`Fastify server running on port ${PORT}`);

  // ローカルLLM（Ollama / LM Studio）が有効ならローカル検索用の SearXNG を起動する。
  // 完了は待たず、失敗しても状態として記録するだけで tsunagi の起動は妨げない
  void syncSearxng();
  // ローカルLLMタブの /model で中継口の名前が既定モデルに保存されたら取り除く
  watchUserSettingsForLocalModel(LOCAL_MODEL_ALIAS);
  // npm に新しいバージョンが公開されたかを定期確認し、Web に通知する
  startUpdateCheck(io);

  let shuttingDown = false;
  const shutdown = async (signal: string, exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] Received ${signal}, shutting down...`);
    // 終了処理がどこかで止まっても終了する。restart は apps/cli の app 側に強制終了がないため必須。
    // unloadOnShutdown の上限（10秒）より長く、app の CHILD_EXIT_TIMEOUT_MS（30秒）より短くする
    setTimeout(() => {
      console.error(`[server] Shutdown timed out after ${SHUTDOWN_TIMEOUT_MS}ms, exiting`);
      process.exit(exitCode);
    }, SHUTDOWN_TIMEOUT_MS).unref();
    stopUpdateCheck();
    stopAutoUpdate();
    // PTY（claude を含む）は SIGHUP 任せにせず、ここで止める
    ptyManager.deleteAllSessions();
    stopWhisperServerOnExit();
    stopSearxngOnExit();
    // 設定で有効なら、ローカルLLMのモデルをメモリから外す（バッテリー・メモリ節約）。
    // 開発時の tsx watch はファイル変更のたびに SIGTERM で再起動するため、その場合は外さない
    if (signal === 'SIGINT' || process.env.NODE_ENV === 'production') {
      await unloadOnShutdown();
    }
    await fastify.close();
    process.exit(exitCode);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  // 更新の適用（POST /api/version/restart）。apps/cli がこの終了コードを見て新しいバージョンで起動し直す
  onRestartRequested(() => {
    io.emit('version:restarting');
    void shutdown('restart', RESTART_EXIT_CODE);
  });
  // SIGINT/SIGTERM を経由しない異常終了時の最後の砦（'exit' は同期処理のみ可能）。
  process.on('exit', () => {
    stopWhisperServerOnExit();
    stopSearxngOnExit();
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
