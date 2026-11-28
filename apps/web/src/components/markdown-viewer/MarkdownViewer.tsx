'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FileX, FolderOpen, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MarkdownDocument } from './MarkdownDocument';
import { extractOutline, type MarkdownOutline } from './markdown-utils';
import { useMarkdownFile, type MarkdownFileData } from './useMarkdownFile';

export interface MarkdownViewerContext {
  data: MarkdownFileData | null;
  outline: MarkdownOutline | null;
  reload: () => void;
}

interface MarkdownViewerProps {
  /** 表示する Markdown の絶対パス。変わる場合は呼び出し側で key={filePath} を付けて作り直す */
  filePath: string;
  onNavigate: (filePath: string) => void;
  /** エラー時の「別のファイルを開く」 */
  onOpenOther?: () => void;
  renderHeader?: (context: MarkdownViewerContext) => ReactNode;
  className?: string;
}

const ERROR_TITLES: Record<number, string> = {
  400: '開けないファイルです（.md / .markdown の絶対パスのみ）',
  404: 'ファイルが見つかりません',
  413: 'ファイルが大きすぎます（5MB まで）',
};

export function MarkdownViewer({
  filePath,
  onNavigate,
  onOpenOther,
  renderHeader,
  className,
}: MarkdownViewerProps) {
  const { state, reload, toggleTask } = useMarkdownFile(filePath);
  const data = state.status === 'ready' ? state.data : null;
  const outline = useMemo(() => (data ? extractOutline(data.content) : null), [data]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeId = useActiveHeading(scrollRef, outline);

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-background', className)}>
      {renderHeader?.({ data, outline, reload: () => void reload() })}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {state.status === 'loading' && <ViewerSkeleton />}
        {state.status === 'error' && (
          <div className="mx-auto flex max-w-xl flex-col items-center gap-3 px-4 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <FileX className="size-6" />
            </div>
            <p className="text-base font-semibold">
              {ERROR_TITLES[state.httpStatus] ?? '読み込みに失敗しました'}
            </p>
            <code className="max-w-full truncate rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
              {filePath}
            </code>
            <div className="mt-2 flex gap-2">
              <Button variant="outline" size="lg" onClick={() => void reload()}>
                <RefreshCw />
                再試行
              </Button>
              {onOpenOther && (
                <Button size="lg" onClick={onOpenOther}>
                  <FolderOpen />
                  別のファイルを開く
                </Button>
              )}
            </div>
          </div>
        )}
        {data && outline && (
          <div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-start gap-6 px-4 py-4 md:px-6">
            {outline.sections.length > 1 && (
              <nav
                aria-label="目次"
                className="sticky top-4 hidden max-h-[calc(100vh-8rem)] w-56 overflow-y-auto shrink-0 flex-col gap-0.5 text-[13px] lg:flex"
              >
                <div className="px-2 pb-2 text-[11px] font-semibold tracking-wide text-muted-foreground">
                  目次
                </div>
                {outline.sections.map((section) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    onClick={(event) => {
                      event.preventDefault();
                      document
                        .getElementById(section.id)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className={cn(
                      'flex h-8 items-center justify-between gap-2 rounded-md px-2 transition-colors duration-[130ms] hover:bg-accent',
                      activeId === section.id
                        ? 'bg-accent font-semibold text-foreground'
                        : 'text-foreground/80'
                    )}
                  >
                    <span className="truncate">{section.title || '(無題)'}</span>
                    {section.total > 0 && (
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {section.done}/{section.total}
                      </span>
                    )}
                  </a>
                ))}
              </nav>
            )}
            <article className="min-w-0 flex-[999_1_560px] rounded-lg border border-border bg-card px-5 py-6 md:px-10 md:py-8">
              <MarkdownDocument
                filePath={data.path}
                content={data.content}
                onToggleTask={toggleTask}
                onNavigate={onNavigate}
              />
            </article>
          </div>
        )}
      </div>
    </div>
  );
}

/** スクロール位置に応じて目次のアクティブ見出しを返す */
function useActiveHeading(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  outline: MarkdownOutline | null
): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);
  const ids = useMemo(() => outline?.sections.map((s) => s.id) ?? [], [outline]);
  const key = ids.join(',');

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || key === '') return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top);
          else visible.delete(entry.target.id);
        }
        const first = key.split(',').find((id) => visible.has(id));
        if (first) setActiveId(first);
      },
      { root, rootMargin: '0px 0px -60% 0px' }
    );
    for (const id of key.split(',')) {
      const el = root.querySelector(`#${CSS.escape(id)}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [scrollRef, key]);

  return activeId;
}

function ViewerSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-4 md:px-6" aria-busy="true">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card px-5 py-6 md:px-10 md:py-8">
        <div className="h-7 w-2/3 animate-pulse rounded-md bg-muted" />
        <div className="h-3 w-11/12 animate-pulse rounded bg-muted" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-5 w-2/5 animate-pulse rounded bg-muted" />
        {[70, 55, 80, 40].map((width) => (
          <div key={width} className="flex items-center gap-2.5">
            <div className="size-4 animate-pulse rounded bg-muted" />
            <div className="h-3 animate-pulse rounded bg-muted" style={{ width: `${width}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
