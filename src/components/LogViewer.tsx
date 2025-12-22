'use client';

import { useEffect, useRef } from 'react';
import type { LogEntry, StreamEventType } from '@/lib/types';

interface LogViewerProps {
  logs: LogEntry[];
  filterNodeId?: string;
}

// イベントタイプごとのスタイル設定
const getEventStyle = (
  direction: 'send' | 'receive',
  eventType?: StreamEventType
): { bg: string; border: string; text: string; icon: string } => {
  if (direction === 'send') {
    return {
      bg: 'bg-secondary/20',
      border: 'border-secondary',
      text: 'text-secondary',
      icon: '→',
    };
  }

  switch (eventType) {
    case 'tool_use':
      return {
        bg: 'bg-primary/20',
        border: 'border-primary',
        text: 'text-primary',
        icon: '⚙',
      };
    case 'tool_result':
      return {
        bg: 'bg-warning/20',
        border: 'border-warning',
        text: 'text-warning',
        icon: '⚡',
      };
    case 'status':
      return {
        bg: 'bg-card/50',
        border: 'border-border',
        text: 'text-muted',
        icon: '⋯',
      };
    case 'error':
      return {
        bg: 'bg-error/20',
        border: 'border-error',
        text: 'text-error',
        icon: '✕',
      };
    case 'complete':
    case 'message':
    default:
      return {
        bg: 'bg-success/20',
        border: 'border-success',
        text: 'text-success',
        icon: '←',
      };
  }
};

export default function LogViewer({ logs, filterNodeId }: LogViewerProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // フィルタリング
  const filteredLogs = filterNodeId ? logs.filter((log) => log.nodeId === filterNodeId) : logs;

  // 新しいログが追加されたら自動スクロール
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [filteredLogs.length]);

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-2 bg-background">
      {filteredLogs.length === 0 ? (
        <div className="text-muted text-center py-8">ログがありません</div>
      ) : (
        filteredLogs.map((log, index) => {
          const style = getEventStyle(log.direction, log.eventType);
          return (
            <div key={index} className={`rounded p-3 border ${style.bg} ${style.border}`}>
              <div className="text-xs text-muted mb-1">
                {formatTime(log.time)}{' '}
                <span className={`font-medium ${style.text}`}>
                  [{log.nodeId}] {style.icon}
                </span>
                {log.eventType && log.eventType !== 'message' && (
                  <span className="ml-2 text-subtle text-xs">({log.eventType})</span>
                )}
              </div>
              <div className="text-sm whitespace-pre-wrap text-foreground">{log.content}</div>
            </div>
          );
        })
      )}
      <div ref={bottomRef} />
    </div>
  );
}
