'use client';

import { Settings, RefreshCw, FolderDown } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  onCloneClick: () => void;
  onSettingsClick: () => void;
  onReload: () => void;
  nextStep?: 'clone' | 'env' | 'task' | 'complete';
  isCloneDialogOpen?: boolean;
}

export function Header({
  onCloneClick,
  onSettingsClick,
  onReload,
  nextStep = 'complete',
  isCloneDialogOpen = false,
}: HeaderProps) {
  const getButtonHighlightClass = (step: string) => {
    if (nextStep === step) {
      return 'bg-primary text-primary-foreground border-primary shadow-lg ring-2 ring-primary hover:bg-primary/80 dark:hover:bg-primary/80';
    }
    return '';
  };

  return (
    <header className="h-14 border-b border-border flex items-center gap-3 px-4 bg-card">
      {/* Logo */}
      <h1 className="text-base font-semibold text-foreground flex-shrink-0">繋</h1>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Theme Toggle */}
      <ThemeToggle />

      {/* Actions */}
      <div className="flex gap-1 flex-shrink-0">
        <div className="relative">
          <Button
            variant="outline"
            size="icon-lg"
            onClick={onCloneClick}
            className={`active:scale-95 ${getButtonHighlightClass('clone')}`}
            title="Clone Repository"
          >
            <FolderDown />
          </Button>
          {nextStep === 'clone' && !isCloneDialogOpen && (
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-tooltip backdrop-blur-sm border-2 border-warning text-foreground px-4 py-2 rounded text-base whitespace-nowrap animate-subtle-bounce z-[60] shadow-lg">
              Clone a repository
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-tooltip backdrop-blur-sm border-l-2 border-t-2 border-warning rotate-45" />
            </div>
          )}
        </div>

        <Button
          variant="outline"
          size="icon-lg"
          onClick={onReload}
          className="active:scale-95"
          title="Reload"
        >
          <RefreshCw />
        </Button>

        <div className="relative">
          <Button
            variant="outline"
            size="icon-lg"
            onClick={onSettingsClick}
            className={`active:scale-95 ${getButtonHighlightClass('env')}`}
            title="Environment Settings"
          >
            <Settings />
          </Button>
          {nextStep === 'env' && (
            <div className="absolute top-full mt-2 right-[-2px] bg-tooltip backdrop-blur-sm border-2 border-warning text-foreground px-4 py-2 rounded text-base whitespace-nowrap animate-subtle-bounce z-[60] shadow-lg">
              Set up tokens
              <div className="absolute -top-1 right-[21px] w-2 h-2 bg-tooltip backdrop-blur-sm border-l-2 border-t-2 border-warning rotate-45" />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
