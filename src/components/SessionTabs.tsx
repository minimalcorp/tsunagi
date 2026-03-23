'use client';

import { useRef, useEffect, useState } from 'react';
import type { Tab } from '@/lib/types';
import { X, Loader2, CirclePause, Bot, Terminal, AlertCircle, WifiOff } from 'lucide-react';
import type { TabStatusEntry } from '@/components/TerminalPanel';
import { ConfirmDialog } from '@/components/ui/Dialog';

interface SessionTabsProps {
  tabs: Tab[];
  activeTabId?: string;
  onTabChange: (tabId: string) => void;
  /** Terminalのみ起動するタブ追加 */
  onTabCreateTerminal: () => void;
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
      <div className="flex items-center gap-1 text-xs text-theme-muted">
        <CirclePause className="w-3 h-3" />
        <span>idle</span>
      </div>
    );
  }

  if (entry.terminal === 'connecting') {
    return (
      <div className="flex items-center gap-1 text-xs text-theme-muted">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>connecting</span>
      </div>
    );
  }

  if (entry.terminal === 'error') {
    return (
      <div className="flex items-center gap-1 text-xs text-red-500">
        <AlertCircle className="w-3 h-3" />
        <span>error</span>
      </div>
    );
  }

  if (entry.terminal === 'exited' || entry.terminal === 'paused') {
    return (
      <div className="flex items-center gap-1 text-xs text-theme-muted">
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
    case 'error':
      return (
        <div className="flex items-center gap-1 text-xs text-red-500">
          <AlertCircle className="w-3 h-3" />
          <span>error</span>
        </div>
      );
    default:
      // claude: idle / success
      return (
        <div className="flex items-center gap-1 text-xs text-theme-muted">
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
  useEffect(() => {
    const activeIndex = tabs.findIndex((t) => t.tab_id === activeTabId);
    if (activeIndex !== -1 && tabRefs.current[activeIndex]) {
      const tabElement = tabRefs.current[activeIndex];
      if (tabElement) {
        const containerLeft = tabElement.parentElement?.getBoundingClientRect().left || 0;
        const tabLeft = tabElement.getBoundingClientRect().left;
        const relativeLeft = tabLeft - containerLeft;

        setIndicatorStyle({
          left: relativeLeft,
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
      <div className="relative flex items-center gap-2 overflow-x-auto border-b border-theme pb-1">
        {tabs.map((tab, index) => {
          const isActive = activeTabId === tab.tab_id;
          const entry = tabStatusMap?.get(tab.tab_id);
          const isRunning = entry?.claude === 'running' && entry?.terminal === 'connected';

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
                    : 'text-theme-muted hover:text-theme-fg'
              }
            `}
            >
              <div className="font-medium flex items-center gap-2">
                <TabStatusIndicator entry={entry} />
              </div>
              {tabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget({ tabId: tab.tab_id, isRunning });
                  }}
                  className="hover:bg-theme-hover rounded cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}

        {/* divider + アクションボタン群 */}
        <div className="flex items-center flex-shrink-0 ml-auto">
          <div className="w-px self-stretch bg-theme mx-1" />
          <button
            onClick={onTabCreateTerminal}
            className="px-2 pt-1 pb-2 h-10 text-primary hover:text-primary-hover flex items-center justify-center cursor-pointer"
            title="Open terminal"
          >
            <Terminal className="w-4 h-4" />
          </button>
          <button
            onClick={onTabCreateClaude}
            className="px-2 pt-1 pb-2 h-10 text-primary hover:text-primary-hover flex items-center justify-center cursor-pointer"
            title="Open terminal with Claude"
          >
            <Bot className="w-4 h-4" />
          </button>
        </div>

        {/* Material Design Indicator */}
        <div
          className="absolute bottom-0 h-0.5 bg-primary transition-all"
          style={{
            left: `${indicatorStyle.left}px`,
            width: `${indicatorStyle.width}px`,
          }}
        />
      </div>
    </>
  );
}
