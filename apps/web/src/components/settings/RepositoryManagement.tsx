'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import type { Repository } from '@minimalcorp/tsunagi-shared';
import { getRepoColor } from '@/lib/repo-colors';
import { apiUrl } from '@/lib/api-url';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/Dialog';

export function RepositoryManagement() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [taskCounts, setTaskCounts] = useState<Record<string, number>>({});
  const [deleteTarget, setDeleteTarget] = useState<Repository | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReordering, setIsReordering] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [reposRes, tasksRes] = await Promise.all([
        fetch(apiUrl('/api/repos')).then((r) => r.json()),
        fetch(apiUrl('/api/tasks')).then((r) => r.json()),
      ]);

      setRepositories(reposRes.data ?? []);

      // Count tasks per repo
      const counts: Record<string, number> = {};
      for (const task of tasksRes.data?.tasks ?? []) {
        const key = `${task.owner}/${task.repo}`;
        counts[key] = (counts[key] ?? 0) + 1;
      }
      setTaskCounts(counts);
    } catch (error) {
      console.error('Failed to load repositories:', error);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      const res = await fetch(apiUrl(`/api/repos/${deleteTarget.owner}/${deleteTarget.repo}`), {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete repository');

      await loadData();
    } catch (error) {
      console.error('Failed to delete repository:', error);
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  /** トップページの列の並び順を1つ入れ替える */
  const handleMove = useCallback(
    async (index: number, direction: -1 | 1) => {
      const swapWith = index + direction;
      if (swapWith < 0 || swapWith >= repositories.length) return;

      const reordered = [...repositories];
      [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];

      // Optimistic UI update
      setRepositories(reordered.map((repo, i) => ({ ...repo, order: i })));
      setIsReordering(true);

      try {
        const res = await fetch(apiUrl('/api/repos/reorder'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repoIds: reordered.map((repo) => repo.id) }),
        });
        if (!res.ok) throw new Error('Failed to reorder repositories');
      } catch (error) {
        console.error('Failed to reorder repositories:', error);
        // 失敗したらサーバーの状態に戻す
        await loadData();
      } finally {
        setIsReordering(false);
      }
    },
    [repositories, loadData]
  );

  if (repositories.length === 0) {
    return <div className="text-sm text-muted-foreground">No repositories cloned yet.</div>;
  }

  return (
    <>
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(details) => {
          if (!details.open) setDeleteTarget(null);
        }}
        title="Delete Repository"
        message={
          deleteTarget
            ? `Delete ${deleteTarget.owner}/${deleteTarget.repo}? This will also delete ${taskCounts[`${deleteTarget.owner}/${deleteTarget.repo}`] ?? 0} associated task(s), all worktrees, and the bare repository. This action cannot be undone.`
            : ''
        }
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete'}
        cancelLabel="Cancel"
        onConfirm={handleDelete}
        variant="danger"
      />

      <p className="text-xs text-muted-foreground">
        この並び順がトップページの列の並び順になります
      </p>

      <div className="space-y-2">
        {repositories.map((repo, index) => {
          const repoKey = `${repo.owner}/${repo.repo}`;
          const color = getRepoColor(repo.owner, repo.repo);
          const count = taskCounts[repoKey] ?? 0;

          return (
            <div
              key={repo.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border p-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color.bg} ${color.text}`}
                >
                  {repoKey}
                </span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {count} task{count !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="flex flex-shrink-0 items-center">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleMove(index, -1)}
                  disabled={index === 0 || isReordering}
                  className="text-muted-foreground"
                  title="Move up"
                >
                  <ChevronUp className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleMove(index, 1)}
                  disabled={index === repositories.length - 1 || isReordering}
                  className="text-muted-foreground"
                  title="Move down"
                >
                  <ChevronDown className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteTarget(repo)}
                  className="text-muted-foreground hover:text-destructive"
                  title="Delete repository"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
