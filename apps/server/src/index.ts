import net from 'node:net';

import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import httpProxy from '@fastify/http-proxy';
import { Server as SocketIOServer } from 'socket.io';

import { tasksRoutes } from './routes/tasks.js';
import { reposRoutes } from './routes/repos.js';
import { envRoutes } from './routes/env.js';
import { worktreesRoutes } from './routes/worktrees.js';
import { plannerRoutes } from './routes/planner.js';
import { commandsRoutes } from './routes/commands.js';
import { onboardingRoutes } from './routes/onboarding.js';
import { internalRoutes } from './routes/internal.js';
import { hooksRoutes } from './routes/hooks.js';
import { mcpRoutes } from './routes/mcp.js';
import { terminalRoutes } from './routes/terminal.js';
import { editorRoutes } from './routes/editor.js';
import { createBasicAuth } from './basic-auth.js';

// Fastify は単一の公開エンドポイント。Next.js は内部ポートで動かしプロキシする。
const PORT = Number(process.env.PORT) || 2791;
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

async function start() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'error' : 'info'),
    },
  });

  await fastify.register(fastifyCors, {
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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
    // 死んだ接続（スリープ・ネットワーク断等）を早めに検出して、ぶら下がった socket が
    // 保持する PTY の onData/onExit ハンドラを早く解放する。既定 (25s/20s) では検出までに
    // 最大 ~45s かかり、その間ゾンビ socket がリスナーを溜め込み出力が多重化する。
    pingInterval: 15000,
    pingTimeout: 10000,
  });
  fastify.decorate('io', io);

  fastify.get('/health', async () => ({ status: 'ok' }));

  await fastify.register(tasksRoutes, { prefix: '/api' });
  await fastify.register(reposRoutes, { prefix: '/api' });
  await fastify.register(envRoutes, { prefix: '/api' });
  await fastify.register(worktreesRoutes, { prefix: '/api' });
  await fastify.register(plannerRoutes, { prefix: '/api' });
  await fastify.register(commandsRoutes, { prefix: '/api' });
  await fastify.register(onboardingRoutes, { prefix: '/api' });
  await fastify.register(internalRoutes, { prefix: '/api' });
  await fastify.register(hooksRoutes, { prefix: '/api' });
  await fastify.register(mcpRoutes, { prefix: '/api' });
  await fastify.register(terminalRoutes, { prefix: '/api' });
  await fastify.register(editorRoutes, { prefix: '/api' });

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

  const shutdown = async (signal: string) => {
    console.log(`[server] Received ${signal}, shutting down...`);
    await fastify.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
