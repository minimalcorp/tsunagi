'use client';

import type { Task } from '@/lib/types';
import { CommandCopyButton } from './CommandCopyButton';
import * as path from 'path';
import * as os from 'os';

interface TaskActionsProps {
  task: Task;
  onDelete: (taskId: string) => Promise<void>;
}

function getWorktreePath(task: Task): string {
  const baseDir = path.join(os.homedir(), '.tsunagi', 'workspaces');
  return path.join(baseDir, task.owner, task.repo, task.branch);
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
      <h2 className="text-lg font-semibold mb-3 text-theme-fg">Quick Actions</h2>

      {/* Worktree Path */}
      <div className="mb-4 p-3 bg-theme-hover rounded-lg">
        <div className="text-xs text-theme-muted mb-1">Worktree Path</div>
        <div className="font-mono text-sm text-theme-fg break-all">{worktreePath}</div>
      </div>

      {/* Command Copy Buttons */}
      <div className="space-y-2 mb-4">
        <CommandCopyButton
          command={`code ${worktreePath}`}
          label="Open in VS Code"
          icon="📝"
          variant="primary"
        />

        <CommandCopyButton command={`cd ${worktreePath}`} label="Open in Terminal" icon="💻" />
      </div>

      {/* Delete Button */}
      <button
        onClick={handleDelete}
        className="w-full px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
      >
        🗑️ Delete Task (+ Worktree/Branch)
      </button>
    </div>
  );
}
