import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  getOllamaAccount,
  getOllamaSettings,
  getOllamaStatus,
  parseOllamaSettings,
  saveOllamaSettings,
} from '../lib/ollama-settings.js';
import {
  getLmStudioSettings,
  getLmStudioStatus,
  parseLmStudioSettings,
  saveLmStudioSettings,
  startLmStudioServer,
  stopLmStudioServer,
} from '../lib/lmstudio.js';
import { unloadProvider } from '../lib/local-llm.js';
import {
  getSearxngSettings,
  getSearxngStatus,
  parseSearxngSettings,
  restartSearxng,
  saveSearxngSettings,
  stopSearxng,
  syncSearxng,
} from '../lib/searxng.js';
import { normalizeBaseUrl } from '../lib/local-llm-env.js';

/** クエリの baseUrl（未指定なら保存済みの値）を正規化する。不正なら null */
async function resolveOllamaBaseUrl(baseUrl: string | undefined): Promise<string | null> {
  return normalizeBaseUrl(baseUrl || (await getOllamaSettings()).baseUrl);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 失敗時は 502 でメッセージを返す（外部プロセス・外部サーバーの操作用） */
async function sendResult<T>(
  reply: FastifyReply,
  run: () => Promise<T>,
  prefix: string
): Promise<FastifyReply> {
  try {
    return reply.status(200).send({ data: await run() });
  } catch (error) {
    return reply.status(502).send({ error: `${prefix}: ${errorMessage(error)}` });
  }
}

export async function settingsRoutes(fastify: FastifyInstance) {
  // ---- Ollama ----

  fastify.get('/settings/ollama', async (_request, reply) => {
    try {
      return reply.status(200).send({ data: await getOllamaSettings() });
    } catch (error) {
      fastify.log.error(error, 'GET /settings/ollama error');
      return reply.status(500).send({ error: 'Failed to fetch ollama settings' });
    }
  });

  fastify.put('/settings/ollama', async (request, reply) => {
    const parsed = parseOllamaSettings(request.body);
    if ('error' in parsed) {
      return reply.status(400).send({ error: parsed.error });
    }
    try {
      // 無効化するプロバイダーに読み込まれたモデルは、以後 tsunagi が管理しないため先に解放する
      if (!parsed.settings.enabled && (await getOllamaSettings()).enabled) {
        await unloadProvider('ollama').catch(() => undefined);
      }
      const saved = await saveOllamaSettings(parsed.settings);
      // 有効/無効に合わせて SearXNG を起動・停止する（完了は待たない）
      void syncSearxng();
      return reply.status(200).send({ data: saved });
    } catch (error) {
      fastify.log.error(error, 'PUT /settings/ollama error');
      return reply.status(500).send({ error: 'Failed to save ollama settings' });
    }
  });

  // GET /settings/ollama/status - 接続可否・バージョン・読み込み中のモデル
  fastify.get<{ Querystring: { baseUrl?: string } }>(
    '/settings/ollama/status',
    async (request, reply) => {
      const baseUrl = await resolveOllamaBaseUrl(request.query.baseUrl);
      if (!baseUrl) {
        return reply.status(400).send({ error: 'baseUrl must be a valid http(s) URL' });
      }
      return reply.status(200).send({ data: await getOllamaStatus(baseUrl) });
    }
  );

  // GET /settings/ollama/account - ollama.com のサインイン状態（WebSearch の利用可否）
  fastify.get<{ Querystring: { baseUrl?: string } }>(
    '/settings/ollama/account',
    async (request, reply) => {
      const baseUrl = await resolveOllamaBaseUrl(request.query.baseUrl);
      if (!baseUrl) {
        return reply.status(400).send({ error: 'baseUrl must be a valid http(s) URL' });
      }
      return sendResult(
        reply,
        () => getOllamaAccount(baseUrl),
        `Ollama のサインイン状態を取得できません (${baseUrl})`
      );
    }
  );

  // ---- LM Studio ----

  fastify.get('/settings/lmstudio', async (_request, reply) => {
    try {
      return reply.status(200).send({ data: await getLmStudioSettings() });
    } catch (error) {
      fastify.log.error(error, 'GET /settings/lmstudio error');
      return reply.status(500).send({ error: 'Failed to fetch LM Studio settings' });
    }
  });

  fastify.put('/settings/lmstudio', async (request, reply) => {
    const parsed = parseLmStudioSettings(request.body);
    if ('error' in parsed) {
      return reply.status(400).send({ error: parsed.error });
    }
    try {
      if (!parsed.settings.enabled && (await getLmStudioSettings()).enabled) {
        await unloadProvider('lmstudio').catch(() => undefined);
      }
      const saved = await saveLmStudioSettings(parsed.settings);
      void syncSearxng();
      return reply.status(200).send({ data: saved });
    } catch (error) {
      fastify.log.error(error, 'PUT /settings/lmstudio error');
      return reply.status(500).send({ error: 'Failed to save LM Studio settings' });
    }
  });

  // 以下は保存済みの設定（Base URL・トークン・lms のパス）で LM Studio を操作する。
  // モデルの読み込み・解放は /settings/local-llm で行う（常に1つだけ載せるため）

  fastify.get('/settings/lmstudio/status', async (_request, reply) => {
    return reply.status(200).send({ data: await getLmStudioStatus(await getLmStudioSettings()) });
  });

  fastify.post('/settings/lmstudio/server/start', async (_request, reply) => {
    return sendResult(
      reply,
      async () => {
        const settings = await getLmStudioSettings();
        await startLmStudioServer(settings);
        return getLmStudioStatus(settings);
      },
      'LM Studio のサーバーを起動できません'
    );
  });

  fastify.post('/settings/lmstudio/server/stop', async (_request, reply) => {
    return sendResult(
      reply,
      async () => {
        const settings = await getLmStudioSettings();
        await stopLmStudioServer(settings);
        return getLmStudioStatus(settings);
      },
      'LM Studio のサーバーを停止できません'
    );
  });

  // ---- SearXNG（ローカル検索） ----

  fastify.get('/settings/searxng', async (_request, reply) => {
    return reply.status(200).send({ data: await getSearxngSettings() });
  });

  fastify.put('/settings/searxng', async (request, reply) => {
    const parsed = parseSearxngSettings(request.body);
    if ('error' in parsed) {
      return reply.status(400).send({ error: parsed.error });
    }
    return reply.status(200).send({ data: await saveSearxngSettings(parsed.settings) });
  });

  fastify.get('/settings/searxng/status', async (_request, reply) => {
    return reply.status(200).send({ data: await getSearxngStatus() });
  });

  // 起動完了（最大60秒）を待たずに返す。状態は status をポーリングして確認する
  fastify.post('/settings/searxng/restart', async (_request, reply) => {
    void restartSearxng();
    return reply.status(202).send({ data: await getSearxngStatus() });
  });

  fastify.post('/settings/searxng/stop', async (_request, reply) => {
    await stopSearxng();
    return reply.status(200).send({ data: await getSearxngStatus() });
  });
}
