'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, MessageSquare, XCircle, type LucideIcon } from 'lucide-react';
import type { Task } from '@minimalcorp/tsunagi-shared';
import { activityKind, type ActivityKind } from '@/lib/claude-status';
import { useLiveTasks } from '@/hooks/useLiveTasks';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/** 表示順（要対応が上）とアイコン。色・ラベルは TaskCard の表示と揃える */
const ACTIVITY: Record<
  ActivityKind,
  { order: number; icon: LucideIcon; className: string; label: string }
> = {
  waiting: {
    order: 0,
    icon: MessageSquare,
    className: 'text-warning',
    label: 'Waiting for your input',
  },
  error: {
    order: 1,
    icon: XCircle,
    className: 'text-destructive',
    label: 'Failed, not opened yet',
  },
  success: {
    order: 2,
    icon: CheckCircle2,
    className: 'text-success',
    label: 'Finished, not opened yet',
  },
  running: { order: 3, icon: Loader2, className: 'text-primary animate-spin', label: 'Running' },
};

interface ActiveTasksSidebarProps {
  /** 表示中のタスクID */
  currentTaskId: string;
}

/**
 * タスク詳細ページ左端の、実行中・未確認タスクの一覧。
 * 状態の追従は全タスクを対象にし（useLiveTasks）、表示だけを絞り込む。
 */
export function ActiveTasksSidebar({ currentTaskId }: ActiveTasksSidebarProps) {
  const router = useRouter();
  const { tasks } = useLiveTasks();

  const items = useMemo(() => {
    const list: { task: Task; kind: ActivityKind }[] = [];
    for (const task of tasks) {
      const kind = activityKind(task);
      if (!kind) continue;
      // 表示中のタスクは確認済みとみなす（完了→既読化までの一瞬の未読表示を出さない）
      if (task.id === currentTaskId && (kind === 'success' || kind === 'error')) continue;
      list.push({ task, kind });
    }
    return list.sort(
      (a, b) =>
        ACTIVITY[a.kind].order - ACTIVITY[b.kind].order ||
        a.task.order - b.task.order ||
        a.task.createdAt.localeCompare(b.task.createdAt)
    );
  }, [tasks, currentTaskId]);

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-card">
      {/* 詳細ページのヘッダー（p-4 + h-8 の行 + border）と高さを揃える */}
      <div className="flex h-8 shrink-0 box-content items-center gap-2 border-b border-border p-4">
        <span className="text-sm font-medium text-foreground">Active</span>
        <Badge variant="secondary">{items.length}</Badge>
      </div>

      {items.length === 0 ? (
        <p className="p-4 text-center text-xs text-muted-foreground">No active tasks</p>
      ) : (
        <ul className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {items.map(({ task, kind }) => {
            const { icon: Icon, className, label } = ACTIVITY[kind];
            const isCurrent = task.id === currentTaskId;
            return (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/tasks/${task.id}`)}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={cn(
                    'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent',
                    isCurrent && 'bg-accent'
                  )}
                >
                  <span role="img" aria-label={label} title={label} className="mt-0.5 shrink-0">
                    <Icon className={cn('size-3.5', className)} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground" title={task.title}>
                      {task.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {task.owner}/{task.repo}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
