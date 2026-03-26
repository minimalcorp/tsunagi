'use client';

import { useState } from 'react';
import { Dialog } from './ui/Dialog';
import { Dialog as ArkDialog } from '@ark-ui/react/dialog';

interface BatchDeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (daysAgo: number) => void;
  defaultDays?: number;
}

export function BatchDeleteDialog({
  isOpen,
  onClose,
  onConfirm,
  defaultDays = 7,
}: BatchDeleteDialogProps) {
  const [daysAgo, setDaysAgo] = useState(defaultDays);

  const handleConfirm = () => {
    onConfirm(daysAgo);
    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(details) => !details.open && onClose()}
      title="Delete Old Tasks"
      maxWidth="md"
      showCloseButton={false}
    >
      <div className="space-y-4">
        <p className="text-foreground">
          Delete tasks completed more than{' '}
          <input
            type="number"
            min="1"
            value={daysAgo}
            onChange={(e) => setDaysAgo(Number(e.target.value))}
            className="w-16 h-8 px-2 mx-1 rounded-md border border-input bg-transparent text-sm shadow-xs text-foreground text-center"
          />{' '}
          days ago?
        </p>
        <p className="text-sm text-muted-foreground">
          This action will permanently delete the selected tasks and their associated worktrees.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <ArkDialog.CloseTrigger asChild>
            <button className="h-9 px-4 py-2 rounded-md text-sm font-medium border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground active:scale-95 transition-[color,background-color,transform] cursor-pointer">
              Cancel
            </button>
          </ArkDialog.CloseTrigger>
          <button
            onClick={handleConfirm}
            className="h-9 px-4 py-2 rounded-md text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-95 transition-[color,background-color,transform] cursor-pointer"
          >
            Delete
          </button>
        </div>
      </div>
    </Dialog>
  );
}
