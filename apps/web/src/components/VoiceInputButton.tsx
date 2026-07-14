'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiUrl } from '@/lib/api-url';
import { toaster } from '@/lib/toaster';
import { decodeTo16kMono, encodeWav } from '@/lib/wav-encoder';

const STORAGE_KEY = 'tsunagi:voice-input-enabled';

type RecordingState = 'idle' | 'recording' | 'transcribing';

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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const levelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const smoothedLevelRef = useRef(0);

  useEffect(() => {
    setEnabled(localStorage.getItem(STORAGE_KEY) === 'true');
  }, []);

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
    analyser.fftSize = 256;
    source.connect(analyser);
    audioCtxRef.current = audioCtx;

    smoothedLevelRef.current = 0;
    const data = new Uint8Array(analyser.frequencyBinCount);
    levelIntervalRef.current = setInterval(() => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((sum, v) => sum + v, 0) / data.length;
      // 生の値は100msごとに飛ぶのでなめらかに追従させる
      smoothedLevelRef.current = smoothedLevelRef.current * 0.6 + (avg / 255) * 0.4;
      setLevel(smoothedLevelRef.current);
    }, 100);
  }, []);

  const transcribe = useCallback(
    async (blob: Blob) => {
      setState('transcribing');
      try {
        const wavBlob = encodeWav(await decodeTo16kMono(blob), 16000);
        const formData = new FormData();
        formData.append('file', wavBlob, 'recording.wav');

        const response = await fetch(apiUrl('/api/whisper/transcribe'), {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || `HTTPエラー: ${response.status}`);
        }

        const data = (await response.json()) as { text: string };
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

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        stopLevelMeter();
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

  return (
    <div className="relative inline-flex">
      {state === 'recording' && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-md bg-destructive"
          style={{
            transform: `scale(${1.3 + level * 1.6})`,
            opacity: 0.12 + level * 0.35,
            transition: 'transform 100ms ease-out, opacity 100ms ease-out',
          }}
        />
      )}
      <Button
        size="icon"
        variant={state === 'recording' ? 'destructive' : 'default'}
        onClick={state === 'recording' ? stopRecording : () => void startRecording()}
        disabled={state === 'transcribing'}
        title={state === 'recording' ? '停止して入力' : '音声入力'}
        className="relative"
      >
        {state === 'transcribing' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : state === 'recording' ? (
          <Square className="w-4 h-4" />
        ) : (
          <Mic className="w-4 h-4" />
        )}
      </Button>
    </div>
  );
}
