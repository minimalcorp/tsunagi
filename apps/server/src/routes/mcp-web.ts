import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { searchWeb } from '../lib/searxng.js';

/**
 * ローカルLLMタブ専用の Web 検索 MCP。組み込み WebSearch（Anthropic のサーバーツール）が
 * 使えないため、SearXNG で検索する web_search を1つだけ提供する。
 * ローカルLLMはツール数が増えるほど呼び出し精度が落ちるため、ツールは増やさない。
 */

const DEFAULT_MAX_RESULTS = 8;
const MAX_RESULTS_LIMIT = 20;

/** セッションIDをキーにしたtransportのMap */
const transports = new Map<string, StreamableHTTPServerTransport>();

function createWebMcpServer(): Server {
  const server = new Server(
    { name: 'tsunagi-web', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'web_search',
        description:
          'Search the web and return result titles, URLs and snippets. ' +
          'Use WebFetch on a result URL to read the full page.',
        inputSchema: {
          type: 'object',
          required: ['query'],
          properties: {
            query: { type: 'string', description: 'Search query' },
            max_results: {
              type: 'number',
              description: `Number of results (default ${DEFAULT_MAX_RESULTS}, max ${MAX_RESULTS_LIMIT})`,
            },
          },
          additionalProperties: false,
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (name !== 'web_search') {
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
    const query = typeof args?.query === 'string' ? args.query.trim() : '';
    if (!query) {
      return { content: [{ type: 'text', text: '`query` is required' }], isError: true };
    }
    const requested = Number(args?.max_results);
    const maxResults =
      Number.isInteger(requested) && requested > 0
        ? Math.min(requested, MAX_RESULTS_LIMIT)
        : DEFAULT_MAX_RESULTS;
    try {
      const results = await searchWeb(query, maxResults);
      const text =
        results.length === 0
          ? `No results for "${query}".`
          : results
              .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`.trimEnd())
              .join('\n\n');
      return { content: [{ type: 'text', text }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
        isError: true,
      };
    }
  });

  return server;
}

export async function mcpWebRoutes(fastify: FastifyInstance) {
  // POST /mcp/web - セッション初期化またはメッセージ処理
  fastify.post('/mcp/web', async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = (request.headers as Record<string, string>)['mcp-session-id'];

    if (sessionId) {
      const transport = transports.get(sessionId);
      if (!transport) {
        return reply.status(404).send({ error: `Session not found: ${sessionId}` });
      }
      await reply.hijack();
      await transport.handleRequest(request.raw, reply.raw, request.body);
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        transports.set(id, transport);
      },
      onsessionclosed: (id) => {
        transports.delete(id);
      },
    });
    await createWebMcpServer().connect(transport);
    await reply.hijack();
    await transport.handleRequest(request.raw, reply.raw, request.body);
  });

  // GET / DELETE /mcp/web - SSEストリーム / セッション終了（既存セッション用）
  const handleExisting = async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = (request.headers as Record<string, string>)['mcp-session-id'];
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport) {
      return reply.status(400).send({ error: 'Invalid or missing mcp-session-id header' });
    }
    await reply.hijack();
    await transport.handleRequest(request.raw, reply.raw);
  };
  fastify.get('/mcp/web', handleExisting);
  fastify.delete('/mcp/web', handleExisting);
}
