'use client';

import { useRef, useEffect, useState } from 'react';
import type { Tab } from '@/lib/types';
import { X, Plus } from 'lucide-react';
import { ClaudeState } from '@/components/ClaudeState';

interface SessionTabsProps {
  tabs: Tab[];
  activeTabId?: string;
  onTabChange: (tabId: string) => void;
  onTabCreate: () => void;
  onTabDelete: (tabId: string) => void;
}

export function SessionTabs({
  tabs,
  activeTabId,
  onTabChange,
  onTabCreate,
  onTabDelete,
}: SessionTabsProps) {
  const tabRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

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
    <div className="relative flex items-center gap-2 overflow-x-auto border-b border-theme">
      {tabs.map((tab, index) => {
        const isActive = activeTabId === tab.tab_id;
        const isRunning = tab.status === 'running';

        return (
          <div
            key={tab.tab_id}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            onClick={() => onTabChange(tab.tab_id)}
            className={`
              flex items-center gap-2 px-4 py-2 h-12 flex-shrink-0 transition-colors cursor-pointer
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
              <ClaudeState status={tab.status} showLabel={true} />
            </div>
            {tabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const confirmMessage =
                    tab.status === 'running'
                      ? `This tab is running. Are you sure you want to delete it?`
                      : `Delete this tab?`;
                  if (confirm(confirmMessage)) {
                    onTabDelete(tab.tab_id);
                  }
                }}
                className="hover:bg-theme-hover rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        );
      })}

      <button
        onClick={onTabCreate}
        className="px-4 py-2 h-12 text-primary hover:text-primary-hover flex-shrink-0 flex items-center justify-center cursor-pointer"
        title="Create new tab"
      >
        <Plus className="w-4 h-4" />
      </button>

      {/* Material Design Indicator */}
      <div
        className="absolute bottom-0 h-0.5 bg-primary transition-all duration-300 ease-in-out"
        style={{
          left: `${indicatorStyle.left}px`,
          width: `${indicatorStyle.width}px`,
        }}
      />
    </div>
  );
}
