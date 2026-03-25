import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifySocketIO from 'fastify-socket.io';
import { terminalRoutes } from './routes/terminal.js';
import { hooksRoutes } from './routes/hooks.js';
import { mcpRoutes } from './routes/mcp.js';
import { tasksRoutes } from './routes/tasks.js';
import { editorRoutes } from './routes/editor.js';

const PORT = 2792;

async function start() {
  const fastify = Fastify({ logger: true });

  await fastify.register(fastifyCors, {
    origin: ['http://localhost:2791'],
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  });

  await fastify.register(fastifySocketIO, {
    transports: ['websocket'],
    cors: {
      origin: ['http://localhost:2791'],
    },
  });

  await fastify.register(terminalRoutes);
  await fastify.register(hooksRoutes);
  await fastify.register(mcpRoutes);
  await fastify.register(tasksRoutes);
  await fastify.register(editorRoutes);

  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`Fastify server running on port ${PORT}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
