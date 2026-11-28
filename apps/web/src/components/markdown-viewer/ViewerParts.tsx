'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { MarkdownOutline } from './markdown-utils';

/** タスクの進捗バー（完了数 / 総数）。タスクが無ければ何も出さない */
export function TaskProgress({
  outline,
  className,
}: {
  outline: MarkdownOutline | null;
  className?: string;
}) {
  if (!outline || outline.total === 0) return null;
  const percent = Math.round((outline.done / outline.total) * 100);
  const complete = outline.done === outline.total;
  return (
    <div
      className={cn('flex shrink-0 items-center gap-2', className)}
      title={`タスク ${outline.done}/${outline.total} 完了`}
    >
      <div
        className="h-1.5 w-24 overflow-hidden rounded-full bg-accent"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={outline.total}
        aria-valuenow={outline.done}
        aria-label="タスク進捗"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-[130ms] ease-[cubic-bezier(0.4,0,0.2,1)]',
            complete ? 'bg-success' : 'bg-primary'
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-[13px] font-semibold tabular-nums">
        {outline.done}/{outline.total}
      </span>
    </div>
  );
}

export function CopyPathButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon-lg"
      className="text-muted-foreground"
      aria-label="パスをコピー"
      title={copied ? 'コピーしました' : 'パスをコピー'}
      onClick={async () => {
        await navigator.clipboard.writeText(path);
        setCopied(true);
      }}
      onMouseLeave={() => setCopied(false)}
    >
      {copied ? <Check className="text-success" /> : <Copy />}
    </Button>
  );
}
