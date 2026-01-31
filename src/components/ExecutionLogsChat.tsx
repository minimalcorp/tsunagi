'use client';

import { useEffect, useRef, useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ChevronDown,
  ChevronUp,
  Brain,
  Wrench,
  Info,
  XCircle,
  Loader2,
  Ban,
  CircleCheck,
  CircleAlert,
  CircleEllipsis,
} from 'lucide-react';
import type { UIMessage, Tab } from '@/lib/types';
import { UIMessageConverter } from '@/lib/ui-message-converter';
import { useTheme } from '@/contexts/ThemeContext';
import { ClaudeState } from '@/components/ClaudeState';
import { getClaudeStatus } from '@/lib/claude-status';
import { markdownComponents } from '@/components/MarkdownComponents';

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
  tabId?: string; // タブ切り替え検知用
  tab: Tab;
}

export interface ExecutionLogsChatHandle {
  scrollToBottom: () => void;
}

const ExecutionLogsChatComponent = forwardRef<ExecutionLogsChatHandle, ExecutionLogsChatProps>(
  ({ rawMessages, tabId, tab }, ref) => {
    const logsEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [isAtBottom, setIsAtBottom] = useState(true);
    const prevTabIdRef = useRef<string | undefined>(tabId);
    const prevScrollHeightRef = useRef<number>(0);
    const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});

    // セッション完了状態を判定
    const sessionCompleted = useMemo(() => isSessionCompleted(rawMessages), [rawMessages]);

    const status = getClaudeStatus(tab);

    // 親コンポーネントに公開するメソッド
    useImperativeHandle(ref, () => ({
      scrollToBottom: () => {
        logsEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
      },
    }));

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
      const container = scrollContainerRef.current;
      if (!container) return;

      const currentScrollHeight = container.scrollHeight;
      const heightDiff = currentScrollHeight - prevScrollHeightRef.current;

      const tabChanged = prevTabIdRef.current !== tabId;
      prevTabIdRef.current = tabId;

      if (tabChanged) {
        // タブ切り替え時: 即座にスクロール
        logsEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
        // Note: setIsAtBottomはスクロールイベントで自動的に更新される
      } else if (isAtBottom) {
        // 最下部にいる状態で新規メッセージ: 即座にスクロール
        logsEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
      } else if (heightDiff > 0) {
        // 最下部以外で高さ増加: スクロール位置を調整して表示位置を維持
        container.scrollTop += heightDiff;
      }

      prevScrollHeightRef.current = currentScrollHeight;
    }, [uiMessages, tabId, isAtBottom]);

    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-center justify-between mb-2 flex-shrink-0 h-8">
          <h3 className="text-sm font-semibold text-theme-fg">Logs</h3>
          <ClaudeState status={status} />
        </div>

        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden border border-theme rounded p-4 space-y-3 bg-theme-hover"
        >
          {uiMessages.length === 0 ? (
            <p className="text-theme-muted text-sm text-center mt-8">
              No logs yet. Execute a prompt to start.
            </p>
          ) : (
            uiMessages.map((msg) => (
              <UIMessageItem
                key={msg.id}
                message={msg}
                sessionCompleted={sessionCompleted}
                expandedTools={expandedTools}
                setExpandedTools={setExpandedTools}
              />
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
    );
  }
);

ExecutionLogsChatComponent.displayName = 'ExecutionLogsChat';

export const ExecutionLogsChat = ExecutionLogsChatComponent;

// グループステータス判定ヘルパー関数
function getGroupStatus(executions: { status: string }[]) {
  // hasRunningは従来通りグループ全体をチェック
  const hasRunning = executions.some((e) => e.status === 'pending' || e.status === 'running');

  // all error または all success の判定
  const allError = executions.length > 0 && executions.every((e) => e.status === 'error');
  const allSuccess = executions.length > 0 && executions.every((e) => e.status === 'success');

  return { hasRunning, allError, allSuccess };
}

// ステータスに応じたアイコンと色を返すヘルパー関数
function getToolStatusIcon(
  status: 'pending' | 'running' | 'success' | 'error',
  sessionCompleted: boolean
): { icon: React.ReactElement | null; colorClass: string } {
  switch (status) {
    case 'running':
      return {
        icon: <Loader2 className="w-3 h-3 animate-spin" />,
        colorClass: 'text-theme-fg',
      };
    case 'pending':
      return sessionCompleted
        ? { icon: <Ban className="w-3 h-3" />, colorClass: 'text-theme-fg' }
        : { icon: <Loader2 className="w-3 h-3 animate-spin" />, colorClass: 'text-theme-fg' };
    case 'success':
      return {
        icon: <CircleCheck className="w-3 h-3" />,
        colorClass: 'text-green-500',
      };
    case 'error':
      return {
        icon: <CircleAlert className="w-3 h-3" />,
        colorClass: 'text-red-500',
      };
  }
}

// グループ全体のステータスアイコンと色を返すヘルパー関数
function getGroupStatusIcon(
  groupStatus: { hasRunning: boolean; allError: boolean; allSuccess: boolean },
  sessionCompleted: boolean
): { icon: React.ReactElement | null; colorClass: string } {
  // hasRunningは従来通り優先
  if (groupStatus.hasRunning) {
    return sessionCompleted
      ? { icon: <Ban className="w-3 h-3" />, colorClass: 'text-theme-fg' }
      : { icon: <Loader2 className="w-3 h-3 animate-spin" />, colorClass: 'text-theme-fg' };
  }

  // all error → CircleAlert (red)
  if (groupStatus.allError) {
    return {
      icon: <CircleAlert className="w-3 h-3" />,
      colorClass: 'text-red-500',
    };
  }

  // all success → CircleCheck (green)
  if (groupStatus.allSuccess) {
    return {
      icon: <CircleCheck className="w-3 h-3" />,
      colorClass: 'text-green-500',
    };
  }

  // anything else (混在状態) → CircleEllipsis (yellow)
  return {
    icon: <CircleEllipsis className="w-3 h-3" />,
    colorClass: 'text-yellow-500',
  };
}

// UIMessage用のコンポーネント
function UIMessageItem({
  message,
  sessionCompleted,
  expandedTools,
  setExpandedTools,
}: {
  message: UIMessage;
  sessionCompleted: boolean;
  expandedTools: Record<string, boolean>;
  setExpandedTools: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

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
                    className={`inline-block text-left rounded-lg p-2 max-w-full ${
                      isDark ? 'bg-yellow-900/20' : 'bg-yellow-50'
                    }`}
                  >
                    <div
                      className={`text-xs whitespace-pre-wrap italic flex items-start gap-1 ${
                        isDark ? 'text-yellow-300' : 'text-yellow-800'
                      }`}
                    >
                      <Brain className="w-3 h-3 flex-shrink-0 mt-0.5" />
                      <span className="break-words overflow-wrap-anywhere">{block.content}</span>
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
                    <div className="prose prose-pre:overflow-x-hidden prose-pre:whitespace-pre-wrap prose-pre:break-words prose-code:break-words prose-a:break-all max-w-none text-theme-fg text-xs break-words overflow-wrap-anywhere">
                      <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
                        {block.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          if (block.type === 'tool_use') {
            const tool = block.info;
            const toolKey = tool.id; // Use stable tool_use_id instead of message.id
            const isExpanded = expandedTools[toolKey] ?? false;
            const hasDetails = Boolean(tool.input) || Boolean(tool.result);

            // Get status icon and color
            const { icon: statusIcon, colorClass } = getToolStatusIcon(
              tool.status,
              sessionCompleted
            );

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
                        className="flex items-center gap-1 w-full text-left cursor-pointer"
                      >
                        <Wrench className="w-3 h-3" />
                        <span
                          className={`text-xs font-medium ${
                            isDark ? 'text-purple-300' : 'text-purple-950'
                          }`}
                        >
                          {tool.toolName}
                        </span>
                        {statusIcon && <span className={colorClass}>{statusIcon}</span>}
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
                        {statusIcon && <span className={colorClass}>{statusIcon}</span>}
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

          if (block.type === 'tool_use_group') {
            const executions = block.executions;
            // Use the first tool's ID for stable group key
            const groupKey =
              executions.length > 0 ? `group-${executions[0].id}` : `${message.id}-group-${index}`;
            const isGroupExpanded = expandedTools[groupKey] ?? false;

            // グループ全体のステータスを判定
            const groupStatus = getGroupStatus(executions);

            // Get group status icon and color
            const { icon: groupStatusIcon, colorClass: groupColorClass } = getGroupStatusIcon(
              groupStatus,
              sessionCompleted
            );

            return (
              <div key={index}>
                <div className="flex justify-start items-center gap-2">
                  <div
                    className={`inline-block text-left rounded-lg p-2 max-w-full ${
                      isDark ? 'bg-purple-900/20' : 'bg-purple-50'
                    }`}
                  >
                    <button
                      onClick={() =>
                        setExpandedTools((prev) => ({ ...prev, [groupKey]: !isGroupExpanded }))
                      }
                      className="flex items-center gap-1 hover:opacity-70 w-full text-left cursor-pointer"
                    >
                      <Wrench className="w-3 h-3" />
                      <span
                        className={`text-xs font-medium ${
                          isDark ? 'text-purple-300' : 'text-purple-950'
                        }`}
                      >
                        Tool Uses ({executions.length})
                      </span>
                      {groupStatusIcon && (
                        <span className={groupColorClass}>{groupStatusIcon}</span>
                      )}
                      {isGroupExpanded ? (
                        <ChevronUp
                          className={`w-3 h-3 ${isDark ? 'text-purple-300' : 'text-purple-950'}`}
                        />
                      ) : (
                        <ChevronDown
                          className={`w-3 h-3 ${isDark ? 'text-purple-300' : 'text-purple-950'}`}
                        />
                      )}
                    </button>

                    {isGroupExpanded && (
                      <div className="mt-2 space-y-2">
                        {executions.map((exec, execIndex) => {
                          const toolKey = exec.id; // Use stable exec.id instead of group-based key
                          const isToolExpanded = expandedTools[toolKey] ?? false;
                          const hasDetails = Boolean(exec.input) || Boolean(exec.result);

                          // Get status icon and color
                          const { icon: execStatusIcon, colorClass: execColorClass } =
                            getToolStatusIcon(exec.status, sessionCompleted);

                          return (
                            <div
                              key={execIndex}
                              className={`p-2 rounded ${isDark ? 'bg-gray-800/50' : 'bg-white/50'}`}
                            >
                              {hasDetails ? (
                                <button
                                  onClick={() =>
                                    setExpandedTools((prev) => ({
                                      ...prev,
                                      [toolKey]: !isToolExpanded,
                                    }))
                                  }
                                  className="flex items-center gap-1 hover:opacity-70 w-full text-left cursor-pointer"
                                >
                                  <span
                                    className={`text-xs font-medium ${
                                      isDark ? 'text-purple-300' : 'text-purple-950'
                                    }`}
                                  >
                                    {exec.toolName}
                                  </span>
                                  {execStatusIcon && (
                                    <span className={execColorClass}>{execStatusIcon}</span>
                                  )}
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
                                <div
                                  className={`text-xs font-medium flex items-center gap-1 ${
                                    isDark ? 'text-purple-300' : 'text-purple-950'
                                  }`}
                                >
                                  {exec.toolName}
                                  {execStatusIcon && (
                                    <span className={execColorClass}>{execStatusIcon}</span>
                                  )}
                                </div>
                              )}
                              {isToolExpanded && exec.input && (
                                <pre
                                  className={`text-xs p-2 rounded overflow-x-auto mt-2 ${
                                    isDark ? 'bg-gray-900' : 'bg-gray-50'
                                  }`}
                                >
                                  {JSON.stringify(exec.input, null, 2)}
                                </pre>
                              )}
                              {isToolExpanded && exec.result && (
                                <div
                                  className={`text-xs mt-2 p-2 rounded break-words overflow-wrap-anywhere ${
                                    exec.status === 'error'
                                      ? isDark
                                        ? 'bg-red-900/20 text-red-300'
                                        : 'bg-red-50 text-red-800'
                                      : isDark
                                        ? 'bg-green-900/20 text-green-300'
                                        : 'bg-green-50 text-green-800'
                                  }`}
                                >
                                  {exec.status === 'success' ? '✓' : '✗'} {exec.result}
                                </div>
                              )}
                            </div>
                          );
                        })}
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
            className={`inline-block text-left rounded-lg p-2 border max-w-full ${
              isDark ? 'bg-red-900/20 border-red-700' : 'bg-red-100 border-red-300'
            }`}
          >
            <div
              className={`text-xs whitespace-pre-wrap flex items-start gap-1 ${isDark ? 'text-red-300' : 'text-red-950'}`}
            >
              <XCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
              <span className="break-words overflow-wrap-anywhere">{content.message}</span>
            </div>
            {content.details && (
              <div className="text-xs text-theme-muted mt-1 break-words overflow-wrap-anywhere">
                {content.details}
              </div>
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
          <div className="inline-block text-left rounded-lg p-2 bg-theme-hover border border-theme max-w-full">
            <div className="text-xs text-theme-muted flex items-start gap-1">
              <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
              <span className="break-words overflow-wrap-anywhere">{content.description}</span>
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
