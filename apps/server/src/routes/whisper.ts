import type { FastifyInstance } from 'fastify';
import {
  deleteAsrModel,
  getWhisperServerStatus,
  listAsrModels,
  selectAsrModel,
  startWhisperServer,
  stopWhisperServer,
} from '../lib/whisper-process.js';
import { appendVoiceDebugLog } from '../lib/voice-debug-log.js';

// ローカル常駐の音声認識サーバー(apps/whisper-server)を指す。
// 読み込むモデル(Whisper / Qwen3-ASR)は起動時に whisper-process 側で指定する。
const WHISPER_SERVER_URL = process.env.TSUNAGI_WHISPER_SERVER_URL || 'http://127.0.0.1:8765';

export async function whisperRoutes(fastify: FastifyInstance) {
  // GET /whisper/server/status
  fastify.get('/whisper/server/status', async (_request, reply) => {
    return reply.status(200).send(await getWhisperServerStatus());
  });

  // POST /whisper/server/start
  fastify.post('/whisper/server/start', async (_request, reply) => {
    const result = await startWhisperServer();
    if (!result.started) {
      return reply.status(409).send({ error: result.error });
    }
    return reply.status(202).send(await getWhisperServerStatus());
  });

  // POST /whisper/server/stop
  fastify.post('/whisper/server/stop', async (_request, reply) => {
    const result = await stopWhisperServer();
    if (!result.stopped) {
      return reply.status(409).send({ error: result.error });
    }
    return reply.status(200).send(await getWhisperServerStatus());
  });

  // GET /whisper/models
  fastify.get('/whisper/models', async (_request, reply) => {
    return reply.status(200).send({ data: await listAsrModels() });
  });

  // PUT /whisper/models/selected
  fastify.put<{ Body: { modelId?: unknown } }>(
    '/whisper/models/selected',
    async (request, reply) => {
      const modelId = request.body?.modelId;
      if (typeof modelId !== 'string') {
        return reply.status(400).send({ error: 'modelId is required' });
      }
      const result = await selectAsrModel(modelId);
      if (!result.ok) {
        return reply.status(409).send({ error: result.error });
      }
      return reply.status(200).send({ data: await listAsrModels() });
    }
  );

  // DELETE /whisper/models/:modelId
  fastify.delete<{ Params: { modelId: string } }>(
    '/whisper/models/:modelId',
    async (request, reply) => {
      const result = await deleteAsrModel(request.params.modelId);
      if (!result.ok) {
        return reply.status(409).send({ error: result.error });
      }
      return reply.status(200).send({ data: await listAsrModels() });
    }
  );

  // POST /whisper/transcribe
  fastify.post('/whisper/transcribe', async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ error: 'No audio file provided' });
    }

    // 音声ファイルと同じmultipartペイロード内の`prompt`フィールド(あれば)を
    // whisper-serverのinitial_promptとしてそのまま転送する。
    const promptField = file.fields.prompt as { value?: unknown } | undefined;
    const prompt = typeof promptField?.value === 'string' ? promptField.value : undefined;

    // 発話中の途中経過表示用のリクエスト。確定前の暫定結果なので、
    // デバッグログはスキップする。
    const interimField = file.fields.interim as { value?: unknown } | undefined;
    const interim = interimField?.value === 'true';

    const buffer = await file.toBuffer();
    const body = new FormData();
    body.append('file', new Blob([buffer]), file.filename);
    if (prompt) body.append('prompt', prompt);

    let whisperText: string;
    let model: string | undefined;
    const startedAt = Date.now();
    try {
      const response = await fetch(`${WHISPER_SERVER_URL}/transcribe`, {
        method: 'POST',
        body,
      });

      if (!response.ok) {
        throw new Error(`whisper-server responded with ${response.status}`);
      }

      const result = (await response.json()) as { text: string; model?: string };
      whisperText = result.text;
      model = result.model;
    } catch (error) {
      fastify.log.error(error, 'Whisper transcription error');
      return reply.status(502).send({
        error:
          error instanceof Error
            ? error.message
            : 'Transcription failed. Is apps/whisper-server running?',
      });
    }

    if (!interim) {
      appendVoiceDebugLog({
        model,
        elapsedMs: Date.now() - startedAt,
        whisperPrompt: prompt,
        whisperText,
      });
    }
    return reply.status(200).send({ text: whisperText });
  });
}
