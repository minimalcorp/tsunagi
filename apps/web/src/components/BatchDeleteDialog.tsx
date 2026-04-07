'use client';

import { useState } from 'react';
import { Dialog } from './ui/Dialog';
import { DialogClose } from './ui/dialog-primitives';
import { Button } from './ui/button';
import { Input } from '@/components/ui/input';

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
          <Input
            type="number"
            min="1"
            value={daysAgo}
            onChange={(e) => setDaysAgo(Number(e.target.value))}
            className="w-16 mx-1 text-center inline-block"
          />{' '}
          days ago?
        </p>
        <p className="text-sm text-muted-foreground">
          This action will permanently delete the selected tasks and their associated worktrees.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <DialogClose render={<Button variant="outline" className="cursor-pointer" />}>
            Cancel
          </DialogClose>
          <Button variant="destructive" onClick={handleConfirm} className="cursor-pointer">
            Delete
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
