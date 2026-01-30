'use client';

import { useState, useEffect } from 'react';
import type { Task } from '@/lib/types';
import { normalizeBranchName } from '@/lib/branch-utils';
import {
  Code2,
  Terminal,
  Trash2,
  GitMerge,
  Loader2,
  FileText,
  Play,
  CheckCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { ConfirmDialog } from './ui/Dialog';
import { MarkdownViewerDialog } from './MarkdownViewerDialog';

interface TaskActionsProps {
  task: Task;
  onDelete: (taskId: string) => Promise<void>;
  onSendPrompt?: (tabId: string, prompt: string) => Promise<void>;
  activeTabId?: string;
}

function getWorktreePath(task: Task): string {
  const normalizedBranch = normalizeBranchName(task.branch);
  return `~/.tsunagi/workspaces/${task.owner}/${task.repo}/${normalizedBranch}`;
}

export function TaskActions({ task, onDelete, onSendPrompt, activeTabId }: TaskActionsProps) {
  const worktreePath = getWorktreePath(task);
  const toast = useToast();
  const [needsRebase, setNeedsRebase] = useState<boolean | undefined>(undefined);
  const [isCheckingRebase, setIsCheckingRebase] = useState(false);
  const [rebaseConfirmOpen, setRebaseConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [markdownViewerOpen, setMarkdownViewerOpen] = useState(false);
  const [markdownViewerContent, setMarkdownViewerContent] = useState({ title: '', content: '' });

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

  const executeRebase = async () => {
    const notificationId = toast.loading('Rebasing branch...', task.branch);

    try {
      const response = await fetch(`/api/tasks/${task.id}/rebase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      if (response.ok) {
        // rebase成功後、needsRebaseをfalseに設定
        setNeedsRebase(false);
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

  const executeDelete = () => {
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

  const handleViewMarkdown = (title: string, content: string | undefined) => {
    setMarkdownViewerContent({
      title,
      content: content || 'No content available',
    });
    setMarkdownViewerOpen(true);
  };

  const handleRequestPlanning = async () => {
    if (!onSendPrompt || !activeTabId) return;

    const prompt = `タスクをplanningステータスに更新してください。

その後、以下の情報からrequirement, design, procedureを作成してください：
title: ${task.title}
description: ${task.description}

それぞれの資料の役割：
1. requirement: ユーザーの要望をまとめた資料
2. design: 要求実現のための設計資料
3. procedure: 実装手順のチェックリスト`;

    await onSendPrompt(activeTabId, prompt);
  };

  const handleRequestImplementation = async () => {
    if (!onSendPrompt || !activeTabId) return;

    const prompt =
      task.status === 'reviewing'
        ? `現在、タスクはreviewing状態です。
レビューやテストで見つかった問題を修正してください。

修正内容をユーザーに確認してから、以下を実行：
1. 修正内容の確認・ヒアリング
2. 問題の修正
3. Prettier, ESLint, TypeScript型チェック
4. 動作確認
5. 修正をコミット・プッシュ

修正が完了したら、その旨を報告してください。`
        : `タスクをcodingステータスに更新してください。

その後、requirement, designを参考にし、procedureに従って実装を開始してください。

実装後、以下を実行：
1. Prettier, ESLint, TypeScript型チェック
2. 動作確認（可能なら）
3. Pull Request作成

PR作成後、タスクをreviewingステータスに更新してください。`;

    await onSendPrompt(activeTabId, prompt);
  };

  const handleCompleteTask = async () => {
    const notificationId = toast.loading('Completing task...', task.title);

    try {
      const response = await fetch(`/api/tasks/${task.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error('Failed to complete task');
      }

      toast.success(notificationId, 'Successfully completed task', task.title);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(notificationId, 'Failed to complete task', errorMessage);
    }
  };

  return (
    <>
      {/* Confirmation Dialogs */}
      <ConfirmDialog
        open={rebaseConfirmOpen}
        onOpenChange={(details) => setRebaseConfirmOpen(details.open)}
        title="Rebase Branch"
        message={`Rebase ${task.branch} to origin/main?\n\nThis will fetch the latest changes and rebase your branch.`}
        confirmLabel="Rebase"
        cancelLabel="Cancel"
        onConfirm={executeRebase}
        variant="default"
      />

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

      {/* Markdown Viewer Dialog */}
      <MarkdownViewerDialog
        open={markdownViewerOpen}
        onOpenChange={(details) => setMarkdownViewerOpen(details.open)}
        title={markdownViewerContent.title}
        content={markdownViewerContent.content}
      />

      <div>
        {/* Workflow Action Buttons (Status-based) */}
        <div className="mb-4 flex flex-wrap gap-2">
          {/* Backlog: 計画を依頼 */}
          {task.status === 'backlog' && (
            <button
              onClick={handleRequestPlanning}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-hover flex items-center gap-2 font-medium text-sm"
              title="Request planning from Claude"
            >
              <FileText className="w-4 h-4" />
              Request Planning
            </button>
          )}

          {/* Planning: Requirement/Design/Procedure表示、実装を依頼 */}
          {task.status === 'planning' && (
            <>
              <button
                onClick={() => handleViewMarkdown('Requirement', task.requirement)}
                className="px-4 py-2 bg-theme-card text-theme-fg rounded-lg hover:bg-theme-hover border border-theme flex items-center gap-2 font-medium text-sm"
              >
                <FileText className="w-4 h-4" />
                Requirement
              </button>
              <button
                onClick={() => handleViewMarkdown('Design', task.design)}
                className="px-4 py-2 bg-theme-card text-theme-fg rounded-lg hover:bg-theme-hover border border-theme flex items-center gap-2 font-medium text-sm"
              >
                <FileText className="w-4 h-4" />
                Design
              </button>
              <button
                onClick={() => handleViewMarkdown('Procedure', task.procedure)}
                className="px-4 py-2 bg-theme-card text-theme-fg rounded-lg hover:bg-theme-hover border border-theme flex items-center gap-2 font-medium text-sm"
              >
                <FileText className="w-4 h-4" />
                Procedure
              </button>
              <button
                onClick={handleRequestImplementation}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-hover flex items-center gap-2 font-medium text-sm"
                title="Request implementation from Claude"
              >
                <Play className="w-4 h-4" />
                Request Implementation
              </button>
            </>
          )}

          {/* Reviewing: Requirement/Design/Procedure表示、実装を依頼、タスクを完了 */}
          {task.status === 'reviewing' && (
            <>
              <button
                onClick={() => handleViewMarkdown('Requirement', task.requirement)}
                className="px-4 py-2 bg-theme-card text-theme-fg rounded-lg hover:bg-theme-hover border border-theme flex items-center gap-2 font-medium text-sm"
              >
                <FileText className="w-4 h-4" />
                Requirement
              </button>
              <button
                onClick={() => handleViewMarkdown('Design', task.design)}
                className="px-4 py-2 bg-theme-card text-theme-fg rounded-lg hover:bg-theme-hover border border-theme flex items-center gap-2 font-medium text-sm"
              >
                <FileText className="w-4 h-4" />
                Design
              </button>
              <button
                onClick={() => handleViewMarkdown('Procedure', task.procedure)}
                className="px-4 py-2 bg-theme-card text-theme-fg rounded-lg hover:bg-theme-hover border border-theme flex items-center gap-2 font-medium text-sm"
              >
                <FileText className="w-4 h-4" />
                Procedure
              </button>
              <button
                onClick={handleRequestImplementation}
                className="px-4 py-2 bg-theme-card text-theme-fg rounded-lg hover:bg-theme-hover border border-theme flex items-center gap-2 font-medium text-sm"
                title="Request fix implementation from Claude"
              >
                <Play className="w-4 h-4" />
                Request Implementation (Fix)
              </button>
              <button
                onClick={handleCompleteTask}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 font-medium text-sm"
                title="Complete task and merge PR"
              >
                <CheckCircle className="w-4 h-4" />
                Complete Task
              </button>
            </>
          )}
        </div>

        {/* Existing Actions (VS Code, Terminal, Rebase, Delete) */}
        {/* Desktop Layout (md:) - 1 row */}
        <div className="hidden md:flex items-center gap-2">
          <button
            onClick={() => setDeleteConfirmOpen(true)}
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
            onClick={() => setRebaseConfirmOpen(true)}
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
            onClick={() => setDeleteConfirmOpen(true)}
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
              onClick={() => setRebaseConfirmOpen(true)}
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
    </>
  );
}
