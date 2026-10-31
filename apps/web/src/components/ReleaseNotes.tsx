'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ReleaseNote } from '@minimalcorp/tsunagi-shared';
import { apiUrl } from '@/lib/api-url';
import { markdownComponents } from './MarkdownComponents';

type NotesState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; notes: ReleaseNote[] };

/**
 * 更新で入るバージョンの変更内容。Popover を開いたときだけマウントされて取得する。
 * 更新先が変わったら取得し直せるよう、呼び出し側で key に更新先を渡す。
 */
export function ReleaseNotes() {
  const [state, setState] = useState<NotesState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch(apiUrl('/api/version/release-notes'), {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { data: ReleaseNote[] };
        setState({ status: 'loaded', notes: json.data });
      } catch {
        if (!controller.signal.aborted) setState({ status: 'error' });
      }
    })();
    return () => controller.abort();
  }, []);

  if (state.status === 'loading') {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading release notes...
      </div>
    );
  }
  if (state.status === 'error') {
    return <p className="text-muted-foreground">Couldn&apos;t load release notes.</p>;
  }
  if (state.notes.length === 0) {
    return <p className="text-muted-foreground">Release notes aren&apos;t available yet.</p>;
  }

  return (
    <div className="max-h-60 space-y-3 overflow-y-auto">
      {state.notes.map((note) => (
        <section key={note.version} className="space-y-1">
          <a
            href={note.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium hover:underline"
          >
            v{note.version}
            <ExternalLink className="size-3" />
          </a>
          {note.body && (
            <div className="prose prose-sm prose-slate dark:prose-invert max-w-none text-xs">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {note.body}
              </ReactMarkdown>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
