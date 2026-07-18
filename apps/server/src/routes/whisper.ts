import type { FastifyInstance } from 'fastify';
import {
  getWhisperServerStatus,
  startWhisperServer,
  stopWhisperServer,
} from '../lib/whisper-process.js';
import { generateLlmCompletion } from '../lib/llm-process.js';

// ユーザーが依存関係(pipパッケージ)をセットアップ済みのローカル常駐サーバー
// (apps/whisper-server)を指す。依存関係のインストール自体はtsunagi側では行わず、
// プロセスの起動・停止のみ管理する。
const WHISPER_SERVER_URL = process.env.TSUNAGI_WHISPER_SERVER_URL || 'http://127.0.0.1:8765';

// 文字起こし結果のLLM整形に使うシステムプロンプト。検証で
// 「原文の言葉遣いを維持しつつ句読点・誤字だけ直す」設定が有効と確認できたもの。
const TRANSCRIPTION_CORRECTION_SYSTEM_PROMPT =
  '以下は音声認識による文字起こし結果です。元の言葉遣いや言い回し、文章構成はできるだけそのまま維持してください。行ってよいのは句読点の追加と、明らかな誤字(音声認識の誤変換)の修正のみです。要約・言い換え・フィラーの除去・文の並び替えなどは行わないでください。修正後の文章のみを出力し、前置きや説明は不要です。';

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
    const result = await stopWhisperServer();
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

    // 音声ファイルと同じmultipartペイロード内の`prompt`フィールド(あれば)を
    // whisper-serverのinitial_promptとしてそのまま転送する。
    const promptField = file.fields.prompt as { value?: unknown } | undefined;
    const prompt = typeof promptField?.value === 'string' ? promptField.value : undefined;

    // ローカルLLMによる整形を使うかどうかはクライアント(Settingsの有効/無効フラグ)から渡される。
    const useLlmField = file.fields.useLlm as { value?: unknown } | undefined;
    const useLlm = useLlmField?.value === 'true';

    const buffer = await file.toBuffer();
    const body = new FormData();
    body.append('file', new Blob([buffer]), file.filename);
    if (prompt) body.append('prompt', prompt);

    let whisperText: string;
    try {
      const response = await fetch(`${WHISPER_SERVER_URL}/transcribe`, {
        method: 'POST',
        body,
      });

      if (!response.ok) {
        throw new Error(`whisper-server responded with ${response.status}`);
      }

      const result = (await response.json()) as { text: string };
      whisperText = result.text;
    } catch (error) {
      fastify.log.error(error, 'Whisper transcription error');
      return reply.status(502).send({
        error:
          error instanceof Error
            ? error.message
            : 'Transcription failed. Is apps/whisper-server running?',
      });
    }

    if (!useLlm || !whisperText) {
      return reply.status(200).send({ text: whisperText });
    }

    // LLMによる整形が有効な場合のみ追加で問い合わせる。文字起こし自体は既に
    // 成功しているため、ここで失敗しても文字起こし結果はそのまま返す
    // (ユーザーの発話内容を無駄にしないことを、整形の成否より優先する)。
    try {
      const corrected = await generateLlmCompletion(
        [
          { role: 'system', content: TRANSCRIPTION_CORRECTION_SYSTEM_PROMPT },
          { role: 'user', content: whisperText },
        ],
        Math.min(4096, Math.max(512, whisperText.length * 4))
      );
      return reply.status(200).send({ text: corrected.trim() });
    } catch (error) {
      fastify.log.error(error, 'LLM correction failed, falling back to raw transcription');
      return reply.status(200).send({
        text: whisperText,
        warning: 'ローカルLLMによる整形に失敗したため、文字起こし結果をそのまま使用しました',
      });
    }
  });
}
