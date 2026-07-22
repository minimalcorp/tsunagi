import type { FastifyInstance } from 'fastify';
import {
  getWhisperServerStatus,
  startWhisperServer,
  stopWhisperServer,
} from '../lib/whisper-process.js';
import { generateLlmCompletion } from '../lib/llm-process.js';
import { appendVoiceDebugLog } from '../lib/voice-debug-log.js';

// ユーザーが依存関係(pipパッケージ)をセットアップ済みのローカル常駐サーバー
// (apps/whisper-server)を指す。依存関係のインストール自体はtsunagi側では行わず、
// プロセスの起動・停止のみ管理する。
const WHISPER_SERVER_URL = process.env.TSUNAGI_WHISPER_SERVER_URL || 'http://127.0.0.1:8765';

// 文字起こし結果のLLM整形に使うシステムプロンプト(既定値)。Settings画面で
// 上書きされなかった場合に使う。同音異義語の誤変換(例:「句読点」→「句頭点」、
// 「誤字」→「語字」)を放置してしまう問題があったため、該当パターンを明示して
// 一語ずつ文脈と照合するよう指示している。
const DEFAULT_TRANSCRIPTION_CORRECTION_SYSTEM_PROMPT =
  '以下は音声認識(Whisper)による文字起こし結果です。元の言葉遣いや言い回し、文章構成はできるだけそのまま維持してください。行ってよいのは次の2つだけです。(1)句読点の追加。(2)音声認識特有の誤字の修正。日本語の音声認識では、発音が同じで意味の異なる漢字に変換されることがよくあります(例:「句読点」→「句頭点」、「誤字」→「語字」など)。一見すると自然な単語に見えても文脈に合わない場合は誤変換である可能性が高いため、一語ずつ文脈に合っているか確認し、明らかな誤りは正しい漢字に修正してください。要約・言い換え・フィラーの除去・文の並び替えなど、上記2つ以外の変更は行わないでください。修正後の文章のみを出力し、前置きや説明は不要です。';

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

    // LLM整形用システムプロンプトもSettings画面で編集・保存でき、指定があれば
    // 既定のプロンプトの代わりに使う(空文字列の場合は既定のプロンプトを使う)。
    const systemPromptField = file.fields.systemPrompt as { value?: unknown } | undefined;
    const systemPrompt =
      typeof systemPromptField?.value === 'string' && systemPromptField.value.trim()
        ? systemPromptField.value
        : DEFAULT_TRANSCRIPTION_CORRECTION_SYSTEM_PROMPT;

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
      appendVoiceDebugLog({ whisperPrompt: prompt, whisperText, useLlm });
      return reply.status(200).send({ text: whisperText });
    }

    // LLMによる整形が有効な場合のみ追加で問い合わせる。文字起こし自体は既に
    // 成功しているため、ここで失敗しても文字起こし結果はそのまま返す
    // (ユーザーの発話内容を無駄にしないことを、整形の成否より優先する)。
    try {
      const corrected = await generateLlmCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: whisperText },
        ],
        Math.min(4096, Math.max(512, whisperText.length * 4))
      );
      const correctedText = corrected.trim();
      appendVoiceDebugLog({
        whisperPrompt: prompt,
        whisperText,
        useLlm,
        llmSystemPrompt: systemPrompt,
        correctedText,
      });
      return reply.status(200).send({ text: correctedText });
    } catch (error) {
      fastify.log.error(error, 'LLM correction failed, falling back to raw transcription');
      appendVoiceDebugLog({
        whisperPrompt: prompt,
        whisperText,
        useLlm,
        llmSystemPrompt: systemPrompt,
        llmError: error instanceof Error ? error.message : String(error),
      });
      return reply.status(200).send({
        text: whisperText,
        warning: 'ローカルLLMによる整形に失敗したため、文字起こし結果をそのまま使用しました',
      });
    }
  });
}
