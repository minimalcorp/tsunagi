'use client';

import { Loader2, CheckCircle2, XCircle, Circle, MessageSquare } from 'lucide-react';
import type { TabStatus } from '@/lib/claude-status';

interface ClaudeStateProps {
  status: TabStatus;
  showLabel?: boolean;
}

export function ClaudeState({ status, showLabel = true }: ClaudeStateProps) {
  const getStateIcon = () => {
    switch (status) {
      case 'running':
        return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
      case 'waiting':
        return <MessageSquare className="w-4 h-4 text-warning" />;
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-success" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-destructive" />;
      case 'idle':
        return <Circle className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <div className="w-4 h-4 flex items-center justify-center overflow-hidden flex-shrink-0">
        {getStateIcon()}
      </div>
      {showLabel && <span>{status}</span>}
    </div>
  );
}
