'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { LogEntry } from '@/lib/types';
import { useTheme } from '@/contexts/ThemeContext';

interface ExecutionLogsChatProps {
  logs: LogEntry[];
}

export function ExecutionLogsChat({ logs }: ExecutionLogsChatProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);

  // 新規メッセージ追加時に自動スクロール
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <h3 className="text-sm font-semibold mb-2 text-theme-fg flex-shrink-0">Logs</h3>

      <div className="flex-1 min-h-0 overflow-y-auto border border-theme rounded p-4 space-y-3 bg-theme-hover">
        {logs.length === 0 ? (
          <p className="text-theme-muted text-sm text-center mt-8">
            No logs yet. Execute a prompt to start.
          </p>
        ) : (
          logs.map((log, index) => <ChatMessageItem key={`${log.timestamp}-${index}`} log={log} />)
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}

function ChatMessageItem({ log }: { log: LogEntry }) {
  const [isToolExpanded, setIsToolExpanded] = useState(false);
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

  // message type
  if (log.type === 'message') {
    // Skip messages without role (metadata information only)
    if (!log.metadata?.role) {
      return null;
    }

    const isUser = log.metadata.role === 'user';

    if (isUser) {
      return (
        <div className="flex justify-end">
          <div className="text-right">
            <div className="inline-block text-left rounded-lg p-3 bg-primary text-white">
              <div className="text-xs whitespace-pre-wrap">{log.content}</div>
            </div>
            <div className="text-xs text-theme-muted mt-1 text-right">
              {new Date(log.timestamp).toLocaleString()}
            </div>
          </div>
        </div>
      );
    } else {
      // assistant message
      return (
        <div>
          <div className="flex justify-start items-center gap-2 text-right">
            <div className="inline-block text-left rounded-lg p-3 bg-theme-card border border-theme">
              <div className="prose max-w-none text-theme-fg text-xs">
                <ReactMarkdown>{log.content || ''}</ReactMarkdown>
              </div>
            </div>
          </div>
          <div className="text-xs text-theme-muted mt-1">
            {new Date(log.timestamp).toLocaleString()}
          </div>
        </div>
      );
    }
  }

  // tool_use type
  if (log.type === 'tool_use') {
    const toolName = (log.metadata?.tool as string) || 'Tool';
    const hasInput = Boolean(log.metadata?.input);
    return (
      <div>
        <div className="flex justify-start items-center gap-2 text-right">
          <div
            className={`inline-block text-left rounded-lg p-3 max-w-full ${
              isDark ? 'bg-purple-900/20 border-purple-700' : 'bg-purple-50 border-purple-200'
            } border`}
          >
            {hasInput ? (
              <button
                onClick={() => setIsToolExpanded(!isToolExpanded)}
                className="flex items-center gap-2 hover:opacity-70 w-full text-left cursor-pointer"
              >
                <span
                  className={`text-xs font-medium ${
                    isDark ? 'text-purple-300' : 'text-purple-950'
                  }`}
                >
                  {toolName}
                </span>
                {isToolExpanded ? (
                  <ChevronUp
                    className={`w-3 h-3 ${isDark ? 'text-purple-300' : 'text-purple-950'}`}
                  />
                ) : (
                  <ChevronDown
                    className={`w-3 h-3 ${isDark ? 'text-purple-300' : 'text-purple-950'}`}
                  />
                )}
              </button>
            ) : (
              <span
                className={`text-xs font-medium ${isDark ? 'text-purple-300' : 'text-purple-950'}`}
              >
                {toolName}
              </span>
            )}
            {isToolExpanded && hasInput && (
              <pre
                className={`text-xs p-2 rounded overflow-x-auto mt-2 max-w-full ${
                  isDark ? 'bg-gray-800' : 'bg-white'
                }`}
              >
                {JSON.stringify(log.metadata?.input, null, 2)}
              </pre>
            )}
          </div>
        </div>
        <div className="text-xs text-theme-muted mt-1">
          {new Date(log.timestamp).toLocaleString()}
        </div>
      </div>
    );
  }

  // tool_result type
  if (log.type === 'tool_result') {
    return (
      <div>
        <div className="flex justify-start items-center gap-2 text-right">
          <div
            className={`inline-block text-left rounded-lg p-3 border ${
              isDark ? 'bg-blue-900/20 border-blue-700' : 'bg-blue-50 border-blue-200'
            }`}
          >
            <div
              className={`text-xs whitespace-pre-wrap ${
                isDark ? 'text-blue-300' : 'text-blue-800'
              }`}
            >
              {log.content}
            </div>
          </div>
        </div>
        <div className="text-xs text-theme-muted mt-1">
          {new Date(log.timestamp).toLocaleString()}
        </div>
      </div>
    );
  }

  // file_operation type
  if (log.type === 'file_operation') {
    return (
      <div>
        <div className="flex justify-start items-center gap-2 text-right">
          <div
            className={`inline-block text-left rounded-lg p-3 border ${
              isDark ? 'bg-primary-900/20 border-primary-700' : 'bg-primary-50 border-primary-200'
            }`}
          >
            <div className="text-xs text-theme-fg">{log.content}</div>
          </div>
        </div>
        <div className="text-xs text-theme-muted mt-1">
          {new Date(log.timestamp).toLocaleString()}
        </div>
      </div>
    );
  }

  // thinking type
  if (log.type === 'thinking') {
    return (
      <div>
        <div className="flex justify-start items-center gap-2 text-right">
          <div
            className={`inline-block text-left rounded-lg p-3 border ${
              isDark ? 'bg-yellow-900/20 border-yellow-700' : 'bg-yellow-50 border-yellow-200'
            }`}
          >
            <div
              className={`text-xs whitespace-pre-wrap italic ${
                isDark ? 'text-yellow-300' : 'text-yellow-800'
              }`}
            >
              {log.content}
            </div>
          </div>
        </div>
        <div className="text-xs text-theme-muted mt-1">
          {new Date(log.timestamp).toLocaleString()}
        </div>
      </div>
    );
  }

  // error type
  if (log.type === 'error') {
    return (
      <div>
        <div className="flex justify-start items-center gap-2 text-right">
          <div
            className={`inline-block text-left rounded-lg p-3 border ${
              isDark ? 'bg-red-900/20 border-red-700' : 'bg-red-100 border-red-300'
            }`}
          >
            <div
              className={`text-xs whitespace-pre-wrap ${isDark ? 'text-red-300' : 'text-red-950'}`}
            >
              {log.content}
            </div>
          </div>
        </div>
        <div className="text-xs text-theme-muted mt-1">
          {new Date(log.timestamp).toLocaleString()}
        </div>
      </div>
    );
  }

  // fallback: generic log
  return (
    <div>
      <div className="flex justify-start items-center gap-2 text-right">
        <div className="inline-block text-left rounded-lg p-3 bg-theme-card border border-theme">
          <div className="text-xs text-theme-fg">{log.content}</div>
        </div>
      </div>
      <div className="text-xs text-theme-muted mt-1">
        {new Date(log.timestamp).toLocaleString()}
      </div>
    </div>
  );
}
