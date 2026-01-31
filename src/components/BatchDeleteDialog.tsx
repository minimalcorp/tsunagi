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
        <p className="text-theme-fg">
          Delete tasks completed more than{' '}
          <input
            type="number"
            min="1"
            value={daysAgo}
            onChange={(e) => setDaysAgo(Number(e.target.value))}
            className="w-16 px-2 py-1 mx-1 border border-theme rounded bg-theme-card text-theme-fg text-center"
          />{' '}
          days ago?
        </p>
        <p className="text-sm text-theme-muted">
          This action will permanently delete the selected tasks and their associated worktrees.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <ArkDialog.CloseTrigger asChild>
            <button className="px-4 py-2 border border-theme rounded text-theme-fg hover:bg-theme-hover active:scale-95 transition-transform cursor-pointer">
              Cancel
            </button>
          </ArkDialog.CloseTrigger>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 bg-red-700 text-white rounded hover:bg-red-600 active:scale-95 transition-transform cursor-pointer"
          >
            Delete
          </button>
        </div>
      </div>
    </Dialog>
  );
}
