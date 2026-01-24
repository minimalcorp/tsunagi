'use client';

import { useRef, useEffect, useState } from 'react';
import type { ClaudeSession } from '@/lib/types';
import { X, Plus } from 'lucide-react';
import { ClaudeState } from '@/components/ClaudeState';

interface SessionTabsProps {
  sessions: ClaudeSession[];
  activeSessionId?: string;
  onSessionChange: (sessionId: string) => void;
  onSessionCreate: () => void;
  onSessionDelete: (sessionId: string) => void;
}

export function SessionTabs({
  sessions,
  activeSessionId,
  onSessionChange,
  onSessionCreate,
  onSessionDelete,
}: SessionTabsProps) {
  const tabRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  // アクティブタブのインジケーター位置を更新
  useEffect(() => {
    const activeIndex = sessions.findIndex((s) => s.id === activeSessionId);
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
  }, [activeSessionId, sessions]);

  return (
    <div className="relative flex items-center gap-2 overflow-x-auto border-b border-theme">
      {sessions.map((session, index) => {
        const isActive = activeSessionId === session.id;
        const isDisabled = session.status === 'running';

        return (
          <div
            key={session.id}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            onClick={() => !isDisabled && onSessionChange(session.id)}
            className={`
              flex items-center gap-2 px-4 py-2 h-12 flex-shrink-0 transition-colors
              ${
                isActive
                  ? 'text-primary'
                  : isDisabled
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-theme-muted hover:text-theme-fg cursor-pointer'
              }
            `}
          >
            <div className="font-medium flex items-center gap-2">
              <span>{session.sessionNumber}</span>
              <ClaudeState status={session.status} showLabel={true} />
            </div>
            {sessions.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const confirmMessage =
                    session.status === 'running'
                      ? `Session ${session.sessionNumber} is running. Are you sure you want to delete it?`
                      : `Delete Session ${session.sessionNumber}?`;
                  if (confirm(confirmMessage)) {
                    onSessionDelete(session.id);
                  }
                }}
                className="hover:opacity-70 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        );
      })}

      <button
        onClick={onSessionCreate}
        className="px-4 py-2 h-12 text-primary hover:text-primary-hover flex-shrink-0 flex items-center justify-center cursor-pointer transition-colors"
        title="Create new session"
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
