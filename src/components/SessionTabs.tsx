'use client';

import type { ClaudeSession } from '@/lib/types';
import { X, Plus } from 'lucide-react';

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
  return (
    <div className="flex items-center gap-2 border-b border-theme pb-2 mb-4 overflow-x-auto">
      {sessions.map((session, index) => {
        const isActive = activeSessionId === session.id;
        const isDisabled = session.status === 'running';

        return (
          <div
            key={session.id}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-t-lg cursor-pointer flex-shrink-0
              ${
                isActive
                  ? 'bg-primary text-white'
                  : isDisabled
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-[color:var(--primary-600)] text-white hover:bg-primary'
              }
            `}
          >
            <button
              onClick={() => !isDisabled && onSessionChange(session.id)}
              className="font-medium"
              disabled={isDisabled}
            >
              Session {index + 1}
            </button>
            {sessions.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isDisabled && confirm(`Delete Session ${index + 1}?`)) {
                    onSessionDelete(session.id);
                  }
                }}
                className={`hover:opacity-70 ${isDisabled ? 'text-gray-400' : ''}`}
                disabled={isDisabled}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        );
      })}

      <button
        onClick={onSessionCreate}
        className="px-4 py-2 bg-primary text-white rounded-t-lg hover:bg-primary-hover flex-shrink-0 flex items-center gap-2"
        title="Create new session"
      >
        <Plus className="w-4 h-4" />
        New Session
      </button>
    </div>
  );
}
