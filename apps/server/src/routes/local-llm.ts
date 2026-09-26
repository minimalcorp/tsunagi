import http from 'node:http';
import https from 'node:https';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  activate,
  beginRequest,
  endRequest,
  ensureActiveLoaded,
  getLocalLlmSettings,
  getLocalLlmStatus,
  listLocalLlmModels,
  parseLocalLlmSettings,
  unloadAll,
} from '../lib/local-llm.js';
import { LOCAL_MODEL_ALIAS, parseContextTokens } from '../lib/local-llm-env.js';
import { estimateLmStudioLoad, getLmStudioSettings } from '../lib/lmstudio.js';

// Claude Code のリクエストは会話が長いと数 MB になる（画像を含む場合はさらに大きい）
const PROXY_BODY_LIMIT = 200 * 1024 * 1024;

// 転送先に渡すリクエストヘッダー（認証は転送先に合わせて付け直す）
const FORWARD_REQUEST_HEADERS = ['content-type', 'accept', 'anthropic-version', 'anthropic-beta'];
// クライアントに返さないレスポンスヘッダー（Node が付け直す／中継で意味が変わる）
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-length',
]);

/** Anthropic API 形式のエラー。4xx は Claude Code が再送せずそのまま表示する */
function sendApiError(reply: FastifyReply, status: number, message: string) {
  return reply.status(status).send({
    type: 'error',
    error: { type: status >= 500 ? 'api_error' : 'invalid_request_error', message },
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * ローカルLLMタブの Claude Code からのリクエストを、使用中のモデルに書き換えて転送する。
 * 使用中のモデルがメモリになければ（他のモデルを解放してから）読み込む。
 * ローカルLLMはプロンプトの読み込みに数分かかるため、転送にタイムアウトは設けない。
 */
async function proxy(request: FastifyRequest<{ Params: { '*': string } }>, reply: FastifyReply) {
  const path = request.params['*'];

  // モデル一覧は使用中のモデルだけを返す（Claude Code のモデル自動取得用。既定では使われない）
  if (request.method === 'GET' && path === 'v1/models') {
    return reply.send({
      data: [{ id: LOCAL_MODEL_ALIAS, type: 'model', display_name: 'ローカルLLM' }],
      has_more: false,
    });
  }

  beginRequest();
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    endRequest();
  };

  let target;
  try {
    target = await ensureActiveLoaded();
  } catch (error) {
    finish();
    return sendApiError(reply, 400, errorMessage(error));
  }

  let body: Buffer | undefined;
  if (request.body !== undefined && request.body !== null) {
    const json = request.body as Record<string, unknown>;
    if (typeof json === 'object' && 'model' in json) json.model = target.runModel;
    body = Buffer.from(JSON.stringify(json));
  }

  const query = request.raw.url?.includes('?')
    ? request.raw.url.slice(request.raw.url.indexOf('?'))
    : '';
  const url = new URL(`${target.baseUrl}/${path}${query}`);
  const headers: Record<string, string> = {
    'x-api-key': target.authToken,
    authorization: `Bearer ${target.authToken}`,
  };
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers[name];
    if (typeof value === 'string') headers[name] = value;
  }
  if (body) headers['content-length'] = String(body.length);

  await reply.hijack();
  const upstream = (url.protocol === 'https:' ? https : http).request(url, {
    method: request.method,
    headers,
  });

  // クライアント（Claude Code）が中断したら転送先も止める（ESC で生成を止めたときにモデルを空ける）
  reply.raw.on('close', () => {
    if (!reply.raw.writableFinished) upstream.destroy();
    finish();
  });

  upstream.on('response', (res) => {
    const responseHeaders: Record<string, string | string[]> = {};
    for (const [name, value] of Object.entries(res.headers)) {
      if (value !== undefined && !HOP_BY_HOP_HEADERS.has(name)) responseHeaders[name] = value;
    }
    reply.raw.writeHead(res.statusCode ?? 502, responseHeaders);
    res.pipe(reply.raw);
    res.on('end', finish);
    res.on('error', finish);
  });

  upstream.on('error', (error) => {
    finish();
    if (!reply.raw.headersSent) {
      reply.raw.writeHead(502, { 'content-type': 'application/json' });
      reply.raw.end(
        JSON.stringify({
          type: 'error',
          error: {
            type: 'api_error',
            message: `ローカルLLM（${target.baseUrl}）に接続できません: ${error.message}`,
          },
        })
      );
    } else {
      reply.raw.destroy(error);
    }
  });

  upstream.end(body);
}

export async function localLlmRoutes(fastify: FastifyInstance) {
  // ---- 中継口（ローカルLLMタブの ANTHROPIC_BASE_URL） ----
  fastify.route<{ Params: { '*': string } }>({
    method: ['GET', 'POST'],
    url: '/local-llm/proxy/*',
    bodyLimit: PROXY_BODY_LIMIT,
    handler: proxy,
  });

  // ---- PreModelSwitch フック（ローカルLLMタブの --settings で登録） ----
  // モデルは Settings でだけ切り替えるため、/model による切り替えは常に拒否する。
  // Claude Code は /model の Enter や `/model 名前` の結果を ~/.claude/settings.json の model に保存し、
  // 通常の Claude タブの既定モデルまで変えてしまう。opus / sonnet 等の別名も中継口の名前に割り当てて
  // いるため「同じモデル」への切り替えに見えるが、保存はされるので区別せずに拒否する
  fastify.post('/hooks/local-llm/pre-model-switch', async (_request, reply) => {
    return reply.send({
      hookSpecificOutput: {
        hookEventName: 'PreModelSwitch',
        permissionDecision: 'deny',
        permissionDecisionReason:
          'ローカルLLMのタブでは /model でモデルを切り替えられません。tsunagi の Settings（Claude Code のローカルLLM）で切り替えてください（全タブに反映されます）',
      },
    });
  });

  // ---- Settings ----

  fastify.get('/settings/local-llm', async (_request, reply) => {
    return reply.send({ data: await getLocalLlmSettings() });
  });

  // 使用中のモデルが変わった場合は、他のモデルを解放して読み込みを始める（完了は待たない）
  fastify.put('/settings/local-llm', async (request, reply) => {
    const parsed = parseLocalLlmSettings(request.body);
    if ('error' in parsed) return reply.status(400).send({ error: parsed.error });
    const result = await activate(parsed.settings);
    if (!result.ok) return reply.status(409).send({ error: result.error });
    return reply.send({ data: result.settings });
  });

  fastify.get('/settings/local-llm/status', async (_request, reply) => {
    return reply.send({ data: await getLocalLlmStatus() });
  });

  fastify.get('/settings/local-llm/models', async (_request, reply) => {
    return reply.send({ data: await listLocalLlmModels() });
  });

  // 使用中のモデルを今すぐ読み込む（完了は待たない）
  fastify.post('/settings/local-llm/load', async (_request, reply) => {
    ensureActiveLoaded().catch(() => undefined);
    return reply.status(202).send({ data: await getLocalLlmStatus() });
  });

  fastify.post('/settings/local-llm/unload', async (_request, reply) => {
    try {
      await unloadAll();
    } catch (error) {
      return reply.status(502).send({ error: `モデルを解放できません: ${errorMessage(error)}` });
    }
    return reply.send({ data: await getLocalLlmStatus() });
  });

  // GET /settings/local-llm/estimate?model=&contextTokens= - LM Studio の必要メモリの見積もり
  fastify.get<{ Querystring: { model?: string; contextTokens?: string } }>(
    '/settings/local-llm/estimate',
    async (request, reply) => {
      const { model } = request.query;
      const contextTokens = parseContextTokens(request.query.contextTokens);
      if (!model || !contextTokens) {
        return reply.status(400).send({ error: 'model and contextTokens are required' });
      }
      try {
        const data = await estimateLmStudioLoad(await getLmStudioSettings(), model, contextTokens);
        return reply.send({ data });
      } catch (error) {
        return reply
          .status(502)
          .send({ error: `メモリの見積もりを取得できません: ${errorMessage(error)}` });
      }
    }
  );
}
