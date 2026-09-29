'use client';

import { useSyncExternalStore } from 'react';
import { Loader2, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LevelStore, VoiceInputController } from '@/hooks/useVoiceInput';

function LevelMeter({ store }: { store: LevelStore }) {
  const level = useSyncExternalStore(store.subscribe, store.getSnapshot, () => 0);
  return (
    // ボタンと同じdestructive系の色で塗ることで、両者が同じ録音状態を
    // 表す一体の情報であることが視覚的にわかるようにする
    <div aria-hidden className="h-1.5 w-16 overflow-hidden rounded-full bg-background/60">
      <div
        className="h-full rounded-full bg-destructive"
        style={{ width: `${Math.round(level * 100)}%` }}
      />
    </div>
  );
}

/**
 * 音声入力モードのON/OFFを切り替えるアイコンボタン。ONの間はマイクを常時監視し、
 * 発話区間ごとに自動で文字起こしされる（状態管理は useVoiceInput）。
 * Settings画面で音声入力を有効化していない場合は何も表示しない。
 */
export function VoiceInputButton({ voiceInput }: { voiceInput: VoiceInputController }) {
  const { enabled, serverReady, status, levelStore, toggle } = voiceInput;
  if (!enabled) return null;

  const listening = status === 'listening';
  const title = listening
    ? '音声入力を停止'
    : !serverReady
      ? '音声認識サーバーが起動していません（Settingsから起動してください）'
      : '音声入力を開始（話した部分が自動で入力されます）';

  return (
    <div
      className={
        listening
          ? 'inline-flex items-center gap-2 rounded-md bg-destructive/10 p-1'
          : 'inline-flex'
      }
    >
      <Button
        size="icon"
        variant={listening ? 'destructive' : 'default'}
        onClick={toggle}
        disabled={status === 'starting' || (status === 'off' && !serverReady)}
        title={title}
      >
        {status === 'starting' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Mic className="w-4 h-4" />
        )}
      </Button>
      {listening && <LevelMeter store={levelStore} />}
    </div>
  );
}
