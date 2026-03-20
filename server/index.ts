import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import { terminalRoutes } from './routes/terminal';

const PORT = 2792;

async function start() {
  const fastify = Fastify({ logger: true });

  await fastify.register(fastifyCors, {
    origin: ['http://localhost:2791'],
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  });

  await fastify.register(fastifyWebsocket);
  await fastify.register(terminalRoutes);

  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`Fastify server running on port ${PORT}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
