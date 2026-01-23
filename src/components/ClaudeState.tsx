'use client';

import { Loader2, CheckCircle2, XCircle, PauseCircle, Circle } from 'lucide-react';
import type { Task, ClaudeSession } from '@/lib/types';

interface ClaudeStateProps {
  task: Task;
  session?: ClaudeSession;
}

export function ClaudeState({ task, session }: ClaudeStateProps) {
  // Claude実行状態のアイコン判定
  const getStateIcon = () => {
    // task.claudeState が主要な状態ソース
    if (task.claudeState === 'running') {
      return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
    }
    if (task.claudeState === 'idle') {
      return <Circle className="w-4 h-4 text-gray-300" />;
    }

    // task.claudeState が idle でも running でもない場合のみ、session.status を確認
    if (!session) {
      return <Circle className="w-4 h-4 text-gray-300" />;
    }
    if (session.status === 'completed') {
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    }
    if (session.status === 'failed') {
      return <XCircle className="w-4 h-4 text-red-500" />;
    }
    return <PauseCircle className="w-4 h-4 text-gray-500" />;
  };

  return (
    <div className="flex items-center gap-1 text-xs text-theme-muted">
      {getStateIcon()}
      <span>{task.claudeState}</span>
    </div>
  );
}
