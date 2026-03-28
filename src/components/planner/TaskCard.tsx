'use client';

import { useState, useCallback } from 'react';
import type { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import { Copy, Check, GitBranch, Clock } from 'lucide-react';
import type { Task } from '@/lib/types';
import { getRepoColor } from '@/lib/repo-colors';
import { cn } from '@/lib/utils';

interface TaskCardProps {
  task: Task;
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
}

const STATUS_STYLES: Record<Task['status'], string> = {
  backlog: 'bg-muted text-muted-foreground',
  planning: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  coding: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  reviewing: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  done: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
};

export function TaskCard({ task, dragHandleProps }: TaskCardProps) {
  const [copied, setCopied] = useState(false);
  const repoColor = getRepoColor(task.owner, task.repo);
  const shortId = task.id.slice(0, 5) + '\u2026';

  const handleCopyId = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard.writeText(task.id).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    },
    [task.id]
  );

  return (
    <div
      {...dragHandleProps}
      className="rounded-lg border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md cursor-grab active:cursor-grabbing"
    >
      <div className="space-y-2">
        {/* ID + Status */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <span className="font-mono text-xs text-muted-foreground">{shortId}</span>
            <button
              onClick={handleCopyId}
              className="size-5 inline-flex items-center justify-center rounded-sm hover:bg-accent transition-colors"
              title="Copy task ID"
            >
              {copied ? (
                <Check className="size-3 text-success" />
              ) : (
                <Copy className="size-3 text-muted-foreground" />
              )}
            </button>
          </div>
          <span
            className={cn(
              'inline-flex h-5 items-center rounded-full px-2 text-[0.625rem] font-medium',
              STATUS_STYLES[task.status]
            )}
          >
            {task.status}
          </span>
        </div>

        {/* Title */}
        <p className="text-sm font-medium text-foreground">{task.title}</p>

        {/* Description */}
        {task.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
        )}

        {/* Metadata row */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Repository badge */}
          <span
            className={cn(
              'inline-flex h-5 items-center rounded-full px-2 text-[0.625rem] font-medium',
              repoColor.bg,
              repoColor.text
            )}
          >
            {task.owner}/{task.repo}
          </span>

          {/* Branch */}
          {task.branch && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <GitBranch className="size-3" />
              <span className="truncate max-w-[120px]">{task.branch}</span>
            </span>
          )}

          {/* Effort */}
          {task.effort != null && task.effort > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3" />
              {task.effort}h
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
