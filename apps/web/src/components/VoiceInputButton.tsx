'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiUrl } from '@/lib/api-url';
import { toaster } from '@/lib/toaster';
import { LOCAL_LLM_ENABLED_STORAGE_KEY } from '@/components/settings/LocalLlmSection';

// MediaRecorderのOpusは十分な品質を保ちつつ低容量（128kbpsで8秒≒150KB程度）。
// ブラウザ既定のビットレートは低めに倒れることがあるため明示的に指定する。
const AUDIO_BITS_PER_SECOND = 128_000;

const STORAGE_KEY = 'tsunagi:voice-input-enabled';
// Settings画面で編集できる、whisperのinitial_prompt(表記ゆれ・句読点等のヒント)。
export const WHISPER_PROMPT_STORAGE_KEY = 'tsunagi:whisper-prompt';
// whisper-serverの起動状態を軽くポーリングし、未起動時はボタンを無効化する。
const SERVER_STATUS_POLL_MS = 5000;

// レベルメーターはRMS(実効値)をdBFSに変換し、この範囲で0〜1へ正規化する。
// 通常の会話音量はこのレンジに収まりやすく、frequencyData平均より聴感に近い。
const LEVEL_MIN_DB = -60;
const LEVEL_MAX_DB = -10;

// 録音全体を通してこの正規化レベル(0〜1)を一度も超えなかった場合は「実質無音」と
// みなし、Whisperへ送らずに済ませる。無音・雑音のみの区間をWhisperに投げると、
// 自信満々に無関係な文章を生成する(ハルシネーション)ことがあるため、そもそも
// 呼び出さないのが最も確実な対策。
const SILENCE_PEAK_THRESHOLD = 0.15;

type RecordingState = 'idle' | 'recording' | 'transcribing';
type ServerStep =
  | 'not_running'
  | 'installing_deps'
  | 'downloading_model'
  | 'starting_server'
  | 'running'
  | 'running_external'
  | 'error';

const SERVER_UP_STEPS: ServerStep[] = ['running', 'running_external'];

interface VoiceInputButtonProps {
  /** 文字起こし結果を受け取るコールバック（対象タブへの入力注入は呼び出し側の責務） */
  onTranscribed: (text: string) => void;
}

/**
 * 録音開始→(音量メーターを表示しながら録音)→停止→文字起こし、を行うアイコンボタン。
 * Settings画面で音声入力を有効化していない場合は何も表示しない。
 */
