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
    <div className="flex flex-col h-full">
      <h3 className="text-sm font-semibold mb-2 text-theme-fg">Logs</h3>

      <div className="flex-1 overflow-y-auto border border-theme rounded p-4 space-y-3 bg-theme-hover">
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
    const isUser = log.metadata?.role === 'user';
    if (isUser) {
      return (
        <div className="flex justify-end">
          <div className="max-w-[80%] rounded-lg p-3 bg-primary text-white">
            <div className="text-xs opacity-80 mb-1">
              {new Date(log.timestamp).toLocaleTimeString()}
            </div>
            <div className="text-sm whitespace-pre-wrap">{log.content}</div>
          </div>
        </div>
      );
    } else {
      // assistant message
      return (
        <div className="flex justify-start items-start gap-2">
          <div className="w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
            AI
          </div>
          <div className="max-w-[80%] rounded-lg p-3 bg-theme-card border border-theme">
            <div className="text-xs text-theme-muted mb-1">
              {new Date(log.timestamp).toLocaleTimeString()}
            </div>
            <div className="prose prose-sm max-w-none text-theme-fg">
              <ReactMarkdown>{log.content || ''}</ReactMarkdown>
            </div>
          </div>
        </div>
      );
    }
  }

  // tool_use type
  if (log.type === 'tool_use') {
    const toolName = log.metadata?.toolName || 'Tool';
    return (
      <div className="flex justify-start items-start gap-2">
        <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-xs flex-shrink-0">
          🔧
        </div>
        <div className="max-w-[80%] rounded-lg p-3 bg-green-50 border border-green-200">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs text-gray-600">
              {new Date(log.timestamp).toLocaleTimeString()}
            </div>
            <button
              onClick={() => setIsToolExpanded(!isToolExpanded)}
              className="text-xs text-green-700 hover:underline"
            >
              {isToolExpanded ? `▼ Hide ${toolName}` : `▶ Show ${toolName}`}
            </button>
          </div>
          {isToolExpanded && (
            <pre className="text-xs bg-white p-2 rounded overflow-x-auto mt-2">{log.content}</pre>
          )}
        </div>
      </div>
    );
  }

  // file_operation type
  if (log.type === 'file_operation') {
    return (
      <div className="flex justify-start items-start gap-2">
        <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-xs flex-shrink-0">
          📄
        </div>
        <div className="max-w-[80%] rounded-lg p-3 bg-primary-50 border border-primary-200">
          <div className="text-xs text-gray-600 mb-1">
            {new Date(log.timestamp).toLocaleTimeString()}
          </div>
          <div className="text-sm text-gray-800">{log.content}</div>
        </div>
      </div>
    );
  }

  // thinking type
  if (log.type === 'thinking') {
    return (
      <div className="flex justify-center">
        <div className="max-w-[80%] rounded-lg p-3 bg-yellow-50 border border-yellow-200">
          <div className="text-xs text-yellow-600 mb-1">
            Thinking - {new Date(log.timestamp).toLocaleTimeString()}
          </div>
          <div className="text-sm text-yellow-800 whitespace-pre-wrap italic">{log.content}</div>
        </div>
      </div>
    );
  }

  // error type
  if (log.type === 'error') {
    return (
      <div className="flex justify-center">
        <div className="max-w-[90%] rounded-lg p-3 bg-red-100 border border-red-300">
          <div className="text-xs text-red-600 mb-1">
            Error - {new Date(log.timestamp).toLocaleTimeString()}
          </div>
          <div className="text-sm text-red-800 whitespace-pre-wrap">{log.content}</div>
        </div>
      </div>
    );
  }

  // fallback: generic log
  return (
    <div className="flex justify-start items-start gap-2">
      <div className="w-8 h-8 rounded-full bg-gray-500 text-white flex items-center justify-center text-xs flex-shrink-0">
        ℹ️
      </div>
      <div className="max-w-[80%] rounded-lg p-3 bg-theme-card border border-theme">
        <div className="text-xs text-theme-muted mb-1">
          {new Date(log.timestamp).toLocaleTimeString()}
        </div>
        <div className="text-sm text-theme-fg">{log.content}</div>
      </div>
    </div>
  );
}
