import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Server as SocketIOServer } from 'socket.io';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  listTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  listRepos,
  ensureDefaultWorktree,
  TaskServiceError,
  type TaskIdentifier,
} from '../../src/lib/services/task-service.js';

/** SSEセッションIDをキーにしたtransportのMap */
const transports = new Map<string, SSEServerTransport>();

interface FastifyWithIO extends FastifyInstance {
  io: SocketIOServer;
}

/** タスク指定パラメータの共通inputSchema */
const taskIdentifierProperties = {
  id: { type: 'string' as const, description: 'タスクID' },
  session_id: {
    type: 'string' as const,
    description: 'セッションID（環境変数 TSUNAGI_SESSION_ID の値）',
  },
  cwd: { type: 'string' as const, description: '作業ディレクトリパス' },
};

/** MCPサーバーインスタンスを作成して全toolsを登録する */
function createMcpServer(io?: SocketIOServer): Server {
  const server = new Server({ name: 'tsunagi', version: '1.0.0' }, { capabilities: { tools: {} } });

  // tools一覧
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'tsunagi_list_tasks',
        description: 'タスク一覧を取得する（owner/repo/statusでフィルタ可）',
        inputSchema: {
          type: 'object',
          properties: {
            owner: { type: 'string', description: 'リポジトリオーナー' },
            repo: { type: 'string', description: 'リポジトリ名' },
            status: {
              type: 'string',
              enum: ['backlog', 'planning', 'coding', 'reviewing', 'done'],
              description: 'ステータスフィルタ',
            },
          },
        },
      },
      {
        name: 'tsunagi_get_task',
        description:
          'タスク詳細を取得する（tabs含む）。id, session_id, cwd のいずれかでタスクを指定する。',
        inputSchema: {
          type: 'object',
          properties: {
            ...taskIdentifierProperties,
          },
        },
      },
      {
        name: 'tsunagi_create_task',
        description:
          'タスクを作成する。worktree作成・初期タブ作成・Socket.IO通知を含むフル作成フロー。branchを省略するとtitleから自動生成される。',
        inputSchema: {
          type: 'object',
          required: ['owner', 'repo', 'title'],
          properties: {
            owner: { type: 'string', description: 'リポジトリオーナー' },
            repo: { type: 'string', description: 'リポジトリ名' },
            title: { type: 'string', description: 'タスクタイトル' },
            description: { type: 'string', description: 'タスク詳細説明' },
            branch: {
              type: 'string',
              description: 'ブランチ名（省略時はtitleから自動生成）',
            },
            baseBranch: {
              type: 'string',
              description: 'ベースブランチ名（省略時はdefault branch）',
            },
            effort: { type: 'number', description: '工数（時間）' },
            order: {
              type: 'number',
              description: '順序（指定位置に挿入、既存タスクは玉突きでずれる）',
            },
            status: {
              type: 'string',
              enum: ['backlog', 'planning', 'coding', 'reviewing', 'done'],
              description: '初期ステータス（デフォルト: backlog）',
            },
          },
        },
      },
      {
        name: 'tsunagi_update_task',
        description: 'タスクを更新する。id, session_id, cwd のいずれかでタスクを指定する。',
        inputSchema: {
          type: 'object',
          properties: {
            ...taskIdentifierProperties,
            title: { type: 'string', description: 'タスクタイトル' },
            description: { type: 'string', description: 'タスク詳細説明' },
            status: {
              type: 'string',
              enum: ['backlog', 'planning', 'coding', 'reviewing', 'done'],
              description: 'ステータス',
            },
            effort: { type: 'number', description: '工数（時間）' },
            order: {
              type: 'number',
              description: '順序（指定位置に移動、既存タスクは玉突きでずれる）',
            },
            baseBranch: { type: 'string', description: 'ベースブランチ名' },
            pullRequestUrl: { type: 'string', description: 'Pull Request URL' },
          },
        },
      },
      {
        name: 'tsunagi_delete_task',
        description:
          'タスクを削除する（soft delete + worktree削除）。id, session_id, cwd のいずれかでタスクを指定する。',
        inputSchema: {
          type: 'object',
          properties: {
            ...taskIdentifierProperties,
          },
        },
      },
      {
        name: 'tsunagi_list_repos',
        description: 'タスクが存在するリポジトリ一覧を取得する',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'tsunagi_get_tab_todos',
        description: '指定タブのTodo進捗を取得する（DBから）',
        inputSchema: {
          type: 'object',
          required: ['tabId'],
          properties: {
            tabId: { type: 'string', description: 'タブID（= session_id）' },
          },
        },
      },
      {
        name: 'tsunagi_ensure_default_worktree',
        description:
          'リポジトリのdefault branch worktreeを確保する（なければ作成、あれば最新化）。返却されたパスを使ってリポジトリの内容を読むことができる。',
        inputSchema: {
          type: 'object',
          required: ['owner', 'repo'],
          properties: {
            owner: { type: 'string', description: 'リポジトリオーナー' },
            repo: { type: 'string', description: 'リポジトリ名' },
          },
        },
      },
    ],
  }));

  // tool呼び出し
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'tsunagi_list_tasks': {
          const { owner, repo, status } = (args ?? {}) as {
            owner?: string;
            repo?: string;
            status?: string;
          };
          const tasks = await listTasks({
            owner,
            repo,
            status: status as import('../../src/lib/types.js').Task['status'] | undefined,
          });
          return { content: [{ type: 'text', text: JSON.stringify(tasks, null, 2) }] };
        }

        case 'tsunagi_get_task': {
          const task = await getTask(args as TaskIdentifier);
          return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
        }

        case 'tsunagi_create_task': {
          const { owner, repo, title, description, effort, order, status, branch, baseBranch } =
            (args ?? {}) as {
              owner: string;
              repo: string;
              title: string;
              description?: string;
              effort?: number;
              order?: number;
              status?: string;
              branch?: string;
              baseBranch?: string;
            };
          const result = await createTask(
            {
              owner,
              repo,
              title,
              description,
              effort: effort !== undefined ? Number(effort) : undefined,
              order: order !== undefined ? Number(order) : undefined,
              status: status as import('../../src/lib/types.js').Task['status'] | undefined,
              branch,
              baseBranch,
            },
            { io }
          );
          return { content: [{ type: 'text', text: JSON.stringify(result.task, null, 2) }] };
        }

        case 'tsunagi_update_task': {
          const {
            id,
            session_id,
            cwd,
            title,
            description,
            status,
            effort,
            order,
            baseBranch,
            pullRequestUrl,
          } = (args ?? {}) as {
            id?: string;
            session_id?: string;
            cwd?: string;
            title?: string;
            description?: string;
            status?: string;
            effort?: number;
            order?: number;
            baseBranch?: string;
            pullRequestUrl?: string;
          };
          const updated = await updateTask(
            { id, session_id, cwd },
            {
              ...(title !== undefined ? { title } : {}),
              ...(description !== undefined ? { description } : {}),
              ...(status !== undefined
                ? { status: status as import('../../src/lib/types.js').Task['status'] }
                : {}),
              ...(effort !== undefined ? { effort: Number(effort) } : {}),
              ...(order !== undefined ? { order: Number(order) } : {}),
              ...(baseBranch !== undefined ? { baseBranch } : {}),
              ...(pullRequestUrl !== undefined ? { pullRequestUrl } : {}),
            },
            { io }
          );
          return { content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }] };
        }

        case 'tsunagi_delete_task': {
          const task = await deleteTask(args as TaskIdentifier, { io });
          return { content: [{ type: 'text', text: JSON.stringify(task ?? 'Task deleted') }] };
        }

        case 'tsunagi_list_repos': {
          const repos = await listRepos();
          return { content: [{ type: 'text', text: JSON.stringify(repos, null, 2) }] };
        }

        case 'tsunagi_get_tab_todos': {
          const { tabId } = (args ?? {}) as { tabId: string };
          try {
            const res = await fetch(`http://localhost:2791/api/internal/tabs/${tabId}/todos`);
            if (!res.ok) {
              return {
                content: [{ type: 'text', text: JSON.stringify({ tabId, todos: [] }, null, 2) }],
              };
            }
            const data = (await res.json()) as { data: { todos: unknown[] } };
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ tabId, todos: data.data.todos }, null, 2),
                },
              ],
            };
          } catch {
            return {
              content: [{ type: 'text', text: JSON.stringify({ tabId, todos: [] }, null, 2) }],
            };
          }
        }

        case 'tsunagi_ensure_default_worktree': {
          const { owner, repo } = (args ?? {}) as { owner: string; repo: string };
          const result = await ensureDefaultWorktree(owner, repo);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    worktreePath: result.worktreePath,
                    defaultBranch: result.defaultBranch,
                    message: `Default branch worktree ready at ${result.worktreePath}. You can read files from this path. Do NOT modify any files.`,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: error instanceof TaskServiceError ? error.message : String(error),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

export async function mcpRoutes(fastify: FastifyInstance) {
  const io = (fastify as FastifyWithIO).io;

  // GET /mcp - SSE接続エンドポイント（MCP over SSE）
  fastify.get('/mcp', async (request: FastifyRequest, reply: FastifyReply) => {
    const res = reply.raw;
    const transport = new SSEServerTransport('/mcp', res);

    transports.set(transport.sessionId, transport);

    res.on('close', () => {
      transports.delete(transport.sessionId);
    });

    await reply.hijack();

    const server = createMcpServer(io);
    await server.connect(transport);
  });

  // POST /mcp - tool呼び出しエンドポイント
  fastify.post('/mcp', async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = (request.query as Record<string, string>)['sessionId'];

    if (!sessionId) {
      return reply.status(400).send({ error: 'sessionId query parameter required' });
    }

    const transport = transports.get(sessionId);
    if (!transport) {
      return reply.status(404).send({ error: `Session not found: ${sessionId}` });
    }

    await transport.handlePostMessage(request.raw, reply.raw, request.body);
    await reply.hijack();
  });
}
