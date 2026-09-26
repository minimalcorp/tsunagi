'use client';

import { useId } from 'react';
import { Input } from '@/components/ui/input';
import {
  CONTEXT_LENGTH_PRESETS,
  formatContextLength,
  parseContextLength,
} from '@/lib/context-length';

interface ContextLengthInputProps {
  /** 入力中の文字列（`64k` 等）。保存時に parseContextLength で整数にする */
  value: string;
  onChange: (value: string) => void;
  /** モデルの最大値。超える候補は出さず、超えた入力はエラーにする */
  max?: number;
}

/** `64k` / `1m` 形式で入力できるコンテキスト長の欄 */
export function ContextLengthInput({ value, onChange, max }: ContextLengthInputProps) {
  const listId = useId();
  const tokens = parseContextLength(value);
  const tooLarge = tokens !== null && max !== undefined && max > 0 && tokens > max;
  const presets = CONTEXT_LENGTH_PRESETS.filter((p) => !max || p <= max);

  return (
    <div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="64k"
        list={listId}
        aria-invalid={tokens === null || tooLarge}
        className="font-mono"
      />
      <datalist id={listId}>
        {presets.map((p) => (
          <option key={p} value={formatContextLength(p)} />
        ))}
      </datalist>
      <p
        className={`mt-1 text-[0.65rem] ${tokens === null || tooLarge ? 'text-destructive' : 'text-muted-foreground'}`}
      >
        {tokens === null
          ? '64k / 128k / 1m または整数で入力してください（k = 1024）'
          : tooLarge
            ? `このモデルの最大値（${formatContextLength(max)}）を超えています`
            : `${tokens.toLocaleString()} tokens`}
      </p>
    </div>
  );
}

/** 保存可能な値か（整数に変換でき、最大値以下） */
export function isValidContextLength(value: string, max?: number): boolean {
  const tokens = parseContextLength(value);
  return tokens !== null && (!max || tokens <= max);
}
