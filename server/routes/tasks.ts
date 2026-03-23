import type { FastifyInstance } from 'fastify';
import type { Server as SocketIOServer } from 'socket.io';
import * as taskRepo from '../../src/lib/repositories/task.js';
import * as repoRepo from '../../src/lib/repositories/repository.js';
import * as worktreeManager from '../../src/lib/worktree-manager.js';

interface FastifyWithIO extends FastifyInstance {
  io: SocketIOServer;
}

interface ValidateBody {
  title: string;
  owner: string;
  repo: string;
  branch: string;
}

interface CreateBody {
  title: string;
  description?: string;
  owner: string;
  repo: string;
  branch: string;
  baseBranch?: string;
  effort?: number;
  order?: number;
}

export async function tasksRoutes(fastify: FastifyInstance) {
  const io = (fastify as FastifyWithIO).io;

  // POST /tasks/validate
  fastify.post<{ Body: ValidateBody }>('/tasks/validate', async (request, reply) => {
    const { title, owner, repo, branch } = request.body;

    if (!title || !owner || !repo || !branch) {
      return reply.status(400).send({
        valid: false,
        errors: [
          { field: 'global', message: 'Missing required fields: title, owner, repo, branch' },
        ],
      });
    }

    const existingTasks = await taskRepo.getTasks({ includeDeleted: false });
    const duplicateTask = existingTasks.find(
      (task) => task.owner === owner && task.repo === repo && task.branch === branch
    );

    if (duplicateTask) {
      return reply.status(409).send({
        valid: false,
        errors: [
          {
            field: 'branch',
            message: `Branch "${branch}" already exists. Task "${duplicateTask.title}" (ID: ${duplicateTask.id}) is already using this branch.`,
          },
        ],
      });
    }

    return reply.status(200).send({ valid: true });
  });

  // POST /tasks
  fastify.post<{ Body: CreateBody }>('/tasks', async (request, reply) => {
    const { title, description, owner, repo, branch, baseBranch, effort, order } = request.body;

    if (!title || !owner || !repo || !branch) {
      return reply.status(400).send({
        errors: [
          { field: 'global', message: 'Missing required fields: title, owner, repo, branch' },
        ],
      });
    }

    // ブランチ名重複チェック
    const existingTasks = await taskRepo.getTasks({ includeDeleted: false });
    const duplicateTask = existingTasks.find(
      (task) => task.owner === owner && task.repo === repo && task.branch === branch
    );

    if (duplicateTask) {
      return reply.status(409).send({
        errors: [
          {
            field: 'branch',
            message: `Branch "${branch}" already exists. Task "${duplicateTask.title}" (ID: ${duplicateTask.id}) is already using this branch.`,
          },
        ],
      });
    }

    // リポジトリIDを取得
    const repository = await repoRepo.getRepo(owner, repo);
    if (!repository) {
      return reply.status(404).send({
        errors: [
          { field: 'global', message: 'Repository not found. Please clone the repository first.' },
        ],
      });
    }

    // タスクを作成
    const newTask = await taskRepo.createTask({
      title,
      description: description ?? '',
      status: 'backlog',
      owner,
      repo,
      branch,
      baseBranch: baseBranch ?? 'main',
      repoId: repository.id,
      worktreeStatus: 'pending',
      effort,
      order,
    });

    // worktreeを自動作成
    try {
      await worktreeManager.fetchRemote(owner, repo);
      const { baseBranchCommit } = await worktreeManager.createWorktree(
        owner,
        repo,
        branch,
        baseBranch ?? 'main'
      );
      await taskRepo.updateTask(newTask.id, { worktreeStatus: 'created', baseBranchCommit });
    } catch (error) {
      fastify.log.error(error, 'Failed to create worktree');
      await taskRepo.updateTask(newTask.id, { worktreeStatus: 'error' });
    }

    // 最初のタブを自動作成
    try {
      await taskRepo.createTab(newTask.id);
    } catch (error) {
      fastify.log.error(error, 'Failed to create initial tab');
    }

    // 更新後のタスクを取得
    const updatedTask = await taskRepo.getTask(newTask.id);

    // task:created イベントを全クライアントにbroadcast
    const taskForBroadcast = {
      ...updatedTask,
      tabs: (updatedTask?.tabs ?? []).map((tab) => ({
        ...tab,
        promptCount: tab.promptCount ?? 0,
      })),
    };
    io.emit('task:created', { task: taskForBroadcast });

    return reply.status(201).send({ data: { task: taskForBroadcast } });
  });
}
