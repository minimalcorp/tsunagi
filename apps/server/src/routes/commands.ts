import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as os from 'os';
import type { FastifyInstance } from 'fastify';
import { normalizeBranchName } from '../lib/branch-utils.js';

const execAsync = promisify(exec);

interface OpenBody {
  commandType: string;
  owner: string;
  repo: string;
  branch: string;
}

export async function commandsRoutes(fastify: FastifyInstance) {
  // POST /commands/open
  fastify.post<{ Body: OpenBody }>('/commands/open', async (request, reply) => {
    try {
      const { commandType, owner, repo, branch } = request.body;

      const normalizedBranch = normalizeBranchName(branch);
      const worktreePath = path.join(
        os.homedir(),
        '.tsunagi',
        'workspaces',
        owner,
        repo,
        normalizedBranch
      );

      if (commandType === 'vscode') {
        await execAsync(`code "${worktreePath}"`);
      } else if (commandType === 'terminal') {
        const platform = os.platform();
        if (platform === 'darwin') {
          await execAsync(`open -a Terminal "${worktreePath}"`);
        } else if (platform === 'linux') {
          try {
            await execAsync(`gnome-terminal --working-directory="${worktreePath}"`);
          } catch {
            await execAsync(`xterm -e "cd '${worktreePath}' && exec $SHELL"`);
          }
        } else {
          throw new Error('Unsupported platform');
        }
      } else {
        throw new Error('Invalid command type');
      }

      return reply.status(200).send({ success: true });
    } catch (error) {
      fastify.log.error(error, 'Command execution error');
      return reply.status(500).send({
        error: error instanceof Error ? error.message : 'Command failed',
      });
    }
  });
}
