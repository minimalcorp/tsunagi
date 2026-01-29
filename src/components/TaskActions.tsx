'use client';

import { useState, useEffect } from 'react';
import type { Task } from '@/lib/types';
import { normalizeBranchName } from '@/lib/branch-utils';
import { Code2, Terminal, Trash2, GitMerge, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/useToast';

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
  const [needsRebase, setNeedsRebase] = useState<boolean | undefined>(undefined);
  const [isCheckingRebase, setIsCheckingRebase] = useState(false);

  // rebase判定を非同期で取得
  useEffect(() => {
    // worktreeが作成済みの場合のみ判定を取得
    if (task.worktreeStatus !== 'created') {
      setNeedsRebase(false);
      return;
    }

    const checkRebase = async () => {
      setIsCheckingRebase(true);
      try {
        const response = await fetch(`/api/tasks/${task.id}/needs-rebase`);
        if (response.ok) {
          const data = await response.json();
          setNeedsRebase(data.data.needsRebase);
        } else {
          setNeedsRebase(false);
        }
      } catch (error) {
        console.error('Failed to check rebase status:', error);
        setNeedsRebase(false);
      } finally {
        setIsCheckingRebase(false);
      }
    };

    checkRebase();
  }, [task.id, task.worktreeStatus]);

  const handleCommand = async (commandType: 'vscode' | 'terminal') => {
    const commandLabel = commandType === 'vscode' ? 'VS Code' : 'Terminal';
    const notificationId = toast.loading(`Opening ${commandLabel}...`, worktreePath);

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

      toast.success(notificationId, `Successfully opened ${commandLabel}`, worktreePath);
    } catch {
      // フォールバック: クリップボードにコピー
      const command = commandType === 'vscode' ? `code ${worktreePath}` : `cd ${worktreePath}`;
      await navigator.clipboard.writeText(command);
      toast.info(
        'Command copied to clipboard',
        `Failed to open automatically. Command: ${command}`
      );
      toast.dismiss(notificationId);
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

    const notificationId = toast.loading('Rebasing branch...', task.branch);

    try {
      const response = await fetch(`/api/tasks/${task.id}/rebase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(notificationId, 'Successfully rebased branch', task.branch);
      } else if (response.status === 409) {
        // conflict発生
        const conflictFiles = data.conflicts?.join('\n  - ') || 'unknown files';
        toast.error(
          notificationId,
          'Rebase failed due to conflicts',
          `Conflicts in:\n${conflictFiles}`
        );
      } else {
        toast.error(notificationId, 'Rebase failed', data.error || 'Unknown error');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(notificationId, 'Failed to rebase', errorMessage);
    }
  };

  const handleDelete = () => {
    if (
      !confirm(`Delete task "${task.title}"?\n\nThis will also delete the worktree and branch.`)
    ) {
      return;
    }

    const notificationId = toast.loading('Deleting task...', task.title);

    // 非同期で削除処理を実行（awaitしない）
    onDelete(task.id)
      .then(() => {
        toast.success(notificationId, 'Successfully deleted task', task.title);
      })
      .catch((error) => {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        toast.error(notificationId, 'Failed to delete task', errorMessage);
      });
  };

  const isClaudeRunning = task.tabs.some((tab) => tab.status === 'running');
  const isRebaseDisabled = task.worktreeStatus !== 'created' || isClaudeRunning;

  return (
    <div>
      {/* Desktop Layout (md:) - 1 row */}
      <div className="hidden md:flex items-center gap-2">
        <button
          onClick={handleDelete}
          className="w-auto px-4 py-2 bg-red-700 text-white rounded-lg hover:bg-red-600 flex items-center gap-2 cursor-pointer font-medium text-sm"
        >
          <Trash2 className="w-4 h-4" />
          Delete Task
        </button>

        <button
          onClick={() => handleCommand('vscode')}
          className="flex-1 px-4 py-2 rounded-lg font-medium text-sm cursor-pointer bg-primary-600 hover:bg-primary-hover text-white flex items-center justify-center gap-2"
        >
          <Code2 className="w-4 h-4" />
          Open VS Code
        </button>

        <button
          onClick={() => handleCommand('terminal')}
          className="flex-1 px-4 py-2 rounded-lg font-medium text-sm cursor-pointer bg-theme-card hover:bg-theme-hover text-theme-fg border border-theme flex items-center justify-center gap-2"
        >
          <Terminal className="w-4 h-4" />
          Open Terminal
        </button>

        <button
          onClick={handleRebase}
          disabled={isRebaseDisabled}
          title={
            needsRebase ? 'Base branch has new commits - Rebase recommended' : 'Rebase to main'
          }
          className={`w-auto px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer font-medium text-sm ${
            needsRebase
              ? 'bg-primary-600 hover:bg-primary-hover text-white border-0'
              : 'bg-theme-card hover:bg-theme-hover text-theme-fg border border-theme'
          }`}
        >
          {isCheckingRebase ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <GitMerge className="w-4 h-4" />
          )}
          Rebase
        </button>
      </div>

      {/* Mobile Layout (< md:) - 2 rows */}
      <div className="flex flex-col gap-2 md:hidden">
        <button
          onClick={handleDelete}
          className="w-full px-4 py-2 bg-red-700 text-white rounded-lg hover:bg-red-600 flex items-center justify-center gap-2 cursor-pointer font-medium text-sm"
        >
          <Trash2 className="w-4 h-4" />
          Delete Task
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleCommand('vscode')}
            className="flex-1 px-4 py-2 rounded-lg font-medium text-sm cursor-pointer bg-primary-600 hover:bg-primary-hover text-white flex items-center justify-center gap-2"
          >
            <Code2 className="w-4 h-4" />
            Open VS Code
          </button>

          <button
            onClick={() => handleCommand('terminal')}
            className="flex-1 px-4 py-2 rounded-lg font-medium text-sm cursor-pointer bg-theme-card hover:bg-theme-hover text-theme-fg border border-theme flex items-center justify-center gap-2"
          >
            <Terminal className="w-4 h-4" />
            Open Terminal
          </button>

          <button
            onClick={handleRebase}
            disabled={isRebaseDisabled}
            title={
              needsRebase ? 'Base branch has new commits - Rebase recommended' : 'Rebase to main'
            }
            className={`w-auto px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer font-medium text-sm ${
              needsRebase
                ? 'bg-primary-600 hover:bg-primary-hover text-white border-0'
                : 'bg-theme-card hover:bg-theme-hover text-theme-fg border border-theme'
            }`}
          >
            {isCheckingRebase ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <GitMerge className="w-4 h-4" />
            )}
            Rebase
          </button>
        </div>
      </div>
    </div>
  );
}
