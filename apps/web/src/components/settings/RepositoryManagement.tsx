'use client';

import { useState, useEffect, useCallback } from 'react';
import { Trash2 } from 'lucide-react';
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

  const loadData = useCallback(async () => {
    try {
      const [reposRes, tasksRes] = await Promise.all([
        fetch(apiUrl('/api/repos')).then((r) => r.json()),
        fetch(apiUrl('/api/tasks')).then((r) => r.json()),
      ]);

      setRepositories(reposRes.data?.repos ?? []);

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

      <div className="space-y-2">
        {repositories.map((repo) => {
          const repoKey = `${repo.owner}/${repo.repo}`;
          const color = getRepoColor(repo.owner, repo.repo);
          const count = taskCounts[repoKey] ?? 0;

          return (
            <div
              key={repo.id}
              className="flex items-center justify-between rounded-md border border-border p-3"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color.bg} ${color.text}`}
                >
                  {repoKey}
                </span>
                <span className="text-xs text-muted-foreground">
                  {count} task{count !== 1 ? 's' : ''}
                </span>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDeleteTarget(repo)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          );
        })}
      </div>
    </>
  );
}
