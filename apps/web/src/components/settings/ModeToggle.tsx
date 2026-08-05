'use client';

import { Cloud, HardDrive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ModeToggleProps {
  mode: 'local' | 'remote';
  onChange: (mode: 'local' | 'remote') => void;
  disabled?: boolean;
}

export function ModeToggle({ mode, onChange, disabled }: ModeToggleProps) {
  return (
    <div className="flex gap-1 rounded-md border border-input p-1">
      <Button
        size="default"
        variant={mode === 'local' ? 'default' : 'ghost'}
        className={cn('flex-1', mode !== 'local' && 'text-muted-foreground')}
        disabled={disabled}
        onClick={() => onChange('local')}
      >
        <HardDrive />
        ローカル
      </Button>
      <Button
        size="default"
        variant={mode === 'remote' ? 'default' : 'ghost'}
        className={cn('flex-1', mode !== 'remote' && 'text-muted-foreground')}
        disabled={disabled}
        onClick={() => onChange('remote')}
      >
        <Cloud />
        リモート
      </Button>
    </div>
  );
}
