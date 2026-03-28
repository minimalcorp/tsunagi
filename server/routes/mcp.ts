import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import * as os from 'os';
import * as path from 'path';
import { prisma } from '../../src/lib/db.js';
import { todoStore } from '../todo-store.js';

/** SSEセッションIDをキーにしたtransportのMap */
const transports = new Map<string, SSEServerTransport>();

const WORKSPACES_ROOT = path.join(os.homedir(), '.tsunagi', 'workspaces');

/** CWDからowner/repo/branchを抽出する */
function parseWorktreePath(cwd: string): { owner: string; repo: string; branch: string } | null {
  // ~/.tsunagi/workspaces/{owner}/{repo}/{normalized-branch}
  const relative = path.relative(WORKSPACES_ROOT, cwd);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;

  const parts = relative.split(path.sep);
  if (parts.length < 3) return null;

  return { owner: parts[0], repo: parts[1], branch: parts[2] };
}

/** id / session_id / cwd からタスクを解決する共通ヘルパー */
async function resolveTask(args: { id?: string; session_id?: string; cwd?: string }) {
  // 1. id指定: 直接タスクを取得
  if (args.id) {
    return prisma.task.findUnique({
      where: { id: args.id },
      include: { tabs: true },
    });
  }
  // 2. session_id指定: session_id = tabId → Tab.taskId → Task
  if (args.session_id) {
    const tab = await prisma.tab.findUnique({ where: { tabId: args.session_id } });
    if (!tab) return null;
    return prisma.task.findUnique({
      where: { id: tab.taskId },
      include: { tabs: true },
    });
  }
  // 3. cwd指定: パスからowner/repo/branchを抽出してタスクを検索
  if (args.cwd) {
    const parsed = parseWorktreePath(args.cwd);
    if (!parsed) return null;
    // normalized branch名でマッチするタスクを探す
    // branch名はDB上では "feat/xxx" 形式、worktreeパスでは "feat-xxx" 形式
    // そのため全タスクから正規化後のbranch名で比較する
    const tasks = await prisma.task.findMany({
      where: { owner: parsed.owner, repo: parsed.repo, deletedAt: null },
      include: { tabs: true },
    });
    return (
      tasks.find((t) => {
        const normalized = t.branch.replace(/\//g, '-');
        return normalized === parsed.branch;
      }) ?? null
    );
  }
  return null;
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
            baseBranch: { type: 'string', description: 'ベースブランチ名' },
            pullRequestUrl: { type: 'string', description: 'Pull Request URL' },
          },
        },
      },
      {
        name: 'tsunagi_delete_task',
        description:
          'タスクを削除する（soft delete）。id, session_id, cwd のいずれかでタスクを指定する。',
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
        const task = await resolveTask(args as { id?: string; session_id?: string; cwd?: string });
        if (!task) {
          return {
            content: [{ type: 'text', text: 'Task not found' }],
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
        const {
          id,
          session_id,
          cwd,
          title,
          description,
          status,
          effort,
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
          baseBranch?: string;
          pullRequestUrl?: string;
        };

        const existing = await resolveTask({ id, session_id, cwd });
        if (!existing) {
          return {
            content: [{ type: 'text', text: 'Task not found' }],
            isError: true,
          };
        }

        const updated = await prisma.task.update({
          where: { id: existing.id },
          data: {
            ...(title !== undefined ? { title } : {}),
            ...(description !== undefined ? { description } : {}),
            ...(status !== undefined ? { status } : {}),
            ...(effort !== undefined ? { effort } : {}),
            ...(baseBranch !== undefined ? { baseBranch } : {}),
            ...(pullRequestUrl !== undefined ? { pullRequestUrl } : {}),
          },
          include: { tabs: true },
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }],
        };
      }

      case 'tsunagi_delete_task': {
        const task = await resolveTask(args as { id?: string; session_id?: string; cwd?: string });
        if (!task) {
          return {
            content: [{ type: 'text', text: 'Task not found' }],
            isError: true,
          };
        }
        await prisma.task.update({
          where: { id: task.id },
          data: { deletedAt: new Date() },
        });
        return {
          content: [{ type: 'text', text: `Task deleted: ${task.id}` }],
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
