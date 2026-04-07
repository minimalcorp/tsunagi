'use client';

import { Columns2, FileEdit, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type ViewMode = 'split' | 'editor' | 'logs';

interface ViewLayoutToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewLayoutToggle({ mode, onChange }: ViewLayoutToggleProps) {
  const views = [
    { value: 'split' as const, icon: Columns2, label: 'Split View' },
    { value: 'editor' as const, icon: FileEdit, label: 'Editor Only' },
    { value: 'logs' as const, icon: ScrollText, label: 'Logs Only' },
  ];

  return (
    <div className="flex items-center gap-0.5 bg-input/20 dark:bg-input/30 rounded-md p-0.5">
      {views.map(({ value, icon: Icon, label }) => (
        <Button
          key={value}
          variant="ghost"
          size="icon-lg"
          onClick={() => onChange(value)}
          className={
            mode === value
              ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/80 hover:text-primary-foreground dark:hover:bg-primary/80'
              : 'text-muted-foreground hover:text-foreground'
          }
          title={label}
        >
          <Icon />
        </Button>
      ))}
    </div>
  );
}
