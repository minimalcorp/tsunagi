import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { FastifyInstance } from 'fastify';
import * as repoRepo from '../lib/repositories/repository.js';
import * as taskRepo from '../lib/repositories/task.js';
import * as worktreeManager from '../lib/worktree-manager.js';
import { getEnv } from '../lib/repositories/environment.js';
import { createRepo } from '../lib/repositories/repository.js';

const WORKSPACES_ROOT = path.join(os.homedir(), '.tsunagi', 'workspaces');

// Git URLからowner/repoを抽出
function parseGitUrl(gitUrl: string): { owner: string; repo: string } | null {
  const httpsMatch = gitUrl.match(/https?:\/\/github\.com\/([^/]+)\/([^/]+?)(\.git)?$/);
  const sshMatch = gitUrl.match(/git@github\.com:([^/]+)\/([^/]+?)(\.git)?$/);

  const match = httpsMatch || sshMatch;
  if (!match) return null;

  return {
    owner: match[1],
    repo: match[2],
  };
}

export async function reposRoutes(fastify: FastifyInstance) {
  // GET /repos
  fastify.get('/repos', async (_request, reply) => {
    try {
      const repos = await repoRepo.getRepos();
      return reply.status(200).send({ data: repos });
    } catch (error) {
      fastify.log.error(error, 'GET /repos error');
      return reply.status(500).send({ error: 'Failed to fetch repositories' });
    }
  });

  // POST /repos
  fastify.post<{ Body: { owner: string; repo: string; cloneUrl: string } }>(
    '/repos',
    async (request, reply) => {
      try {
        const { owner, repo, cloneUrl } = request.body;

        if (!owner || !repo || !cloneUrl) {
          return reply
            .status(400)
            .send({ error: 'Missing required fields: owner, repo, cloneUrl' });
        }

        const newRepo = await repoRepo.createRepo({ owner, repo, cloneUrl });
        return reply.status(201).send({ data: newRepo });
      } catch (error) {
        if (error instanceof Error && error.message.includes('already exists')) {
          return reply.status(409).send({ error: (error as Error).message });
        }
        fastify.log.error(error, 'POST /repos error');
        return reply.status(500).send({ error: 'Failed to create repository' });
      }
    }
  );

  // GET /repos/:owner/:repo
  fastify.get<{ Params: { owner: string; repo: string } }>(
    '/repos/:owner/:repo',
    async (request, reply) => {
      try {
        const { owner, repo } = request.params;
        const repository = await repoRepo.getRepo(owner, repo);

        if (!repository) {
          return reply.status(404).send({ error: 'Repository not found' });
        }

        return reply.status(200).send({ data: repository });
      } catch (error) {
        fastify.log.error(error, 'GET /repos/:owner/:repo error');
        return reply.status(500).send({ error: 'Failed to fetch repository' });
      }
    }
  );

  // DELETE /repos/:owner/:repo
  fastify.delete<{ Params: { owner: string; repo: string } }>(
    '/repos/:owner/:repo',
    async (request, reply) => {
      try {
        const { owner, repo } = request.params;
        const repository = await repoRepo.getRepo(owner, repo);

        if (!repository) {
          return reply.status(404).send({ error: 'Repository not found' });
        }

        const tasks = await taskRepo.getTasks({ owner, repo, includeDeleted: false });
        const taskCount = tasks.length;

        const workspacePath = path.join(WORKSPACES_ROOT, owner, repo);
        try {
          await fs.rm(workspacePath, { recursive: true, force: true });
        } catch (err) {
          fastify.log.error(err, 'Failed to delete workspace directory');
        }

        const success = await repoRepo.deleteRepo(repository.id);
        if (!success) {
          return reply.status(500).send({ error: 'Failed to delete repository' });
        }

        try {
          const ownerPath = path.join(WORKSPACES_ROOT, owner);
          const entries = await fs.readdir(ownerPath);
          if (entries.length === 0) {
            await fs.rmdir(ownerPath);
          }
        } catch {
          // Ignore cleanup errors
        }

        return reply.status(200).send({ data: { success: true, deletedTaskCount: taskCount } });
      } catch (error) {
        fastify.log.error(error, 'DELETE /repos/:owner/:repo error');
        return reply.status(500).send({ error: 'Failed to delete repository' });
      }
    }
  );

  // GET /repos/:owner/:repo/branches
  fastify.get<{ Params: { owner: string; repo: string } }>(
    '/repos/:owner/:repo/branches',
    async (request, reply) => {
      try {
        const { owner, repo } = request.params;

        await worktreeManager.fetchRemote(owner, repo);

        const [branches, defaultBranch] = await Promise.all([
          worktreeManager.getRemoteBranches(owner, repo),
          worktreeManager.getDefaultBranch(owner, repo),
        ]);

        return reply.status(200).send({ data: { branches, defaultBranch } });
      } catch (error) {
        fastify.log.error(error, 'GET /repos/:owner/:repo/branches error');
        const message = error instanceof Error ? error.message : 'Failed to fetch branches';
        return reply.status(500).send({ error: message });
      }
    }
  );

  // GET /owners
  fastify.get('/owners', async (_request, reply) => {
    try {
      const repos = await repoRepo.getRepos();

      const ownersMap = new Map<string, { name: string; repositories: typeof repos }>();

      for (const repo of repos) {
        if (!ownersMap.has(repo.owner)) {
          ownersMap.set(repo.owner, { name: repo.owner, repositories: [] });
        }
        ownersMap.get(repo.owner)!.repositories.push(repo);
      }

      const owners = Array.from(ownersMap.values());
      return reply.status(200).send({ data: { owners } });
    } catch (error) {
      fastify.log.error(error, 'Failed to get owners');
      return reply.status(500).send({ error: 'Failed to get owners' });
    }
  });

  // POST /clone
  fastify.post<{ Body: { gitUrl: string } }>('/clone', async (request, reply) => {
    try {
      const { gitUrl } = request.body;

      if (!gitUrl) {
        return reply.status(400).send({ error: 'gitUrl is required' });
      }

      const parsed = parseGitUrl(gitUrl);
      if (!parsed) {
        return reply.status(400).send({ error: 'Invalid Git URL format' });
      }

      const { owner, repo } = parsed;

      const envVars = await getEnv('global');
      if (envVars.GITHUB_PAT) {
        try {
          await worktreeManager.authenticateGhCli(envVars.GITHUB_PAT);
        } catch (err) {
          fastify.log.warn(err, 'Failed to authenticate gh CLI, continuing with clone');
        }
      }

      const bareRepoPath = path.join(os.homedir(), '.tsunagi', 'workspaces', owner, repo, '.bare');

      try {
        await worktreeManager.initBareRepository(owner, repo, gitUrl);
      } catch (error) {
        try {
          await fs.rm(bareRepoPath, { recursive: true, force: true });
        } catch (cleanupError) {
          fastify.log.warn(cleanupError, 'Failed to cleanup bare repository after clone failure');
        }
        throw error;
      }

      const newRepo = await createRepo({ owner, repo, cloneUrl: gitUrl });

      return reply.status(200).send({ data: { repository: { ...newRepo, bareRepoPath } } });
    } catch (error) {
      fastify.log.error(error, 'Failed to clone repository');
      return reply.status(500).send({
        error: error instanceof Error ? error.message : 'Failed to clone repository',
      });
    }
  });
}
