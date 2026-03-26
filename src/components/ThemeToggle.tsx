'use client';

import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const themes = [
    { value: 'light' as const, icon: Sun, label: 'Light' },
    { value: 'dark' as const, icon: Moon, label: 'Dark' },
    { value: 'system' as const, icon: Monitor, label: 'System' },
  ];

  return (
    <div className="flex items-center gap-0.5 bg-input/20 dark:bg-input/30 rounded-md p-0.5">
      {themes.map(({ value, icon: Icon, label }) => (
        <Button
          key={value}
          variant="ghost"
          size="icon-lg"
          onClick={() => setTheme(value)}
          className={
            theme === value
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
