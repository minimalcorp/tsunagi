'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { LogEntry } from '@/lib/types';

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
              <div className="text-sm whitespace-pre-wrap">{log.content}</div>
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
              <div className="prose prose-sm max-w-none text-theme-fg">
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
          <div className="inline-block text-left rounded-lg p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-green-700 dark:text-green-400">
                {toolName}
              </span>
              {hasInput && (
                <button
                  onClick={() => setIsToolExpanded(!isToolExpanded)}
                  className="text-xs text-green-700 dark:text-green-400 hover:underline"
                >
                  {isToolExpanded ? '▼ Hide input' : '▶ Show input'}
                </button>
              )}
            </div>
            {isToolExpanded && hasInput && (
              <pre className="text-xs bg-white dark:bg-gray-800 p-2 rounded overflow-x-auto mt-2">
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
          <div className="inline-block text-left rounded-lg p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700">
            <div className="text-sm text-blue-800 dark:text-blue-300 whitespace-pre-wrap">
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
          <div className="inline-block text-left rounded-lg p-3 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700">
            <div className="text-sm text-theme-fg">{log.content}</div>
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
          <div className="inline-block text-left rounded-lg p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700">
            <div className="text-sm text-yellow-800 dark:text-yellow-300 whitespace-pre-wrap italic">
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
          <div className="inline-block text-left rounded-lg p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700">
            <div className="text-sm text-red-800 dark:text-red-300 whitespace-pre-wrap">
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
          <div className="text-sm text-theme-fg">{log.content}</div>
        </div>
      </div>
      <div className="text-xs text-theme-muted mt-1">
        {new Date(log.timestamp).toLocaleString()}
      </div>
    </div>
  );
}
