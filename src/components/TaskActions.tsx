'use client';

import type { Task } from '@/lib/types';
import { CommandCopyButton } from './CommandCopyButton';
import { Code2, Terminal, Trash2 } from 'lucide-react';

interface TaskActionsProps {
  task: Task;
  onDelete: (taskId: string) => Promise<void>;
}

function getWorktreePath(task: Task): string {
  return `~/.tsunagi/workspaces/${task.owner}/${task.repo}/${task.branch}`;
}

export function TaskActions({ task, onDelete }: TaskActionsProps) {
  const worktreePath = getWorktreePath(task);

  const handleDelete = async () => {
    if (confirm(`Delete task "${task.title}"?\n\nThis will also delete the worktree and branch.`)) {
      await onDelete(task.id);
    }
  };

  return (
    <div>
      {/* Command Copy Buttons */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <CommandCopyButton
          command={`code ${worktreePath}`}
          label="Copy VS Code Command"
          icon={<Code2 className="w-4 h-4" />}
          variant="primary"
        />

        <CommandCopyButton
          command={`cd ${worktreePath}`}
          label="Copy Terminal Command"
          icon={<Terminal className="w-4 h-4" />}
        />
      </div>

      {/* Delete Button */}
      <button
        onClick={handleDelete}
        className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 flex items-center justify-center gap-2"
      >
        <Trash2 className="w-4 h-4" />
        Delete Task (+ Worktree/Branch)
      </button>
    </div>
  );
}
