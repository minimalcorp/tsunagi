import type { FastifyInstance } from 'fastify';
import {
  getWhisperServerStatus,
  startWhisperServer,
  stopWhisperServer,
} from '../lib/whisper-process.js';

// ユーザーが依存関係(pipパッケージ)をセットアップ済みのローカル常駐サーバー
// (apps/whisper-server)を指す。依存関係のインストール自体はtsunagi側では行わず、
// プロセスの起動・停止のみ管理する。
const WHISPER_SERVER_URL = process.env.TSUNAGI_WHISPER_SERVER_URL || 'http://127.0.0.1:8765';

export async function whisperRoutes(fastify: FastifyInstance) {
  // GET /whisper/server/status
  fastify.get('/whisper/server/status', async (_request, reply) => {
    return reply.status(200).send(await getWhisperServerStatus());
  });

  // POST /whisper/server/start
  fastify.post('/whisper/server/start', async (_request, reply) => {
    const result = startWhisperServer();
    if (!result.started) {
      return reply.status(409).send({ error: result.error });
    }
    return reply.status(202).send(await getWhisperServerStatus());
  });

  // POST /whisper/server/stop
  fastify.post('/whisper/server/stop', async (_request, reply) => {
    const result = stopWhisperServer();
    if (!result.stopped) {
      return reply.status(409).send({ error: result.error });
    }
    return reply.status(200).send(await getWhisperServerStatus());
  });

  // POST /whisper/transcribe
  fastify.post('/whisper/transcribe', async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ error: 'No audio file provided' });
    }

    const buffer = await file.toBuffer();
    const body = new FormData();
    body.append('file', new Blob([buffer]), file.filename);

    try {
      const response = await fetch(`${WHISPER_SERVER_URL}/transcribe`, {
        method: 'POST',
        body,
      });

      if (!response.ok) {
        throw new Error(`whisper-server responded with ${response.status}`);
      }

      const result = (await response.json()) as { text: string };
      return reply.status(200).send({ text: result.text });
    } catch (error) {
      fastify.log.error(error, 'Whisper transcription error');
      return reply.status(502).send({
        error:
          error instanceof Error
            ? error.message
            : 'Transcription failed. Is apps/whisper-server running?',
      });
    }
  });
}
