'use client';

import { useState } from 'react';
import type { Task } from '@minimalcorp/tsunagi-shared';
import { normalizeBranchName } from '@/lib/branch-utils';
import { Code2, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { ConfirmDialog } from './ui/Dialog';
import { Button } from '@/components/ui/button';

interface TaskActionsProps {
  task: Task;
  onDelete: (taskId: string) => Promise<void>;
}

function getWorktreePath(task: Task): string {
  const normalizedBranch = normalizeBranchName(task.branch);
  return `~/.tsunagi/workspaces/${task.owner}/${task.repo}/${normalizedBranch}`;
}

export function TaskActions({ task, onDelete }: TaskActionsProps) {
  const worktreePath = getWorktreePath(task);
  const toast = useToast();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const handleOpenVSCode = async () => {
    const notificationId = toast.loading('Opening VS Code...', worktreePath);

    try {
      const response = await fetch('/api/commands/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commandType: 'vscode',
          owner: task.owner,
          repo: task.repo,
          branch: task.branch,
        }),
      });

      if (!response.ok) throw new Error('Command execution failed');

      toast.success(notificationId, 'Successfully opened VS Code', worktreePath);
    } catch {
      const command = `code ${worktreePath}`;
      await navigator.clipboard.writeText(command);
      toast.info(
        'Command copied to clipboard',
        `Failed to open automatically. Command: ${command}`
      );
      toast.dismiss(notificationId);
    }
  };

  const executeDelete = () => {
    const notificationId = toast.loading('Deleting task...', task.title);

    onDelete(task.id)
      .then(() => {
        toast.success(notificationId, 'Successfully deleted task', task.title);
      })
      .catch((error) => {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        toast.error(notificationId, 'Failed to delete task', errorMessage);
      });
  };

  return (
    <>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={(details) => setDeleteConfirmOpen(details.open)}
        title="Delete Task"
        message={`Delete task "${task.title}"?\n\nThis will also delete the worktree and branch.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={executeDelete}
        variant="danger"
      />

      <div className="flex items-center gap-2">
        <Button variant="destructive" size="lg" onClick={() => setDeleteConfirmOpen(true)}>
          <Trash2 className="w-4 h-4" />
          Delete Task
        </Button>

        <Button size="lg" onClick={handleOpenVSCode}>
          <Code2 className="w-4 h-4" />
          Open VS Code
        </Button>
      </div>
    </>
  );
}
