'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { UIMessage } from '@/lib/types';
import { UIMessageConverter } from '@/lib/ui-message-converter';
import { useTheme } from '@/contexts/ThemeContext';

interface ExecutionLogsChatProps {
  rawMessages?: unknown[]; // SDK messages
}

export function ExecutionLogsChat({ rawMessages }: ExecutionLogsChatProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);

  // rawMessagesをUIMessagesに変換
  const uiMessages = useMemo(() => {
    if (!rawMessages || rawMessages.length === 0) return [];
    const converter = new UIMessageConverter();
    return converter.convert(rawMessages);
  }, [rawMessages]);

  // 新規メッセージ追加時に自動スクロール
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [uiMessages]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-2 flex-shrink-0 h-8">
        <h3 className="text-sm font-semibold text-theme-fg">Logs</h3>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto border border-theme rounded p-4 space-y-3 bg-theme-hover">
        {uiMessages.length === 0 ? (
          <p className="text-theme-muted text-sm text-center mt-8">
            No logs yet. Execute a prompt to start.
          </p>
        ) : (
          uiMessages.map((msg) => <UIMessageItem key={msg.id} message={msg} />)
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}

// UIMessage用のコンポーネント
function UIMessageItem({ message }: { message: UIMessage }) {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});

  if (message.type === 'user_message') {
    const content = message.content;
    if (content.type !== 'user_message') return null;

    return (
      <div className="flex justify-end">
        <div className="text-right">
          <div className="inline-block text-left rounded-lg p-2 bg-primary text-white">
            <div className="text-xs whitespace-pre-wrap">{content.text}</div>
          </div>
          <div className="text-xs text-theme-muted mt-1 text-right">
            {new Date(message.timestamp).toLocaleString()}
          </div>
        </div>
      </div>
    );
  }

  if (message.type === 'assistant_message') {
    const content = message.content;
    if (content.type !== 'assistant_message') return null;

    return (
      <div className="space-y-2">
        {content.blocks.map((block, index) => {
          if (block.type === 'thinking') {
            // Redacted thinkingはスキップ
            if (block.isRedacted) return null;

            return (
              <div key={index}>
                <div className="flex justify-start items-center gap-2">
                  <div
                    className={`inline-block text-left rounded-lg p-2 border ${
                      isDark
                        ? 'bg-yellow-900/20 border-yellow-700'
                        : 'bg-yellow-50 border-yellow-200'
                    }`}
                  >
                    <div
                      className={`text-xs whitespace-pre-wrap italic ${
                        isDark ? 'text-yellow-300' : 'text-yellow-800'
                      }`}
                    >
                      💭 {block.content}
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          if (block.type === 'text') {
            return (
              <div key={index}>
                <div className="flex justify-start items-center gap-2">
                  <div className="inline-block text-left rounded-lg p-2 bg-theme-card border border-theme">
                    <div className="prose max-w-none text-theme-fg text-xs">
                      <ReactMarkdown>{block.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          if (block.type === 'tool_use') {
            const tool = block.info;
            const toolKey = `${message.id}-${index}`;
            const isExpanded = expandedTools[toolKey] ?? false;
            const hasDetails = Boolean(tool.input) || Boolean(tool.result);

            return (
              <div key={index}>
                <div className="flex justify-start items-center gap-2">
                  <div
                    className={`inline-block text-left rounded-lg p-2 border max-w-full ${
                      isDark
                        ? 'bg-purple-900/20 border-purple-700'
                        : 'bg-purple-50 border-purple-200'
                    }`}
                  >
                    {hasDetails ? (
                      <button
                        onClick={() =>
                          setExpandedTools((prev) => ({ ...prev, [toolKey]: !isExpanded }))
                        }
                        className="flex items-center gap-2 hover:opacity-70 w-full text-left cursor-pointer"
                      >
                        <span
                          className={`text-xs font-medium ${
                            isDark ? 'text-purple-300' : 'text-purple-950'
                          }`}
                        >
                          🔧 {tool.toolName}
                        </span>
                        {isExpanded ? (
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
                      <div
                        className={`text-xs font-medium ${
                          isDark ? 'text-purple-300' : 'text-purple-950'
                        }`}
                      >
                        🔧 {tool.toolName}
                      </div>
                    )}
                    {isExpanded && tool.input && (
                      <pre
                        className={`text-xs p-2 rounded overflow-x-auto mt-2 ${
                          isDark ? 'bg-gray-800' : 'bg-white'
                        }`}
                      >
                        {JSON.stringify(tool.input, null, 2)}
                      </pre>
                    )}
                    {isExpanded && tool.result && (
                      <div
                        className={`text-xs mt-2 p-2 rounded ${
                          tool.status === 'error'
                            ? isDark
                              ? 'bg-red-900/20 text-red-300'
                              : 'bg-red-50 text-red-800'
                            : isDark
                              ? 'bg-green-900/20 text-green-300'
                              : 'bg-green-50 text-green-800'
                        }`}
                      >
                        {tool.status === 'success' ? '✓' : '✗'} {tool.result}
                      </div>
                    )}
                    {tool.status === 'pending' && (
                      <div className="text-xs mt-2 text-theme-muted">Pending...</div>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          return null;
        })}
        <div className="text-xs text-theme-muted mt-1">
          {new Date(message.timestamp).toLocaleString()}
        </div>
      </div>
    );
  }

  if (message.type === 'error') {
    const content = message.content;
    if (content.type !== 'error') return null;

    return (
      <div>
        <div className="flex justify-start items-center gap-2">
          <div
            className={`inline-block text-left rounded-lg p-2 border ${
              isDark ? 'bg-red-900/20 border-red-700' : 'bg-red-100 border-red-300'
            }`}
          >
            <div
              className={`text-xs whitespace-pre-wrap ${isDark ? 'text-red-300' : 'text-red-950'}`}
            >
              ❌ {content.message}
            </div>
            {content.details && (
              <div className="text-xs text-theme-muted mt-1">{content.details}</div>
            )}
          </div>
        </div>
        <div className="text-xs text-theme-muted mt-1">
          {new Date(message.timestamp).toLocaleString()}
        </div>
      </div>
    );
  }

  if (message.type === 'system_event') {
    const content = message.content;
    if (content.type !== 'system_event') return null;

    return (
      <div>
        <div className="flex justify-start items-center gap-2">
          <div className="inline-block text-left rounded-lg p-2 bg-theme-hover border border-theme">
            <div className="text-xs text-theme-muted">ℹ️ {content.description}</div>
          </div>
        </div>
        <div className="text-xs text-theme-muted mt-1">
          {new Date(message.timestamp).toLocaleString()}
        </div>
      </div>
    );
  }

  return null;
}
