'use client';

import type { Todo } from '@minimalcorp/tsunagi-shared';
import { Ban, Circle, CircleCheck, Loader2, type LucideIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { computeTodoProgress, type TodoDisplayStatus } from '@/lib/todo-progress';
import { cn } from '@/lib/utils';

const STATUS_ICON: Record<
  TodoDisplayStatus,
  { icon: LucideIcon; className: string; label: string }
> = {
  pending: { icon: Circle, className: 'text-muted-foreground', label: 'Pending' },
  in_progress: { icon: Loader2, className: 'text-primary animate-spin', label: 'In progress' },
  completed: { icon: CircleCheck, className: 'text-success', label: 'Completed' },
  blocked: { icon: Ban, className: 'text-warning', label: 'Blocked' },
};

/** タブヘッダーの進捗表示。クリックでタスク一覧を開く */
export function TodoProgressPopover({ todos, className }: { todos: Todo[]; className?: string }) {
  const progress = computeTodoProgress(todos);
  if (progress.total === 0) return null;

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-accent cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          className
        )}
        title="Show tasks"
      >
        {progress.current && (
          <span className="min-w-0 max-w-48 truncate text-[10px] text-muted-foreground">
            {progress.current}
          </span>
        )}
        <Progress
          value={progress.completed}
          max={progress.total}
          className="w-16 shrink-0 gap-0 [&_[data-slot=progress-track]]:h-[3px]"
        />
        <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
          {progress.completed}/{progress.total}
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-1 p-2">
        <ul className="max-h-80 space-y-0.5 overflow-y-auto">
          {progress.items.map((item, i) => {
            const { icon: Icon, className: iconClass, label } = STATUS_ICON[item.displayStatus];
            return (
              <li key={item.id ?? i} className="flex items-start gap-2 rounded-sm px-1 py-1">
                <Icon className={cn('mt-0.5 size-3.5 shrink-0', iconClass)} aria-label={label} />
                <span
                  className={cn(
                    'min-w-0 break-words text-xs',
                    item.displayStatus === 'completed' && 'text-muted-foreground line-through'
                  )}
                >
                  {item.status === 'in_progress' && item.activeForm
                    ? item.activeForm
                    : item.content}
                </span>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
