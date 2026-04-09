import type { FastifyInstance } from 'fastify';
import type { Server as SocketIOServer } from 'socket.io';
import { prisma } from '../lib/db.js';

interface FastifyWithIO extends FastifyInstance {
  io: SocketIOServer;
}

export async function internalRoutes(fastify: FastifyInstance) {
  const io = (fastify as FastifyWithIO).io;

  // POST /internal/tabs/:tab_id/status
  fastify.post<{
    Params: { tab_id: string };
    Body: { status: string; todos?: unknown[] };
  }>('/internal/tabs/:tab_id/status', async (request, reply) => {
    const { tab_id } = request.params;
    const { status, todos } = request.body;

    if (!status) {
      return reply.status(400).send({ error: 'status is required' });
    }

    const result = await prisma.tab.updateMany({
      where: { tabId: tab_id },
      data: {
        status,
        ...(todos !== undefined && { todos: JSON.stringify(todos) }),
      },
    });

    if (result.count === 0) {
      return reply.status(404).send({ error: 'Tab not found' });
    }

    return reply.status(200).send({ data: { tabId: tab_id, status } });
  });

  // GET /internal/tabs/:tab_id/todos
  fastify.get<{ Params: { tab_id: string } }>(
    '/internal/tabs/:tab_id/todos',
    async (request, reply) => {
      const { tab_id } = request.params;

      try {
        const tab = await prisma.tab.findUnique({
          where: { tabId: tab_id },
          select: { todos: true },
        });

        if (!tab) {
          return reply.status(404).send({ error: 'Tab not found' });
        }

        const todos = tab.todos ? JSON.parse(tab.todos) : [];
        return reply.status(200).send({ data: { todos } });
      } catch (error) {
        fastify.log.error(error, 'Failed to get tab todos');
        return reply.status(500).send({ error: 'Failed to get todos' });
      }
    }
  );

  // POST /internal/emit-status
  fastify.post<{ Body: { sessionId: string; status: string } }>(
    '/internal/emit-status',
    async (request, reply) => {
      const { sessionId, status } = request.body;
      if (!sessionId || !status) {
        return reply.status(400).send({ error: 'sessionId and status are required' });
      }
      const room = `tab:${sessionId}`;
      io.to(room).emit('status-changed', { sessionId, status });
      return reply.status(200).send({ ok: true });
    }
  );
}
