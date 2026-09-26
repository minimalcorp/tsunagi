'use client';

import { Settings, RefreshCw } from 'lucide-react';
import Image from 'next/image';
import { ThemeToggle } from './ThemeToggle';
import { Button } from '@/components/ui/button';
import logoIcon from '@/app/icon.png';

interface HeaderProps {
  onSettingsClick: () => void;
  onReload: () => void;
  nextStep?: 'clone' | 'env' | 'task' | 'complete';
}

export function Header({ onSettingsClick, onReload, nextStep = 'complete' }: HeaderProps) {
  const getButtonHighlightClass = (step: string) => {
    if (nextStep === step) {
      return 'bg-primary text-primary-foreground border-primary shadow-lg ring-2 ring-primary hover:bg-primary/80 dark:hover:bg-primary/80';
    }
    return '';
  };

  return (
    <header className="h-14 border-b border-border flex items-center gap-3 px-4 bg-card">
      {/* Logo */}
      <h1 className="flex-shrink-0 flex items-center">
        <Image src={logoIcon} alt="Tsunagi" width={32} height={32} priority />
      </h1>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Theme Toggle */}
      <ThemeToggle />

      {/* Actions */}
      <div className="flex gap-1 flex-shrink-0">
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
              Set up tokens or a local LLM
              <div className="absolute -top-1 right-[21px] w-2 h-2 bg-tooltip backdrop-blur-sm border-l-2 border-t-2 border-warning rotate-45" />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
