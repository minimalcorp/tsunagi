import type { FastifyInstance } from 'fastify';
import * as worktreeManager from '../lib/worktree-manager.js';
import * as repoRepo from '../lib/repositories/repository.js';

export async function worktreesRoutes(fastify: FastifyInstance) {
  // GET /worktrees/list
  fastify.get<{ Querystring: { owner?: string; repo?: string } }>(
    '/worktrees/list',
    async (request, reply) => {
      try {
        const { owner, repo } = request.query;

        if (!owner || !repo) {
          return reply.status(400).send({
            error: 'Missing required query parameters: owner, repo',
          });
        }

        const worktrees = await worktreeManager.listWorktrees(owner, repo);
        return reply.status(200).send({ data: worktrees });
      } catch (error) {
        fastify.log.error(error, 'GET /worktrees/list error');
        const message = error instanceof Error ? error.message : 'Failed to list worktrees';
        return reply.status(500).send({ error: message });
      }
    }
  );

  // POST /worktrees/create
  fastify.post<{ Body: { owner: string; repo: string; branch: string } }>(
    '/worktrees/create',
    async (request, reply) => {
      try {
        const { owner, repo, branch } = request.body;

        if (!owner || !repo || !branch) {
          return reply.status(400).send({
            error: 'Missing required fields: owner, repo, branch',
          });
        }

        await worktreeManager.fetchRemote(owner, repo);
        const { worktreePath } = await worktreeManager.createWorktree(owner, repo, branch);

        return reply.status(201).send({ data: { worktreePath, success: true } });
      } catch (error) {
        fastify.log.error(error, 'POST /worktrees/create error');
        const message = error instanceof Error ? error.message : 'Failed to create worktree';
        return reply.status(500).send({ error: message });
      }
    }
  );

  // DELETE /worktrees/delete
  fastify.delete<{
    Querystring: { owner?: string; repo?: string; branch?: string; force?: string };
  }>('/worktrees/delete', async (request, reply) => {
    try {
      const { owner, repo, branch } = request.query;
      const force = request.query.force === 'true';

      if (!owner || !repo || !branch) {
        return reply.status(400).send({
          error: 'Missing required query parameters: owner, repo, branch',
        });
      }

      await worktreeManager.removeWorktree(owner, repo, branch, force);
      return reply.status(200).send({ data: { success: true } });
    } catch (error) {
      fastify.log.error(error, 'DELETE /worktrees/delete error');
      const message = error instanceof Error ? error.message : 'Failed to delete worktree';
      return reply.status(500).send({ error: message });
    }
  });

  // POST /worktrees/init
  fastify.post<{ Body: { owner: string; repo: string } }>(
    '/worktrees/init',
    async (request, reply) => {
      try {
        const { owner, repo } = request.body;

        if (!owner || !repo) {
          return reply.status(400).send({ error: 'Missing required fields: owner, repo' });
        }

        const repository = await repoRepo.getRepo(owner, repo);
        if (!repository) {
          return reply.status(404).send({
            error: 'Repository not found. Please register it first.',
          });
        }

        const bareRepoPath = await worktreeManager.initBareRepository(
          owner,
          repo,
          repository.cloneUrl
        );

        return reply.status(201).send({ data: { bareRepoPath, success: true } });
      } catch (error) {
        fastify.log.error(error, 'POST /worktrees/init error');
        const message =
          error instanceof Error ? error.message : 'Failed to initialize bare repository';
        return reply.status(500).send({ error: message });
      }
    }
  );
}
