'use client';

import { useState } from 'react';
import { ArrowRight, Clock, FileCheck, FileText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { basename, dirname, isMarkdownPath, shortenHome } from './markdown-utils';
import {
  clearRecentFiles,
  formatRelativeTime,
  removeRecentFile,
  useRecentFiles,
} from './recent-files';

/** path 未指定時のファイル選択（絶対パス入力 + 最近開いたファイル） */
export function MarkdownPathPicker({ onOpen }: { onOpen: (filePath: string) => void }) {
  const [value, setValue] = useState('');
  const recent = useRecentFiles();
  const trimmed = value.trim();
  const invalid =
    trimmed.length > 0 && (!trimmed.startsWith('/') || !isMarkdownPath(trimmed))
      ? '.md / .markdown の絶対パスを入力してください'
      : null;

  return (
    <div className="flex flex-1 justify-center px-4 py-16">
      <div className="flex w-full max-w-2xl flex-col gap-4">
        <form
          className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmed && !invalid) onOpen(trimmed);
          }}
        >
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary-50 text-primary">
              <FileCheck className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Markdownファイルを開く</h1>
              <p className="text-[13px] text-muted-foreground">
                ローカルの .md / .markdown（絶対パス）
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="markdown-path" className="text-[13px] font-medium">
              ファイルパス
            </label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="markdown-path"
                autoFocus
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="/Users/you/project/docs/runbook.md"
                aria-invalid={invalid ? true : undefined}
                className="min-w-0 flex-[1_1_320px] font-mono text-[13px]"
              />
              <Button type="submit" size="lg" className="h-9 px-4" disabled={!trimmed || !!invalid}>
                <ArrowRight />
                開く
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {invalid ?? (
                <>
                  URLでも指定可：
                  <code className="rounded bg-muted px-1 font-mono">
                    /markdown-viewer?path=&lt;絶対パス&gt;
                  </code>
                </>
              )}
            </p>
          </div>
        </form>

        {recent.length > 0 && (
          <section
            aria-labelledby="recent-heading"
            className="rounded-lg border border-border bg-card p-3"
          >
            <div className="flex items-center justify-between px-2 pb-2">
              <h2
                id="recent-heading"
                className="flex items-center gap-1.5 text-[13px] font-semibold"
              >
                <Clock className="size-3.5" />
                最近開いたファイル
              </h2>
              <Button variant="ghost" size="sm" onClick={clearRecentFiles}>
                クリア
              </Button>
            </div>
            <ul className="flex flex-col gap-0.5">
              {recent.map((file) => (
                <li key={file.path} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onOpen(file.path)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md p-2 text-left transition-colors duration-[130ms] hover:bg-accent active:scale-[0.99]"
                  >
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[13px] font-medium">{basename(file.path)}</span>
                      <span className="truncate font-mono text-[11.5px] text-muted-foreground">
                        {shortenHome(dirname(file.path))}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {file.total > 0 ? `${file.done}/${file.total}` : '—'}
                    </span>
                    <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                      {formatRelativeTime(file.openedAt)}
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    className="text-muted-foreground"
                    aria-label="履歴から削除"
                    title="履歴から削除"
                    onClick={() => removeRecentFile(file.path)}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
