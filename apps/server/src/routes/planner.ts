import * as os from 'os';
import * as path from 'path';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/db.js';

export async function plannerRoutes(fastify: FastifyInstance) {
  // GET /planner/config
  fastify.get('/planner/config', async (_request, reply) => {
    const cwd = path.join(os.homedir(), '.tsunagi');
    return reply.status(200).send({ data: { cwd } });
  });

  // GET /planner/tabs
  fastify.get('/planner/tabs', async (_request, reply) => {
    try {
      const tabs = await prisma.plannerTab.findMany({
        orderBy: { order: 'asc' },
      });

      return reply.status(200).send({
        data: {
          tabs: tabs.map((tab) => ({
            tab_id: tab.tabId,
            order: tab.order,
            status: tab.status,
            startedAt: tab.startedAt.toISOString(),
            completedAt: tab.completedAt?.toISOString(),
            updatedAt: tab.updatedAt.toISOString(),
          })),
        },
      });
    } catch (error) {
      fastify.log.error(error, 'GET /planner/tabs error');
      return reply.status(500).send({ error: 'Failed to fetch planner tabs' });
    }
  });

  // POST /planner/tabs
  fastify.post<{ Body: { tabId: string } }>('/planner/tabs', async (request, reply) => {
    try {
      const { tabId } = request.body;

      if (!tabId) {
        return reply.status(400).send({ error: 'tabId is required' });
      }

      const maxOrderTab = await prisma.plannerTab.findFirst({
        orderBy: { order: 'desc' },
      });
      const order = (maxOrderTab?.order ?? 0) + 1;

      const tab = await prisma.plannerTab.create({
        data: {
          tabId,
          order,
          status: 'idle',
          startedAt: new Date(),
        },
      });

      return reply.status(201).send({
        data: {
          tab: {
            tab_id: tab.tabId,
            order: tab.order,
            status: tab.status,
            startedAt: tab.startedAt.toISOString(),
            completedAt: tab.completedAt?.toISOString(),
            updatedAt: tab.updatedAt.toISOString(),
          },
        },
      });
    } catch (error) {
      fastify.log.error(error, 'POST /planner/tabs error');
      return reply.status(500).send({ error: 'Failed to create planner tab' });
    }
  });

  // DELETE /planner/tabs
  fastify.delete<{ Querystring: { tabId?: string } }>('/planner/tabs', async (request, reply) => {
    try {
      const { tabId } = request.query;

      if (!tabId) {
        return reply.status(400).send({ error: 'tabId query parameter is required' });
      }

      await prisma.plannerTab.delete({ where: { tabId } });
      return reply.status(200).send({ data: { success: true } });
    } catch (error) {
      fastify.log.error(error, 'DELETE /planner/tabs error');
      return reply.status(500).send({ error: 'Failed to delete planner tab' });
    }
  });
}