export function VoiceInputButton({ onTranscribed }: VoiceInputButtonProps) {
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<RecordingState>('idle');
  const [level, setLevel] = useState(0);
  const [serverStep, setServerStep] = useState<ServerStep | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const levelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const smoothedLevelRef = useRef(0);
  const peakLevelRef = useRef(0);

  useEffect(() => {
    setEnabled(localStorage.getItem(STORAGE_KEY) === 'true');
  }, []);

  // whisper-serverの起動状態を定期的に確認し、未起動ならボタンを無効化する。
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

  const stopLevelMeter = useCallback(() => {
    if (levelIntervalRef.current) {
      clearInterval(levelIntervalRef.current);
      levelIntervalRef.current = null;
    }
    void audioCtxRef.current?.close();
    audioCtxRef.current = null;
    setLevel(0);
  }, []);

  useEffect(() => {
    return () => {
      stopLevelMeter();
    };
  }, [stopLevelMeter]);

  const startLevelMeter = useCallback((stream: MediaStream) => {
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    audioCtxRef.current = audioCtx;

    smoothedLevelRef.current = 0;
    peakLevelRef.current = 0;
    const data = new Float32Array(analyser.fftSize);
    levelIntervalRef.current = setInterval(() => {
      analyser.getFloatTimeDomainData(data);
      let sumSquares = 0;
      for (let i = 0; i < data.length; i++) {
        sumSquares += data[i] * data[i];
      }
      const rms = Math.sqrt(sumSquares / data.length);
      const db = rms > 0 ? 20 * Math.log10(rms) : LEVEL_MIN_DB;
      const normalized = Math.min(
        1,
        Math.max(0, (db - LEVEL_MIN_DB) / (LEVEL_MAX_DB - LEVEL_MIN_DB))
      );
      // 平滑化前の瞬間値でピークを見る(平滑化後だと短い発声の山がなまってしまうため)。
      peakLevelRef.current = Math.max(peakLevelRef.current, normalized);
      // 平滑化は最小限（ジッター除去程度）に留め、実際の発声への追従を優先する
      smoothedLevelRef.current = smoothedLevelRef.current * 0.3 + normalized * 0.7;
      setLevel(smoothedLevelRef.current);
    }, 50);
  }, []);

  const transcribe = useCallback(
    async (blob: Blob) => {
      setState('transcribing');
      try {
        // サーバー側(PyAV)がwebm/opusを直接デコードできるため、クライアント側で
        // WAVへ再変換しない（Opus圧縮は録音時点で既に発生しており、無圧縮WAVへ
        // 変換し直しても音質は改善せず転送量が増えるだけ）。
        //
        // @fastify/multipartのrequest.file()は、fileパートより前に現れたフィールド
        // しか file.fields に含めない。そのため他のフィールドは必ずfileより前に
        // appendする(この順序を間違えるとフィールドがサーバー側で無視される)。
        const formData = new FormData();
        const prompt = localStorage.getItem(WHISPER_PROMPT_STORAGE_KEY);
        if (prompt) formData.append('prompt', prompt);
        const useLlm = localStorage.getItem(LOCAL_LLM_ENABLED_STORAGE_KEY) === 'true';
        formData.append('useLlm', String(useLlm));
        formData.append('file', blob, 'recording.webm');

        const response = await fetch(apiUrl('/api/whisper/transcribe'), {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || `HTTPエラー: ${response.status}`);
        }

        const data = (await response.json()) as { text: string; warning?: string };
        if (data.warning) {
          toaster.create({
            type: 'error',
            title: 'LLM整形をスキップしました',
            description: data.warning,
          });
        }
        if (data.text) onTranscribed(data.text);
      } catch (error) {
        toaster.create({
          type: 'error',
          title: '文字起こしに失敗しました',
          description: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setState('idle');
      }
    },
    [onTranscribed]
  );

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      startLevelMeter(stream);

      const recorder = new MediaRecorder(stream, {
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        const peakLevel = peakLevelRef.current;
        stopLevelMeter();

        if (peakLevel < SILENCE_PEAK_THRESHOLD) {
          toaster.create({
            type: 'error',
            title: '音声が検出されませんでした',
            description: 'マイクに向かって話してから、もう一度お試しください。',
          });
          setState('idle');
          return;
        }

        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        void transcribe(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setState('recording');
    } catch (error) {
      toaster.create({
        type: 'error',
        title: 'マイクにアクセスできませんでした',
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }, [transcribe, startLevelMeter, stopLevelMeter]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  if (!enabled) return null;

  const serverReady = serverStep !== null && SERVER_UP_STEPS.includes(serverStep);
  const disabled = state === 'transcribing' || (state === 'idle' && !serverReady);
  const title =
    state === 'recording'
      ? '停止して入力'
      : state === 'idle' && !serverReady
        ? 'Whisperサーバーが起動していません（Settingsから起動してください）'
        : '音声入力';

  return (
    <div
      className={
        state === 'recording'
          ? 'inline-flex items-center gap-2 rounded-md bg-destructive/10 p-1'
          : 'inline-flex'
      }
    >
      <Button
        size="icon"
        variant={state === 'recording' ? 'destructive' : 'default'}
        onClick={state === 'recording' ? stopRecording : () => void startRecording()}
        disabled={disabled}
        title={title}
      >
        {state === 'transcribing' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : state === 'recording' ? (
          <Square className="w-4 h-4" />
        ) : (
          <Mic className="w-4 h-4" />
        )}
      </Button>
      {state === 'recording' && (
        // ボタンと同じdestructive系の色で塗ることで、両者が同じ録音状態を
        // 表す一体の情報であることが視覚的にわかるようにする
        <div aria-hidden className="h-1.5 w-16 overflow-hidden rounded-full bg-background/60">
          <div
            className="h-full rounded-full bg-destructive"
            style={{ width: `${Math.round(level * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
