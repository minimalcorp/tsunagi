'use client';

import type { ClaudeSession } from '@/lib/types';

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
      {sessions.map((session, index) => (
        <div
          key={session.id}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-t-lg cursor-pointer transition-colors flex-shrink-0
            ${
              activeSessionId === session.id
                ? 'bg-primary text-white'
                : 'bg-theme-hover text-theme-fg hover:opacity-80'
            }
          `}
        >
          <button onClick={() => onSessionChange(session.id)} className="font-medium">
            Session {index + 1}
          </button>
          {sessions.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete Session ${index + 1}?`)) {
                  onSessionDelete(session.id);
                }
              }}
              className={`text-sm hover:opacity-70 ${
                activeSessionId === session.id ? 'text-white' : 'text-red-500'
              }`}
            >
              ×
            </button>
          )}
        </div>
      ))}

      <button
        onClick={onSessionCreate}
        className="px-4 py-2 bg-green-500 text-white rounded-t-lg hover:bg-green-600 transition-colors flex-shrink-0"
        title="Create new session"
      >
        + New Session
      </button>
    </div>
  );
}
