'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MicVAD } from '@ricky0123/vad-web';
import { apiUrl } from '@/lib/api-url';
import { toaster } from '@/lib/toaster';
import {
  LLM_SYSTEM_PROMPT_STORAGE_KEY,
  VOICE_INPUT_ENABLED_STORAGE_KEY,
  WHISPER_PROMPT_STORAGE_KEY,
} from '@/lib/voice-input';
import { LOCAL_LLM_ENABLED_STORAGE_KEY } from '@/components/settings/LocalLlmSection';

// whisper-serverの起動状態を軽くポーリングし、未起動時はボタンを無効化する。
const SERVER_STATUS_POLL_MS = 5000;

const SAMPLE_RATE = 16000;
// Silero VAD v5 のフレーム長(512サンプル = 32ms)
const FRAME_MS = 32;

// VAD(発話区間検出)の設定。Silero VADの推奨値(0.5 / 0.35)に合わせ、既定値(0.3)より
// 雑音を発話と誤検出しにくくする。redemptionMsは「この長さ無音が続いたら発話終了」とみなす時間。
const VAD_POSITIVE_THRESHOLD = 0.5;
const VAD_NEGATIVE_THRESHOLD = 0.35;
// 話の途中の「間」(言葉を考える数百ms〜1秒程度の沈黙)で発話が分割・確定されないよう長めに取る。
// 末尾の無音は確定時に削るため、長くしてもWhisperへ送る無音(ハルシネーションの原因)は増えない。
const VAD_REDEMPTION_MS = 1300;
const VAD_PRE_SPEECH_PAD_MS = 300;
const VAD_MIN_SPEECH_MS = 300;
// 発話終了時の音声には、終了判定に使った無音(redemptionMs分)が末尾に含まれる。
// 無音はWhisperのハルシネーション(「ご視聴ありがとうございました」等)の原因になるため、
// 語尾が切れない程度の余白だけ残して削る。
const TRAILING_SILENCE_KEEP_MS = 300;

// 発話中の途中経過は、前回の文字起こしからこれ以上音声が伸びたら再度文字起こしする。
const INTERIM_INTERVAL_MS = 800;

// レベルメーターはRMS(実効値)をdBFSに変換し、この範囲で0〜1へ正規化する。
const LEVEL_MIN_DB = -60;
const LEVEL_MAX_DB = -10;

type ServerStep =
  | 'not_running'
  | 'installing_deps'
  | 'downloading_model'
  | 'starting_server'
  | 'running'
  | 'running_external'
  | 'error';

const SERVER_UP_STEPS: ServerStep[] = ['running', 'running_external'];

export type VoiceInputStatus = 'off' | 'starting' | 'listening';

/** 1回の発話。speaking=発話中(途中経過を表示)、finalizing=発話終了後の確定文字起こし待ち */
export interface VoiceUtterance {
  id: number;
  text: string;
  phase: 'speaking' | 'finalizing';
}

/**
 * マイク音量(0〜1)の購読ストア。音量は32ms毎に変化するため、Reactのstateに載せると
 * フックを使うコンポーネント(ターミナル一式)全体が再描画されてしまう。メーター部分だけが
 * useSyncExternalStoreで購読できるよう、state とは別に持つ。
 */
export interface LevelStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => number;
}

function createLevelStore() {
  let level = 0;
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => level,
    set: (next: number) => {
      if (next === level) return;
      level = next;
      listeners.forEach((l) => l());
    },
  };
}

export interface VoiceInputController {
  /** Settings画面で音声入力が有効化されているか */
  enabled: boolean;
  serverReady: boolean;
  status: VoiceInputStatus;
  utterances: VoiceUtterance[];
  levelStore: LevelStore;
  toggle: () => void;
}

interface UseVoiceInputOptions {
  /** 確定した文字起こし結果（発話順に呼ばれる） */
  onFinal: (text: string) => void;
}

function concatFrames(frames: Float32Array[]): Float32Array {
  const total = frames.reduce((sum, f) => sum + f.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const f of frames) {
    out.set(f, offset);
    offset += f.length;
  }
  return out;
}

function frameLevel(frame: Float32Array): number {
  let sumSquares = 0;
  for (let i = 0; i < frame.length; i++) sumSquares += frame[i] * frame[i];
  const rms = Math.sqrt(sumSquares / frame.length);
  const db = rms > 0 ? 20 * Math.log10(rms) : LEVEL_MIN_DB;
  return Math.min(1, Math.max(0, (db - LEVEL_MIN_DB) / (LEVEL_MAX_DB - LEVEL_MIN_DB)));
}

/**
 * 音声入力を有効化している間、VAD(Silero VAD)でマイク入力を常時監視し、発話区間ごとに
 * Whisperで文字起こしする。発話中は一定間隔で途中経過を文字起こしして utterances に反映し、
 * 発話終了後の確定結果は onFinal へ発話順に渡す。
 *
 * 無音区間はWhisperへ送らないため、無音からのハルシネーションも起きにくい。
 */
