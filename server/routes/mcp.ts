import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { prisma } from '../../src/lib/db.js';
import { todoStore } from '../todo-store.js';

/** SSEセッションIDをキーにしたtransportのMap */
const transports = new Map<string, SSEServerTransport>();

/** MCPサーバーインスタンスを作成して全toolsを登録する */
function createMcpServer(): Server {
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
        description: 'タスク詳細を取得する（tabs含む）',
        inputSchema: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', description: 'タスクID' },
          },
        },
      },
      {
        name: 'tsunagi_create_task',
        description: 'タスクを作成する',
        inputSchema: {
          type: 'object',
          required: ['owner', 'repo', 'title'],
          properties: {
            owner: { type: 'string', description: 'リポジトリオーナー' },
            repo: { type: 'string', description: 'リポジトリ名' },
            title: { type: 'string', description: 'タスクタイトル' },
            description: { type: 'string', description: 'タスク詳細説明' },
            effort: { type: 'number', description: '工数（時間）' },
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
        description: 'タスクを更新する（status/effort等）',
        inputSchema: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', description: 'タスクID' },
            title: { type: 'string', description: 'タスクタイトル' },
            description: { type: 'string', description: 'タスク詳細説明' },
            status: {
              type: 'string',
              enum: ['backlog', 'planning', 'coding', 'reviewing', 'done'],
              description: 'ステータス',
            },
            effort: { type: 'number', description: '工数（時間）' },
          },
        },
      },
      {
        name: 'tsunagi_delete_task',
        description: 'タスクを削除する（soft delete）',
        inputSchema: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', description: 'タスクID' },
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
        description: '指定タブのTodo進捗を取得する（メモリ上のtodo-storeから）',
        inputSchema: {
          type: 'object',
          required: ['tabId'],
          properties: {
            tabId: { type: 'string', description: 'タブID（= session_id）' },
          },
        },
      },
    ],
  }));

  // tool呼び出し
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'tsunagi_list_tasks': {
        const { owner, repo, status } = (args ?? {}) as {
          owner?: string;
          repo?: string;
          status?: string;
        };
        const tasks = await prisma.task.findMany({
          where: {
            deletedAt: null,
            ...(owner ? { owner } : {}),
            ...(repo ? { repo } : {}),
            ...(status ? { status } : {}),
          },
          include: { tabs: true },
          orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(tasks, null, 2) }],
        };
      }

      case 'tsunagi_get_task': {
        const { id } = (args ?? {}) as { id: string };
        const task = await prisma.task.findUnique({
          where: { id },
          include: { tabs: true },
        });
        if (!task) {
          return {
            content: [{ type: 'text', text: `Task not found: ${id}` }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(task, null, 2) }],
        };
      }

      case 'tsunagi_create_task': {
        const { owner, repo, title, description, effort, status } = (args ?? {}) as {
          owner: string;
          repo: string;
          title: string;
          description?: string;
          effort?: number;
          status?: string;
        };

        // リポジトリを確認
        const repository = await prisma.repository.findUnique({
          where: { owner_repo: { owner, repo } },
        });
        if (!repository) {
          return {
            content: [{ type: 'text', text: `Repository not found: ${owner}/${repo}` }],
            isError: true,
          };
        }

        const task = await prisma.task.create({
          data: {
            owner,
            repo,
            repoId: repository.id,
            title,
            description: description ?? '',
            status: status ?? 'backlog',
            branch: '',
            baseBranch: 'main',
            worktreeStatus: 'pending',
            effort: effort ?? null,
          },
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(task, null, 2) }],
        };
      }

      case 'tsunagi_update_task': {
        const { id, title, description, status, effort } = (args ?? {}) as {
          id: string;
          title?: string;
          description?: string;
          status?: string;
          effort?: number;
        };

        const existing = await prisma.task.findUnique({ where: { id } });
        if (!existing) {
          return {
            content: [{ type: 'text', text: `Task not found: ${id}` }],
            isError: true,
          };
        }

        const updated = await prisma.task.update({
          where: { id },
          data: {
            ...(title !== undefined ? { title } : {}),
            ...(description !== undefined ? { description } : {}),
            ...(status !== undefined ? { status } : {}),
            ...(effort !== undefined ? { effort } : {}),
          },
          include: { tabs: true },
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }],
        };
      }

      case 'tsunagi_delete_task': {
        const { id } = (args ?? {}) as { id: string };
        const existing = await prisma.task.findUnique({ where: { id } });
        if (!existing) {
          return {
            content: [{ type: 'text', text: `Task not found: ${id}` }],
            isError: true,
          };
        }
        await prisma.task.update({
          where: { id },
          data: { deletedAt: new Date() },
        });
        return {
          content: [{ type: 'text', text: `Task deleted: ${id}` }],
        };
      }

      case 'tsunagi_list_repos': {
        const repos = await prisma.repository.findMany({
          orderBy: [{ owner: 'asc' }, { repo: 'asc' }],
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(repos, null, 2) }],
        };
      }

      case 'tsunagi_get_tab_todos': {
        const { tabId } = (args ?? {}) as { tabId: string };
        const todos = todoStore.get(tabId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ tabId, todos }, null, 2),
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
  });

  return server;
}

export async function mcpRoutes(fastify: FastifyInstance) {
  // GET /mcp - SSE接続エンドポイント（MCP over SSE）
  fastify.get('/mcp', async (request: FastifyRequest, reply: FastifyReply) => {
    // MCP SSEはNode.js ServerResponseを直接使う
    const res = reply.raw;
    const transport = new SSEServerTransport('/mcp', res);

    transports.set(transport.sessionId, transport);

    res.on('close', () => {
      transports.delete(transport.sessionId);
    });

    // Fastifyのデフォルトレスポンス処理をスキップ
    await reply.hijack();

    const server = createMcpServer();
    // server.connect() が内部で transport.start() を呼ぶため、明示的な start() は不要
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
