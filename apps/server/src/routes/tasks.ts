import type { FastifyInstance } from 'fastify';
import type { Server as SocketIOServer } from 'socket.io';
import * as taskRepo from '../lib/repositories/task.js';
import { createTask, TaskServiceError } from '../lib/services/task-service.js';

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
}
