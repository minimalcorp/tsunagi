'use client';

import { useState } from 'react';
import type { Task } from '@/lib/types';
import { normalizeBranchName } from '@/lib/branch-utils';
import { Code2, Terminal, Trash2, GitMerge } from 'lucide-react';

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
  const [isExecuting, setIsExecuting] = useState<string | null>(null);
  const [isRebasing, setIsRebasing] = useState(false);

  const handleCommand = async (commandType: 'vscode' | 'terminal') => {
    setIsExecuting(commandType);
    try {
      const response = await fetch('/api/commands/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commandType,
          owner: task.owner,
          repo: task.repo,
          branch: task.branch,
        }),
      });

      if (!response.ok) {
        throw new Error('Command execution failed');
      }
    } catch {
      // フォールバック: クリップボードにコピー
      const command = commandType === 'vscode' ? `code ${worktreePath}` : `cd ${worktreePath}`;
      await navigator.clipboard.writeText(command);
      alert('Command execution failed. Command copied to clipboard instead.');
    } finally {
      setIsExecuting(null);
    }
  };

  const handleRebase = async () => {
    if (
      !confirm(
        `Rebase ${task.branch} to origin/main?\n\nThis will fetch the latest changes and rebase your branch.`
      )
    ) {
      return;
    }

    setIsRebasing(true);
    try {
      const response = await fetch(`/api/tasks/${task.id}/rebase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      if (response.ok) {
        alert(`✓ ${data.data.message}`);
      } else if (response.status === 409) {
        // conflict発生
        const conflictFiles = data.conflicts?.join('\n  - ') || 'unknown files';
        alert(
          `✗ Rebase failed due to conflicts:\n\n  - ${conflictFiles}\n\nPlease resolve conflicts manually.`
        );
      } else {
        alert(`✗ ${data.error || 'Rebase failed'}`);
      }
    } catch (error) {
      alert(`✗ Failed to rebase: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRebasing(false);
    }
  };

  const handleDelete = async () => {
    if (confirm(`Delete task "${task.title}"?\n\nThis will also delete the worktree and branch.`)) {
      await onDelete(task.id);
    }
  };

  const isRebaseDisabled =
    task.worktreeStatus !== 'created' || task.claudeState === 'running' || isRebasing;

  return (
    <div>
      {/* Desktop Layout (md:) - 1 row */}
      <div className="hidden md:flex items-center gap-2">
        <button
          onClick={handleDelete}
          className="w-auto px-4 py-2 bg-red-700 text-white rounded-lg hover:bg-red-600 flex items-center gap-2 cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
          Delete Task
        </button>

        <button
          onClick={() => handleCommand('vscode')}
          disabled={isExecuting !== null}
          className="flex-1 px-4 py-2 rounded-lg font-medium text-sm cursor-pointer bg-primary-600 hover:bg-primary-hover text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Code2 className="w-4 h-4" />
          {isExecuting === 'vscode' ? 'Opening...' : 'Open VS Code'}
        </button>

        <button
          onClick={() => handleCommand('terminal')}
          disabled={isExecuting !== null}
          className="flex-1 px-4 py-2 rounded-lg font-medium text-sm cursor-pointer bg-theme-card hover:bg-theme-hover text-theme-fg border border-theme disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Terminal className="w-4 h-4" />
          {isExecuting === 'terminal' ? 'Opening...' : 'Open Terminal'}
        </button>

        <button
          onClick={handleRebase}
          disabled={isRebaseDisabled}
          title="Rebase to main"
          className="w-auto px-4 py-2 bg-theme-card hover:bg-theme-hover text-theme-fg border border-theme rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <GitMerge className="w-4 h-4" />
          Rebase
        </button>
      </div>

      {/* Mobile Layout (< md:) - 2 rows */}
      <div className="flex flex-col gap-2 md:hidden">
        <button
          onClick={handleDelete}
          className="w-full px-4 py-2 bg-red-700 text-white rounded-lg hover:bg-red-600 flex items-center justify-center gap-2 cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
          Delete Task
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleCommand('vscode')}
            disabled={isExecuting !== null}
            className="flex-1 px-4 py-2 rounded-lg font-medium text-sm cursor-pointer bg-primary-600 hover:bg-primary-hover text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Code2 className="w-4 h-4" />
            {isExecuting === 'vscode' ? 'Opening...' : 'Open VS Code'}
          </button>

          <button
            onClick={() => handleCommand('terminal')}
            disabled={isExecuting !== null}
            className="flex-1 px-4 py-2 rounded-lg font-medium text-sm cursor-pointer bg-theme-card hover:bg-theme-hover text-theme-fg border border-theme disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Terminal className="w-4 h-4" />
            {isExecuting === 'terminal' ? 'Opening...' : 'Open Terminal'}
          </button>

          <button
            onClick={handleRebase}
            disabled={isRebaseDisabled}
            title="Rebase to main"
            className="w-auto px-4 py-2 bg-theme-card hover:bg-theme-hover text-theme-fg border border-theme rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <GitMerge className="w-4 h-4" />
            Rebase
          </button>
        </div>
      </div>
    </div>
  );
}
