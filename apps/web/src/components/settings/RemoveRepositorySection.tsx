'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog-primitives';

interface RemoveRepositorySectionProps {
  owner: string;
  repo: string;
  onDeleted: () => void;
}

export function RemoveRepositorySection({ owner, repo, onDeleted }: RemoveRepositorySectionProps) {
  const [open, setOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const repoFullName = `${owner}/${repo}`;
  const isConfirmed = confirmInput === repoFullName;

  const handleDelete = async () => {
    if (!isConfirmed) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/repos/${owner}/${repo}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete repository');
      onDeleted();
    } catch (error) {
      console.error('Failed to delete repository:', error);
    } finally {
      setIsDeleting(false);
      setOpen(false);
      setConfirmInput('');
    }
  };

  return (
    <>
      <div className="rounded-md border border-destructive/30 p-4 space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-destructive">Remove Repository</h3>
          <p className="text-xs text-muted-foreground">
            Remove this repository and all associated data including tasks, worktrees, and
            environment variables. This action cannot be undone.
          </p>
        </div>
        <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
          <Trash2 className="size-4" />
          Remove Repository
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Remove Repository</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{repoFullName}</strong> and all associated tasks,
              worktrees, and environment variables.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">
              Type <strong>{repoFullName}</strong> to confirm
            </label>
            <Input
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={repoFullName}
              autoComplete="off"
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setOpen(false);
                setConfirmInput('');
              }}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={!isConfirmed || isDeleting}
            >
              {isDeleting ? 'Removing...' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
