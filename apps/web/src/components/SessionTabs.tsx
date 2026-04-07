'use client';

import { useRef, useEffect, useState } from 'react';
import type { Tab } from '@/lib/types';
import {
  X,
  Loader2,
  CirclePause,
  Bot,
  Terminal,
  AlertCircle,
  WifiOff,
  CheckCircle2,
  XCircle,
  MessageSquare,
} from 'lucide-react';
import type { TabStatusEntry } from '@/components/TerminalPanel';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/button';

interface SessionTabsProps {
  tabs: Tab[];
  activeTabId?: string;
  onTabChange: (tabId: string) => void;
  /** Terminalのみ起動するタブ追加（省略時はボタン非表示） */
  onTabCreateTerminal?: () => void;
  /** Terminalを追加してClaudeを起動するタブ追加 */
  onTabCreateClaude: () => void;
  onTabDelete: (tabId: string) => void;
  /** タブごとのリアルタイムステータス */
  tabStatusMap?: Map<string, TabStatusEntry>;
}

/** タブのリアルタイムステータスに基づくアイコン＋ラベル */
function TabStatusIndicator({ entry }: { entry: TabStatusEntry | undefined }) {
  if (!entry || entry.terminal === 'idle') {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <CirclePause className="w-3 h-3" />
        <span>idle</span>
      </div>
    );
  }

  if (entry.terminal === 'connecting') {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>connecting</span>
      </div>
    );
  }

  if (entry.terminal === 'error') {
    return (
      <div className="flex items-center gap-1 text-xs text-destructive">
        <AlertCircle className="w-3 h-3" />
        <span>error</span>
      </div>
    );
  }

  if (entry.terminal === 'exited' || entry.terminal === 'paused') {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <WifiOff className="w-3 h-3" />
        <span>{entry.terminal}</span>
      </div>
    );
  }

  // terminal === 'connected'
  switch (entry.claude) {
    case 'running':
      return (
        <div className="flex items-center gap-1 text-xs text-primary">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>running</span>
        </div>
      );
    case 'waiting':
      return (
        <div className="flex items-center gap-1 text-xs text-warning">
          <MessageSquare className="w-3 h-3" />
          <span>waiting</span>
        </div>
      );
    case 'success':
      return (
        <div className="flex items-center gap-1 text-xs text-success">
          <CheckCircle2 className="w-3 h-3" />
          <span>success</span>
        </div>
      );
    case 'failure':
    case 'error':
      return (
        <div className="flex items-center gap-1 text-xs text-destructive">
          <XCircle className="w-3 h-3" />
          <span>{entry.claude === 'failure' ? 'failure' : 'error'}</span>
        </div>
      );
    default:
      // claude: idle
      return (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <CirclePause className="w-3 h-3" />
          <span>idle</span>
        </div>
      );
  }
}

export function SessionTabs({
  tabs,
  activeTabId,
  onTabChange,
  onTabCreateTerminal,
  onTabCreateClaude,
  onTabDelete,
  tabStatusMap,
}: SessionTabsProps) {
  const tabRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  const [deleteTarget, setDeleteTarget] = useState<{ tabId: string; isRunning: boolean } | null>(
    null
  );

  // アクティブタブのインジケーター位置を更新
  // offsetLeft/offsetWidth を使用（position:absolute の参照座標と一致し、スクロール時もズレない）
  useEffect(() => {
    const activeIndex = tabs.findIndex((t) => t.tab_id === activeTabId);
    if (activeIndex !== -1 && tabRefs.current[activeIndex]) {
      const tabElement = tabRefs.current[activeIndex];
      if (tabElement) {
        setIndicatorStyle({
          left: tabElement.offsetLeft,
          width: tabElement.offsetWidth,
        });
      }
    }
  }, [activeTabId, tabs]);

  return (
    <>
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(details) => {
          if (!details.open) setDeleteTarget(null);
        }}
        title="Delete Tab"
        message={
          deleteTarget?.isRunning
            ? 'This tab is running. Are you sure you want to delete it?'
            : 'Delete this tab?'
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (deleteTarget) onTabDelete(deleteTarget.tabId);
        }}
        variant="danger"
      />
      <div className="relative flex items-center gap-2 overflow-x-auto border-b border-border pb-1">
        {tabs.map((tab, index) => {
          const isActive = activeTabId === tab.tab_id;
          const entry = tabStatusMap?.get(tab.tab_id);
          const isRunning =
            (entry?.claude === 'running' || entry?.claude === 'waiting') &&
            entry?.terminal === 'connected';

          return (
            <div
              key={tab.tab_id}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              onClick={() => onTabChange(tab.tab_id)}
              className={`
              flex items-center gap-2 px-4 pt-1 pb-2 h-10 flex-shrink-0 transition-colors cursor-pointer
              ${
                isActive
                  ? 'text-primary'
                  : isRunning
                    ? 'text-primary-light'
                    : 'text-muted-foreground hover:text-foreground'
              }
            `}
            >
              <div className="font-medium flex items-center gap-2">
                <TabStatusIndicator entry={entry} />
              </div>
              {tabs.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget({ tabId: tab.tab_id, isRunning });
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          );
        })}

        {/* divider + アクションボタン群 */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
          <div className="w-px self-stretch bg-theme" />
          {onTabCreateTerminal && (
            <Button size="icon" onClick={onTabCreateTerminal} title="Open terminal">
              <Terminal className="w-4 h-4" />
            </Button>
          )}
          <Button size="icon" onClick={onTabCreateClaude} title="Open terminal with Claude">
            <Bot className="w-4 h-4" />
          </Button>
        </div>

        {/* Material Design Indicator */}
        <div
          className="absolute bottom-0 h-0.5 bg-primary transition-[left,width]"
          style={{
            left: `${indicatorStyle.left}px`,
            width: `${indicatorStyle.width}px`,
          }}
        />
      </div>
    </>
  );
}
