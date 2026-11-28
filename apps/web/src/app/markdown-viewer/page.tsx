'use client';

import { Suspense, useEffect, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FileText, FolderOpen, RefreshCw } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { MarkdownViewer } from '@/components/markdown-viewer/MarkdownViewer';
import { MarkdownPathPicker } from '@/components/markdown-viewer/MarkdownPathPicker';
import { CopyPathButton, TaskProgress } from '@/components/markdown-viewer/ViewerParts';
import { basename, shortenHome, viewerHref } from '@/components/markdown-viewer/markdown-utils';
import { recordRecentFile } from '@/components/markdown-viewer/recent-files';
import type { MarkdownViewerContext } from '@/components/markdown-viewer/MarkdownViewer';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { getSharedSocket } from '@/lib/socket';
import { cn } from '@/lib/utils';

function subscribeConnection(listener: () => void) {
  const socket = getSharedSocket();
  socket.on('connect', listener);
  socket.on('disconnect', listener);
  return () => {
    socket.off('connect', listener);
    socket.off('disconnect', listener);
  };
}

function useSocketConnected() {
  return useSyncExternalStore(
    subscribeConnection,
    () => getSharedSocket().connected,
    () => false
  );
}

function LiveBadge() {
  const connected = useSocketConnected();
  return (
    <div
      title={connected ? 'ファイル変更を監視中' : '再接続中…'}
      className={cn(
        'flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium',
        connected ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
      )}
    >
      <span
        className={cn('size-[7px] rounded-full', connected ? 'bg-success' : 'bg-muted-foreground')}
      />
      {connected ? 'Live' : 'Offline'}
    </div>
  );
}

/** 表示できたファイルを「最近開いたファイル」に記録する */
function RecordRecent({ context }: { context: MarkdownViewerContext }) {
  const path = context.data?.path;
  const done = context.outline?.done ?? 0;
  const total = context.outline?.total ?? 0;
  useEffect(() => {
    if (path) recordRecentFile({ path, openedAt: Date.now(), done, total });
  }, [path, done, total]);
  return null;
}

function ViewerHeader({
  filePath,
  context,
  onOpenOther,
}: {
  filePath: string;
  context: MarkdownViewerContext;
  onOpenOther: () => void;
}) {
  const shownPath = context.data?.path ?? filePath;
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
      <RecordRecent context={context} />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <span className="shrink-0 font-semibold whitespace-nowrap">{basename(shownPath)}</span>
        <span
          className="hidden min-w-0 truncate font-mono text-xs text-muted-foreground sm:inline"
          title={shownPath}
        >
          {shortenHome(shownPath)}
        </span>
        <CopyPathButton path={shownPath} />
      </div>
      <LiveBadge />
      <TaskProgress outline={context.outline} className="hidden sm:flex" />
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="outline"
          size="icon-lg"
          className="active:scale-95"
          aria-label="再読み込み"
          title="再読み込み"
          onClick={context.reload}
        >
          <RefreshCw />
        </Button>
        <Button
          variant="outline"
          size="icon-lg"
          className="active:scale-95"
          aria-label="別のファイルを開く"
          title="別のファイルを開く"
          onClick={onOpenOther}
        >
          <FolderOpen />
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}

function MarkdownViewerPage() {
  const router = useRouter();
  const filePath = useSearchParams().get('path');
  useDocumentTitle(filePath ? basename(filePath) : 'Markdown Viewer');

  const open = (target: string) => router.push(viewerHref(target));
  const openPicker = () => router.push('/markdown-viewer');

  if (!filePath) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
          <Link
            href="/markdown-viewer"
            className={cn(buttonVariants({ variant: 'ghost' }), 'text-sm font-semibold')}
          >
            Markdown Viewer
          </Link>
          <div className="flex-1" />
          <ThemeToggle />
        </header>
        <MarkdownPathPicker onOpen={open} />
      </div>
    );
  }

  return (
    <MarkdownViewer
      key={filePath}
      filePath={filePath}
      onNavigate={open}
      onOpenOther={openPicker}
      className="h-screen"
      renderHeader={(context) => (
        <ViewerHeader filePath={filePath} context={context} onOpenOther={openPicker} />
      )}
    />
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MarkdownViewerPage />
    </Suspense>
  );
}
