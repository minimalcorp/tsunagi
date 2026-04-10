import Fastify, { type FastifyPluginAsync, type FastifyPluginOptions } from 'fastify';
import fastifyCors from '@fastify/cors';
import * as fastifySocketIONs from 'fastify-socket.io';
const fastifySocketIO = ((
  fastifySocketIONs as unknown as {
    default?: FastifyPluginAsync<FastifyPluginOptions>;
  }
).default ??
  (fastifySocketIONs as unknown as FastifyPluginAsync<FastifyPluginOptions>)) as FastifyPluginAsync<FastifyPluginOptions>;

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

const PORT = 2792;

async function start() {
  const fastify = Fastify({ logger: true });

  await fastify.register(fastifyCors, {
    origin: ['http://localhost:2791'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await fastify.register(fastifySocketIO, {
    transports: ['websocket'],
    cors: {
      origin: ['http://localhost:2791'],
    },
  });

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
