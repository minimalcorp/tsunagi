'use client';

import { AudioLines, CheckCircle2, Loader2 } from 'lucide-react';
import type { VoiceUtterance } from '@/hooks/useVoiceInput';

/**
 * 音声入力の途中経過をターミナルの上に重ねて表示する。確定後は、実際に入力した確定結果に
 * 置き換えて一定時間表示する(途中経過と確定結果は内容が異なることがあるため)。
 * Claude Codeの入力欄には確定した文字起こしだけを送り、発話中の暫定テキストはここにだけ出す
 * （ターミナルへ暫定テキストを書いてから差し替えると、全角文字やIMEの扱いで壊れやすいため）。
 */
export function VoiceTranscriptOverlay({ utterances }: { utterances: VoiceUtterance[] }) {
  if (utterances.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-x-4 bottom-8 z-10 flex justify-center">
      <div className="w-full max-w-2xl space-y-1 rounded-md border bg-card/95 p-3 text-sm text-card-foreground shadow-md">
        {utterances.map((u) => (
          <div key={u.id} className="flex items-start gap-2">
            {u.phase === 'speaking' ? (
              <AudioLines className="mt-0.5 size-4 shrink-0 animate-pulse text-destructive" />
            ) : u.phase === 'finalizing' ? (
              <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
            )}
            <p className={u.phase === 'speaking' ? 'text-muted-foreground' : undefined}>
              {u.text || '…'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