export function useVoiceInput({ onFinal }: UseVoiceInputOptions): VoiceInputController {
  const [enabled, setEnabled] = useState(false);
  const [serverStep, setServerStep] = useState<ServerStep | null>(null);
  const [status, setStatus] = useState<VoiceInputStatus>('off');
  const [utterances, setUtterances] = useState<VoiceUtterance[]>([]);
  const [levelStore] = useState(createLevelStore);

  const vadRef = useRef<MicVAD | null>(null);
  const utteranceIdRef = useRef(0);
  // 発話中(SpeechStart〜SpeechEnd)の音声フレームと、途中経過の送信状態
  const speakingIdRef = useRef<number | null>(null);
  const speechFramesRef = useRef<Float32Array[]>([]);
  const recentFramesRef = useRef<Float32Array[]>([]);
  const interimInFlightRef = useRef(false);
  const lastInterimFramesRef = useRef(0);
  // 確定結果を発話順に onFinal へ渡すための直列化チェーン
  const finalChainRef = useRef<Promise<void>>(Promise.resolve());
  const onFinalRef = useRef(onFinal);
  const unmountedRef = useRef(false);

  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  useEffect(() => {
    setEnabled(localStorage.getItem(VOICE_INPUT_ENABLED_STORAGE_KEY) === 'true');
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const fetchServerStatus = async () => {
      try {
        const res = await fetch(apiUrl('/api/whisper/server/status'));
        const data = (await res.json()) as { step: ServerStep };
        if (!cancelled) setServerStep(data.step);
      } catch {
        if (!cancelled) setServerStep('not_running');
      }
    };

    void fetchServerStatus();
    const interval = setInterval(fetchServerStatus, SERVER_STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled]);

  const removeUtterance = useCallback((id: number) => {
    setUtterances((prev) => prev.filter((u) => u.id !== id));
  }, []);

  const requestTranscription = useCallback(
    async (audio: Float32Array, interim: boolean): Promise<{ text: string; warning?: string }> => {
      const { utils } = await import('@ricky0123/vad-web');
      // 16bit PCMのWAV。whisper-server(PyAV)がそのままデコードできる。
      const wav = utils.encodeWAV(audio, 1, SAMPLE_RATE, 1, 16);

      // @fastify/multipartのrequest.file()は、fileパートより前に現れたフィールド
      // しか file.fields に含めない。そのため他のフィールドは必ずfileより前に
      // appendする(この順序を間違えるとフィールドがサーバー側で無視される)。
      const formData = new FormData();
      const prompt = localStorage.getItem(WHISPER_PROMPT_STORAGE_KEY);
      if (prompt) formData.append('prompt', prompt);
      formData.append('interim', String(interim));
      if (!interim) {
        const useLlm = localStorage.getItem(LOCAL_LLM_ENABLED_STORAGE_KEY) === 'true';
        formData.append('useLlm', String(useLlm));
        const systemPrompt = localStorage.getItem(LLM_SYSTEM_PROMPT_STORAGE_KEY);
        if (systemPrompt) formData.append('systemPrompt', systemPrompt);
      }
      formData.append('file', new Blob([wav], { type: 'audio/wav' }), 'speech.wav');

      const response = await fetch(apiUrl('/api/whisper/transcribe'), {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || `HTTPエラー: ${response.status}`);
      }
      return (await response.json()) as { text: string; warning?: string };
    },
    []
  );

  const sendInterim = useCallback(
    (id: number) => {
      interimInFlightRef.current = true;
      lastInterimFramesRef.current = speechFramesRef.current.length;
      const audio = concatFrames(speechFramesRef.current);
      requestTranscription(audio, true)
        .then(({ text }) => {
          // 確定済み(一覧から消えた)発話や、既に確定待ちに入った発話の途中経過で
          // 表示を巻き戻さないよう、発話中のものだけ更新する。
          setUtterances((prev) =>
            prev.map((u) => (u.id === id && u.phase === 'speaking' ? { ...u, text } : u))
          );
        })
        .catch(() => {
          // 途中経過は表示用の暫定値なので、失敗しても確定処理に任せて無視する。
        })
        .finally(() => {
          interimInFlightRef.current = false;
        });
    },
    [requestTranscription]
  );

  const finalize = useCallback(
    (id: number, audio: Float32Array) => {
      const trimSamples = ((VAD_REDEMPTION_MS - TRAILING_SILENCE_KEEP_MS) * SAMPLE_RATE) / 1000;
      const trimmed = audio.subarray(0, Math.max(0, audio.length - trimSamples));
      const request = requestTranscription(trimmed, false);

      finalChainRef.current = finalChainRef.current.then(async () => {
        try {
          const { text, warning } = await request;
          if (warning) {
            toaster.create({
              type: 'error',
              title: 'LLM整形をスキップしました',
              description: warning,
            });
          }
          if (text) onFinalRef.current(text);
        } catch (error) {
          toaster.create({
            type: 'error',
            title: '文字起こしに失敗しました',
            description: error instanceof Error ? error.message : String(error),
          });
        } finally {
          removeUtterance(id);
        }
      });
    },
    [requestTranscription, removeUtterance]
  );

  const stop = useCallback(async () => {
    const vad = vadRef.current;
    vadRef.current = null;
    speakingIdRef.current = null;
    speechFramesRef.current = [];
    recentFramesRef.current = [];
    levelStore.set(0);
    // 確定待ちの発話は処理を続け、発話途中のもの(未確定の途中経過)だけ破棄する。
    setUtterances((prev) => prev.filter((u) => u.phase === 'finalizing'));
    setStatus('off');
    await vad?.destroy().catch(() => {});
  }, [levelStore]);

  const start = useCallback(async () => {
    setStatus('starting');
    try {
      const { MicVAD } = await import('@ricky0123/vad-web');
      const preSpeechFrames = Math.ceil(VAD_PRE_SPEECH_PAD_MS / FRAME_MS) + 1;

      const vad = await MicVAD.new({
        model: 'v5',
        baseAssetPath: '/vad/',
        onnxWASMBasePath: '/vad/',
        positiveSpeechThreshold: VAD_POSITIVE_THRESHOLD,
        negativeSpeechThreshold: VAD_NEGATIVE_THRESHOLD,
        redemptionMs: VAD_REDEMPTION_MS,
        preSpeechPadMs: VAD_PRE_SPEECH_PAD_MS,
        minSpeechMs: VAD_MIN_SPEECH_MS,
        ortConfig: (ort) => {
          ort.env.logLevel = 'error';
          // マルチスレッド版wasmはcross-origin isolation(COOP/COEP)が必要なため、
          // 警告を出さずにシングルスレッドで動かす(VADの推論は十分軽い)。
          ort.env.wasm.numThreads = 1;
        },
        onFrameProcessed: (_probs, frame) => {
          levelStore.set(frameLevel(frame));

          const id = speakingIdRef.current;
          if (id === null) {
            // 発話開始前の音声も途中経過の文字起こしに含めるため直近分だけ保持しておく
            // (FrameProcessedはSpeechStartより先に通知される)。
            const recent = recentFramesRef.current;
            recent.push(frame);
            if (recent.length > preSpeechFrames) recent.shift();
            return;
          }

          speechFramesRef.current.push(frame);
          const newFrames = speechFramesRef.current.length - lastInterimFramesRef.current;
          if (!interimInFlightRef.current && newFrames * FRAME_MS >= INTERIM_INTERVAL_MS) {
            sendInterim(id);
          }
        },
        onSpeechStart: () => {
          const id = ++utteranceIdRef.current;
          speakingIdRef.current = id;
          speechFramesRef.current = recentFramesRef.current;
          recentFramesRef.current = [];
          lastInterimFramesRef.current = 0;
          setUtterances((prev) => [...prev, { id, text: '', phase: 'speaking' }]);
        },
        onVADMisfire: () => {
          const id = speakingIdRef.current;
          speakingIdRef.current = null;
          speechFramesRef.current = [];
          if (id !== null) removeUtterance(id);
        },
        onSpeechEnd: (audio) => {
          const id = speakingIdRef.current;
          speakingIdRef.current = null;
          speechFramesRef.current = [];
          if (id === null) return;
          setUtterances((prev) =>
            prev.map((u) => (u.id === id ? { ...u, phase: 'finalizing' } : u))
          );
          finalize(id, audio);
        },
      });
      // 初期化(マイク許可ダイアログ・モデル読み込み)の間にページを離れていた場合は即解放する
      if (unmountedRef.current) {
        await vad.destroy();
        return;
      }
      vadRef.current = vad;
      setStatus('listening');
    } catch (error) {
      setStatus('off');
      toaster.create({
        type: 'error',
        title: '音声入力を開始できませんでした',
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }, [finalize, levelStore, removeUtterance, sendInterim]);

  const toggle = useCallback(() => {
    if (status === 'listening') void stop();
    else if (status === 'off') void start();
  }, [status, start, stop]);

  // アンマウント時(タスク詳細ページを離れた時)はマイクを確実に解放する
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      void vadRef.current?.destroy().catch(() => {});
      vadRef.current = null;
    };
  }, []);

  return {
    enabled,
    serverReady: serverStep !== null && SERVER_UP_STEPS.includes(serverStep),
    status,
    utterances,
    levelStore,
    toggle,
  };
}
