'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, FileText, RefreshCw } from 'lucide-react';
import type { Tab } from '@minimalcorp/tsunagi-shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MarkdownViewer, type MarkdownViewerContext } from './MarkdownViewer';
import { CopyPathButton, TaskProgress } from './ViewerParts';
import { shortenHome, viewerHref, type MarkdownOutline } from './markdown-utils';

interface MarkdownTabViewProps {
  tab: Tab;
  isActive: boolean;
  /** タスク詳細の共通ツールバー（アクティブなタブが内容を描画する先） */
  toolbarContainer: HTMLDivElement | null;
  /** 相対リンクで別の Markdown を開く（タブの表示ファイルを差し替える） */
  onNavigate: (tabId: string, filePath: string) => void;
  /** タブラベルの進捗表示用 */
  onOutlineChange?: (tabId: string, outline: MarkdownOutline | null) => void;
}

/** タスク詳細の Markdown タブ（PTY を持たない） */
export function MarkdownTabView({
  tab,
  isActive,
  toolbarContainer,
  onNavigate,
  onOutlineChange,
}: MarkdownTabViewProps) {
  const filePath = tab.filePath;
  if (!filePath) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        ファイルが指定されていません
      </div>
    );
  }

  return (
    <MarkdownViewer
      key={filePath}
      filePath={filePath}
      onNavigate={(target) => onNavigate(tab.tab_id, target)}
      className="bg-transparent"
      renderHeader={(context) => (
        <>
          <OutlineReporter tabId={tab.tab_id} context={context} onChange={onOutlineChange} />
          {isActive &&
            toolbarContainer &&
            createPortal(<Toolbar filePath={filePath} context={context} />, toolbarContainer)}
        </>
      )}
    />
  );
}

function OutlineReporter({
  tabId,
  context,
  onChange,
}: {
  tabId: string;
  context: MarkdownViewerContext;
  onChange?: (tabId: string, outline: MarkdownOutline | null) => void;
}) {
  useEffect(() => {
    onChange?.(tabId, context.outline);
  }, [tabId, context.outline, onChange]);
  return null;
}

function Toolbar({ filePath, context }: { filePath: string; context: MarkdownViewerContext }) {
  const shownPath = context.data?.path ?? filePath;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate font-mono text-xs text-muted-foreground" title={shownPath}>
        {shortenHome(shownPath)}
      </span>
      <CopyPathButton path={shownPath} />
      <div className="flex-1" />
      <TaskProgress outline={context.outline} />
      <Button
        variant="ghost"
        size="icon-lg"
        className="text-muted-foreground active:scale-95"
        aria-label="再読み込み"
        title="再読み込み"
        onClick={context.reload}
      >
        <RefreshCw />
      </Button>
      <a
        href={viewerHref(shownPath)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="単体ページで開く"
        title="単体ページで開く"
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'icon-lg' }),
          'text-muted-foreground active:scale-95'
        )}
      >
        <ExternalLink />
      </a>
    </div>
  );
}
