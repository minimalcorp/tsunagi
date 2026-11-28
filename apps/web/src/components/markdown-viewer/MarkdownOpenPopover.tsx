'use client';

import { useState } from 'react';
import { ArrowRight, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { apiUrl } from '@/lib/api-url';
import { cn } from '@/lib/utils';
import { basename, dirname, isMarkdownPath } from './markdown-utils';
import { formatRelativeTime } from './recent-files';

interface WorktreeMarkdownFile {
  path: string;
  relativePath: string;
  mtimeMs: number;
}

type ListState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; files: WorktreeMarkdownFile[]; fetchedAt: number };

/** タスク詳細のタブ列から Markdown を開く（worktree 内の一覧 + パス指定） */
export function MarkdownOpenPopover({
  worktreePath,
  onOpen,
}: {
  worktreePath: string;
  onOpen: (filePath: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [value, setValue] = useState('');

  const fetchList = async () => {
    setList({ status: 'loading' });
    try {
      const res = await fetch(
        apiUrl(`/api/markdown/list?root=${encodeURIComponent(worktreePath)}`),
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error(res.statusText);
      const body = await res.json();
      setList({
        status: 'ready',
        files: body.data.files as WorktreeMarkdownFile[],
        fetchedAt: Date.now(),
      });
    } catch {
      setList({ status: 'error' });
    }
  };

  const choose = (filePath: string) => {
    setOpen(false);
    setValue('');
    onOpen(filePath);
  };

  const trimmed = value.trim();
  const valid = trimmed.startsWith('/') && isMarkdownPath(trimmed);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void fetchList();
      }}
    >
      <PopoverTrigger
        render={<Button size="icon" title="Markdown を開く" aria-label="Markdown を開く" />}
      >
        <FileText className="w-4 h-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 gap-2 p-2">
        <div className="px-2 pt-1 text-[11px] font-semibold tracking-wide text-muted-foreground">
          Markdown（worktree）
        </div>
        <div className="max-h-72 overflow-y-auto">
          {list.status === 'loading' && (
            <div className="flex items-center gap-2 px-2 py-3 text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              読み込み中…
            </div>
          )}
          {list.status === 'error' && (
            <div className="px-2 py-3 text-destructive">一覧を取得できませんでした</div>
          )}
          {list.status === 'ready' && list.files.length === 0 && (
            <div className="px-2 py-3 text-muted-foreground">Markdown ファイルがありません</div>
          )}
          {list.status === 'ready' && list.files.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {list.files.map((file) => (
                <li key={file.path}>
                  <button
                    type="button"
                    onClick={() => choose(file.path)}
                    title={file.path}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left',
                      'transition-colors duration-[130ms] hover:bg-accent active:scale-[0.99]'
                    )}
                  >
                    <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13px] font-medium text-foreground">
                        {basename(file.relativePath)}
                      </span>
                      {file.relativePath.includes('/') && (
                        <span className="truncate font-mono text-[11px] text-muted-foreground">
                          {dirname(file.relativePath)}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatRelativeTime(file.mtimeMs, list.fetchedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <form
          className="flex gap-1.5 border-t border-border px-1 pt-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) choose(trimmed);
          }}
        >
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="パスを指定して開く（絶対パス）"
            aria-label="Markdown の絶対パス"
            className="h-8 font-mono text-xs"
          />
          <Button type="submit" size="icon-lg" disabled={!valid} aria-label="開く" title="開く">
            <ArrowRight />
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
