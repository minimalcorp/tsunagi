import type { FastifyInstance } from 'fastify';
import type { Server as SocketIOServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import type { Task } from '@minimalcorp/tsunagi-shared';
import * as taskRepo from '../lib/repositories/task.js';
import * as worktreeManager from '../lib/worktree-manager.js';
import {
  listTasks,
  createTask,
  getTask,
  updateTask,
  deleteTask,
  TaskServiceError,
} from '../lib/services/task-service.js';

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

interface UpdateBody {
  title?: string;
  description?: string;
  status?: Task['status'];
  effort?: number;
  order?: number;
  pullRequestUrl?: string;
}

interface StatusBody {
  status: string;
  pullRequestUrl?: string;
}

interface RebaseBody {
  baseBranch?: string;
}

interface TabUpdateBody {
  [key: string]: unknown;
}

export async function tasksRoutes(fastify: FastifyInstance) {
  const io = (fastify as FastifyWithIO).io;

  // POST /tasks/validate
  fastify.post<{ Body: ValidateBody }>('/tasks/validate', async (request, reply) => {
    try {
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
    } catch (error) {
      fastify.log.error(error, 'POST /tasks/validate error');
      return reply.status(500).send({
        valid: false,
        errors: [{ field: 'global', message: 'Validation failed' }],
      });
    }
  });

  // POST /tasks/batch-delete
  fastify.post<{ Body: { daysAgo?: number } }>('/tasks/batch-delete', async (request, reply) => {
    try {
      const daysAgo = request.body.daysAgo ?? 7;

      if (typeof daysAgo !== 'number' || daysAgo < 0) {
        return reply.status(400).send({ error: 'Invalid daysAgo parameter' });
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysAgo);

      const targetTasks = await taskRepo.getTasks({
        includeDeleted: false,
        status: 'done',
        updatedBefore: cutoffDate,
      });

      const targetTaskIds = targetTasks.map((task) => task.id);
      const totalCount = targetTaskIds.length;
      const batchId = uuidv4();

      const response = { data: { batchId, targetTaskIds, totalCount } };

      // Background deletion
      setImmediate(async () => {
        const MAX_CONCURRENT = 8;
        let index = 0;
        const executing: Promise<void>[] = [];

        const deleteOne = async (task: (typeof targetTasks)[0]) => {
          try {
            const success = await taskRepo.deleteTask(task.id);
            if (success) {
              try {
                await worktreeManager.removeWorktree(task.owner, task.repo, task.branch, true);
              } catch (err) {
                fastify.log.error(err, `Failed to remove worktree for task ${task.id}`);
              }
            }
          } catch (err) {
            fastify.log.error(err, `Failed to delete task ${task.id}`);
          }
        };

        while (index < targetTasks.length) {
          while (index < targetTasks.length && executing.length < MAX_CONCURRENT) {
            const task = targetTasks[index++];
            const p = deleteOne(task).then(() => {
              executing.splice(executing.indexOf(p), 1);
            });
            executing.push(p);
          }
          if (executing.length > 0) await Promise.race(executing);
        }
        await Promise.all(executing);
      });

      return reply.status(200).send(response);
    } catch (error) {
      fastify.log.error(error, 'POST /tasks/batch-delete error');
      return reply.status(500).send({ error: 'Failed to batch delete tasks' });
    }
  });

  // GET /tasks
  fastify.get<{
    Querystring: {
      status?: string;
      owner?: string;
      repo?: string;
      includeDeleted?: string;
    };
  }>('/tasks', async (request, reply) => {
    try {
      const { status, owner, repo, includeDeleted } = request.query;

      const tasks = await listTasks({
        status: (status as Task['status']) || undefined,
        owner: owner || undefined,
        repo: repo || undefined,
        includeDeleted: includeDeleted === 'true',
      });

      return reply.status(200).send({ data: { tasks } });
    } catch (error) {
      fastify.log.error(error, 'GET /tasks error');
      return reply.status(500).send({ error: 'Failed to fetch tasks' });
    }
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

    try {
      const result = await createTask(
        { title, description, owner, repo, branch, baseBranch, effort, order },
        { io }
      );

      return reply.status(201).send({ data: { task: result.task } });
    } catch (error) {
      if (error instanceof TaskServiceError) {
        const statusCode =
          error.code === 'REPO_NOT_FOUND' ? 404 : error.code === 'BRANCH_DUPLICATE' ? 409 : 500;
        return reply.status(statusCode).send({
          errors: [{ field: 'global', message: error.message }],
        });
      }
      fastify.log.error(error, 'Failed to create task');
      return reply.status(500).send({ error: 'Failed to create task' });
    }
  });

  // GET /tasks/:id
  fastify.get<{ Params: { id: string } }>('/tasks/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const task = await getTask({ id });
      return reply.status(200).send({ data: { task } });
    } catch (error) {
      if (error instanceof TaskServiceError && error.code === 'TASK_NOT_FOUND') {
        return reply.status(404).send({ error: 'Task not found' });
      }
      fastify.log.error(error, 'GET /tasks/:id error');
      return reply.status(500).send({ error: 'Failed to fetch task' });
    }
  });

  // PUT /tasks/:id
  fastify.put<{ Params: { id: string }; Body: UpdateBody }>(
    '/tasks/:id',
    async (request, reply) => {
      try {
        const { id } = request.params;
        const updatedTask = await updateTask({ id }, request.body, { io });
        return reply.status(200).send({ data: { task: updatedTask } });
      } catch (error) {
        if (error instanceof TaskServiceError && error.code === 'TASK_NOT_FOUND') {
          return reply.status(404).send({ error: 'Task not found' });
        }
        fastify.log.error(error, 'PUT /tasks/:id error');
        return reply.status(500).send({ error: 'Failed to update task' });
      }
    }
  );

  // DELETE /tasks/:id
  fastify.delete<{ Params: { id: string } }>('/tasks/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      await deleteTask({ id }, { io });
      return reply.status(200).send({ data: { success: true } });
    } catch (error) {
      if (error instanceof TaskServiceError && error.code === 'TASK_NOT_FOUND') {
        return reply.status(404).send({ error: 'Task not found' });
      }
      fastify.log.error(error, 'DELETE /tasks/:id error');
      return reply.status(500).send({ error: 'Failed to delete task' });
    }
  });

  // PUT /tasks/:id/status
  fastify.put<{ Params: { id: string }; Body: StatusBody }>(
    '/tasks/:id/status',
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { status, pullRequestUrl } = request.body;

        const validStatuses: Task['status'][] = [
          'backlog',
          'planning',
          'coding',
          'reviewing',
          'done',
        ];
        if (!status || !validStatuses.includes(status as Task['status'])) {
          return reply.status(400).send({
            error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
          });
        }

        const updatedTask = await taskRepo.transitionTaskStatus(id, status as Task['status'], {
          pullRequestUrl,
        });

        if (!updatedTask) {
          return reply.status(404).send({ error: 'Task not found' });
        }

        return reply.status(200).send({ data: { task: updatedTask } });
      } catch (error) {
        fastify.log.error(error, 'PUT /tasks/:id/status error');
        return reply.status(500).send({ error: 'Failed to update task status' });
      }
    }
  );

  // POST /tasks/:id/complete
  fastify.post<{ Params: { id: string } }>('/tasks/:id/complete', async (request, reply) => {
    try {
      const { id } = request.params;

      const completedTask = await taskRepo.completeTask(id);

      if (!completedTask) {
        return reply.status(404).send({ error: 'Task not found' });
      }

      return reply.status(200).send({
        data: { task: completedTask },
        message: 'Task completed successfully',
      });
    } catch (error) {
      fastify.log.error(error, 'POST /tasks/:id/complete error');
      const errorMessage = error instanceof Error ? error.message : 'Failed to complete task';
      return reply.status(500).send({ error: errorMessage });
    }
  });

  // GET /tasks/:id/needs-rebase
  fastify.get<{ Params: { id: string } }>('/tasks/:id/needs-rebase', async (request, reply) => {
    try {
      const { id } = request.params;
      const task = await taskRepo.getTask(id);

      if (!task) {
        return reply.status(404).send({ error: 'Task not found' });
      }

      let needsRebase = false;
      if (task.worktreeStatus === 'created') {
        needsRebase = await worktreeManager.checkRebaseNeeded(
          task.owner,
          task.repo,
          task.branch,
          task.baseBranch
        );
      }

      return reply.status(200).send({ data: { needsRebase } });
    } catch (error) {
      fastify.log.error(error, 'GET /tasks/:id/needs-rebase error');
      return reply.status(500).send({ error: 'Failed to check rebase status' });
    }
  });

  // POST /tasks/:id/rebase
  fastify.post<{ Params: { id: string }; Body: RebaseBody }>(
    '/tasks/:id/rebase',
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { baseBranch } = request.body ?? {};

        const task = await taskRepo.getTask(id);
        if (!task) {
          return reply.status(404).send({ error: 'Task not found' });
        }

        if (task.worktreeStatus !== 'created') {
          return reply.status(400).send({ error: 'Worktree has not been created yet' });
        }

        const isClaudeRunning = task.tabs.some((tab) => tab.status === 'running');
        if (isClaudeRunning) {
          return reply.status(400).send({ error: 'Cannot rebase while Claude is running' });
        }

        const result = await worktreeManager.rebaseWorktree(
          task.owner,
          task.repo,
          task.branch,
          baseBranch
        );

        if (result.success) {
          return reply.status(200).send({
            data: { success: true, message: result.message },
          });
        } else {
          return reply.status(409).send({
            error: result.message,
            conflicts: result.conflicts,
          });
        }
      } catch (error) {
        fastify.log.error(error, 'POST /tasks/:id/rebase error');
        const errorMessage = error instanceof Error ? error.message : 'Failed to rebase worktree';
        return reply.status(500).send({ error: errorMessage });
      }
    }
  );

  // GET /tasks/:id/tabs
  fastify.get<{ Params: { id: string } }>('/tasks/:id/tabs', async (request, reply) => {
    try {
      const { id: taskId } = request.params;

      const task = await taskRepo.getTask(taskId);
      if (!task) {
        return reply.status(404).send({ error: 'Task not found' });
      }

      return reply.status(200).send({ data: { tabs: task.tabs || [] } });
    } catch (error) {
      fastify.log.error(error, 'GET /tasks/:id/tabs error');
      return reply.status(500).send({ error: 'Failed to fetch tabs' });
    }
  });

  // POST /tasks/:id/tabs
  fastify.post<{ Params: { id: string } }>('/tasks/:id/tabs', async (request, reply) => {
    try {
      const { id: taskId } = request.params;

      const task = await taskRepo.getTask(taskId);
      if (!task) {
        return reply.status(404).send({ error: 'Task not found' });
      }

      const newTab = await taskRepo.createTab(taskId);
      if (!newTab) {
        return reply.status(500).send({ error: 'Failed to create tab' });
      }

      return reply.status(201).send({ data: { tab: newTab } });
    } catch (error) {
      fastify.log.error(error, 'POST /tasks/:id/tabs error');
      return reply.status(500).send({ error: 'Failed to create tab' });
    }
  });

  // PUT /tasks/:id/tabs/:tab_id
  fastify.put<{ Params: { id: string; tab_id: string }; Body: TabUpdateBody }>(
    '/tasks/:id/tabs/:tab_id',
    async (request, reply) => {
      try {
        const { id: taskId, tab_id } = request.params;
        const updatedTab = await taskRepo.updateTab(taskId, tab_id, request.body);
        if (!updatedTab) {
          return reply.status(404).send({ error: 'Tab not found' });
        }
        return reply.status(200).send({ data: { tab: updatedTab } });
      } catch (error) {
        fastify.log.error(error, 'PUT /tasks/:id/tabs/:tab_id error');
        return reply.status(500).send({ error: 'Failed to update tab' });
      }
    }
  );

  // DELETE /tasks/:id/tabs/:tab_id
  fastify.delete<{ Params: { id: string; tab_id: string } }>(
    '/tasks/:id/tabs/:tab_id',
    async (request, reply) => {
      try {
        const { id: taskId, tab_id } = request.params;
        const success = await taskRepo.deleteTab(taskId, tab_id);
        if (!success) {
          return reply.status(404).send({ error: 'Tab not found' });
        }
        return reply.status(200).send({ data: { success: true } });
      } catch (error) {
        fastify.log.error(error, 'DELETE /tasks/:id/tabs/:tab_id error');
        return reply.status(500).send({ error: 'Failed to delete tab' });
      }
    }
  );
}
