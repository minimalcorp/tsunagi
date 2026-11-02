'use client';

import { Columns2, SquarePen, SquareTerminal, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TaskViewMode } from '@/hooks/useTaskViewMode';
import { cn } from '@/lib/utils';

const OPTIONS: { mode: TaskViewMode; label: string; icon: LucideIcon }[] = [
  { mode: 'terminal', label: 'Terminal only', icon: SquareTerminal },
  { mode: 'split', label: 'Terminal and editor', icon: Columns2 },
  { mode: 'editor', label: 'Editor only', icon: SquarePen },
];

interface TaskViewModeToggleProps {
  mode: TaskViewMode;
  canSplit: boolean;
  onChange: (mode: TaskViewMode) => void;
}

export function TaskViewModeToggle({ mode, canSplit, onChange }: TaskViewModeToggleProps) {
  const options = canSplit ? OPTIONS : OPTIONS.filter((option) => option.mode !== 'split');
  return (
    <div
      className="flex shrink-0 items-center rounded-md border border-input"
      role="group"
      aria-label="View mode"
    >
      {options.map(({ mode: value, label, icon: Icon }) => (
        <Button
          key={value}
          variant="ghost"
          size="icon-xs"
          title={label}
          aria-label={label}
          aria-pressed={mode === value}
          onClick={() => onChange(value)}
          className={cn(
            'rounded-none first:rounded-l-md last:rounded-r-md',
            mode === value ? 'bg-accent text-foreground' : 'text-muted-foreground'
          )}
        >
          <Icon className="size-3.5" />
        </Button>
      ))}
    </div>
  );
}
