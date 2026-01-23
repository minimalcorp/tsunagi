'use client';

import { Loader2, CheckCircle2, XCircle, Circle } from 'lucide-react';
import type { ClaudeSessionStatus } from '@/lib/types';

interface ClaudeStateProps {
  status: ClaudeSessionStatus;
  showLabel?: boolean;
}

export function ClaudeState({ status, showLabel = true }: ClaudeStateProps) {
  const getStateIcon = () => {
    switch (status) {
      case 'running':
        return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'idle':
        return <Circle className="w-4 h-4 text-gray-300" />;
    }
  };

  return (
    <div className="flex items-center gap-1 text-xs text-theme-muted">
      {getStateIcon()}
      {showLabel && <span>{status}</span>}
    </div>
  );
}
