'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChevronDown, ChevronUp, Brain, Wrench, Info, XCircle, Loader2, Ban } from 'lucide-react';
import type { UIMessage } from '@/lib/types';
import { UIMessageConverter } from '@/lib/ui-message-converter';
import { useTheme } from '@/contexts/ThemeContext';

// セッション完了状態を判定するヘルパー関数
function isSessionCompleted(rawMessages?: unknown[]): boolean {
  if (!rawMessages || rawMessages.length === 0) return false;
  const lastMessage = rawMessages[rawMessages.length - 1];

  // 型ガードを使って型安全にチェック
  if (
    lastMessage &&
    typeof lastMessage === 'object' &&
    'type' in lastMessage &&
    lastMessage.type === 'result' &&
    'subtype' in lastMessage &&
    (lastMessage.subtype === 'success' || lastMessage.subtype === 'error')
  ) {
    return true;
  }
  return false;
}

interface ExecutionLogsChatProps {
  rawMessages?: unknown[]; // SDK messages
  sessionId?: string; // セッション切り替え検知用
}

export function ExecutionLogsChat({ rawMessages, sessionId }: ExecutionLogsChatProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const prevSessionIdRef = useRef<string | undefined>(sessionId);

  // セッション完了状態を判定
  const sessionCompleted = useMemo(() => isSessionCompleted(rawMessages), [rawMessages]);

  // rawMessagesをUIMessagesに変換
  const uiMessages = useMemo(() => {
    if (!rawMessages || rawMessages.length === 0) return [];
    const converter = new UIMessageConverter();
    return converter.convert(rawMessages);
  }, [rawMessages]);

  // スクロール位置の監視
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isBottom = scrollHeight - scrollTop - clientHeight < 10; // 10px以内を最下部とみなす
      setIsAtBottom(isBottom);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // スクロール制御
  useEffect(() => {
    const sessionChanged = prevSessionIdRef.current !== sessionId;
    prevSessionIdRef.current = sessionId;

    if (sessionChanged) {
      // セッション切り替え時: 即座にスクロール
      logsEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
      // Note: setIsAtBottomはスクロールイベントで自動的に更新される
    } else if (isAtBottom) {
      // 最下部にいる状態で新規メッセージ: スムーズスクロール
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    // 最下部以外にいる場合: スクロールしない
  }, [uiMessages, sessionId, isAtBottom]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-2 flex-shrink-0 h-8">
        <h3 className="text-sm font-semibold text-theme-fg">Logs</h3>
      </div>

      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto border border-theme rounded p-4 space-y-3 bg-theme-hover"
      >
        {uiMessages.length === 0 ? (
          <p className="text-theme-muted text-sm text-center mt-8">
            No logs yet. Execute a prompt to start.
          </p>
        ) : (
          uiMessages.map((msg) => (
            <UIMessageItem key={msg.id} message={msg} sessionCompleted={sessionCompleted} />
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}

// UIMessage用のコンポーネント
function UIMessageItem({
  message,
  sessionCompleted,
}: {
  message: UIMessage;
  sessionCompleted: boolean;
}) {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});

  if (message.type === 'user_message') {
    const content = message.content;
    if (content.type !== 'user_message') return null;

    return (
      <div className="flex justify-end">
        <div className="text-right max-w-full">
          <div className="inline-block text-left rounded-lg p-2 bg-primary text-white max-w-full">
            <div className="text-xs whitespace-pre-wrap break-words overflow-wrap-anywhere">
              {content.text}
            </div>
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
                    className={`inline-block text-left rounded-lg p-2 ${
                      isDark ? 'bg-yellow-900/20' : 'bg-yellow-50'
                    }`}
                  >
                    <div
                      className={`text-xs whitespace-pre-wrap italic flex items-start gap-1 ${
                        isDark ? 'text-yellow-300' : 'text-yellow-800'
                      }`}
                    >
                      <Brain className="w-3 h-3 flex-shrink-0 mt-0.5" />
                      <span>{block.content}</span>
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
                  <div className="inline-block text-left rounded-lg p-2 bg-theme-card max-w-full">
                    <div className="prose max-w-none text-theme-fg text-xs break-words overflow-wrap-anywhere">
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

            // Status icon for pending state
            const statusIcon =
              tool.status === 'pending' ? (
                sessionCompleted ? (
                  <Ban className="w-3 h-3" />
                ) : (
                  <Loader2 className="w-3 h-3 animate-spin" />
                )
              ) : null;

            return (
              <div key={index}>
                <div className="flex justify-start items-center gap-2">
                  <div
                    className={`inline-block text-left rounded-lg p-2 max-w-full ${
                      isDark ? 'bg-purple-900/20' : 'bg-purple-50'
                    }`}
                  >
                    {hasDetails ? (
                      <button
                        onClick={() =>
                          setExpandedTools((prev) => ({ ...prev, [toolKey]: !isExpanded }))
                        }
                        className="flex items-center gap-1 hover:opacity-70 w-full text-left cursor-pointer"
                      >
                        <Wrench className="w-3 h-3" />
                        <span
                          className={`text-xs font-medium ${
                            isDark ? 'text-purple-300' : 'text-purple-950'
                          }`}
                        >
                          {tool.toolName}
                        </span>
                        {statusIcon && (
                          <span className={`${isDark ? 'text-purple-300' : 'text-purple-950'}`}>
                            {statusIcon}
                          </span>
                        )}
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
                        className={`text-xs font-medium flex items-center gap-1 ${
                          isDark ? 'text-purple-300' : 'text-purple-950'
                        }`}
                      >
                        <Wrench className="w-3 h-3" />
                        {tool.toolName}
                        {statusIcon}
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
                        className={`text-xs mt-2 p-2 rounded break-words overflow-wrap-anywhere ${
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
              className={`text-xs whitespace-pre-wrap flex items-start gap-1 ${isDark ? 'text-red-300' : 'text-red-950'}`}
            >
              <XCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
              <span>{content.message}</span>
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
            <div className="text-xs text-theme-muted flex items-start gap-1">
              <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
              <span>{content.description}</span>
            </div>
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
