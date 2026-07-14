'use client';

import type { ReactNode } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TaskListOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function TaskListOverlay({ open, onOpenChange, children }: TaskListOverlayProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className={cn(
            'fixed inset-0 z-50 bg-black/20 backdrop-blur-sm',
            'data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0'
          )}
        />
        <DialogPrimitive.Popup
          className={cn(
            'fixed inset-y-0 left-0 z-50 flex h-full w-[85vw] max-w-sm flex-col',
            'bg-background border-r border-border shadow-lg outline-none',
            'data-open:animate-in data-open:slide-in-from-left data-closed:animate-out data-closed:slide-out-to-left'
          )}
        >
          <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border px-4">
            <DialogPrimitive.Title className="text-sm font-medium text-foreground">
              Tasks
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground"
                />
              }
            >
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1">{children}</div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
