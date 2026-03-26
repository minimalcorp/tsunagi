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
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 bg-accent rounded p-1">
        {views.map(({ value, icon: Icon, label }) => (
          <Button
            key={value}
            variant="ghost"
            size="sm"
            onClick={() => onChange(value)}
            className={
              mode === value
                ? 'bg-primary text-white shadow-sm hover:bg-primary/80'
                : 'text-muted-foreground hover:text-foreground'
            }
            title={label}
          >
            <Icon className="w-4 h-4" />
          </Button>
        ))}
      </div>
    </div>
  );
}
