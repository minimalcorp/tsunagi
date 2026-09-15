'use client';

import { FolderDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CloneColumnProps {
  onCloneClick: () => void;
  /** オンボーディング中（リポジトリ未登録）はこの列を強調して誘導する */
  isOnboarding?: boolean;
  /** Cloneダイアログを開いている間は誘導の吹き出しを出さない */
  isCloneDialogOpen?: boolean;
}

export function CloneColumn({
  onCloneClick,
  isOnboarding = false,
  isCloneDialogOpen = false,
}: CloneColumnProps) {
  return (
    <div className="flex h-full flex-col px-4 py-4">
      <div className="relative flex-1">
        <button
          type="button"
          onClick={onCloneClick}
          className={cn(
            'flex h-full w-full flex-col items-center justify-center gap-2 rounded-lg',
            'border-2 border-dashed border-border text-muted-foreground',
            'transition-colors hover:bg-accent hover:text-foreground active:scale-95',
            isOnboarding && 'border-primary text-primary ring-2 ring-primary'
          )}
          title="Clone Repository"
        >
          <FolderDown className="size-6" />
          <span className="text-xs font-medium">Clone repository</span>
        </button>

        {isOnboarding && !isCloneDialogOpen && (
          <div className="absolute left-1/2 top-1/2 z-[60] mt-12 -translate-x-1/2 animate-subtle-bounce whitespace-nowrap rounded border-2 border-warning bg-tooltip px-4 py-2 text-base text-foreground shadow-lg backdrop-blur-sm">
            Clone a repository
            <div className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rotate-45 border-l-2 border-t-2 border-warning bg-tooltip backdrop-blur-sm" />
          </div>
        )}
      </div>
    </div>
  );
}
