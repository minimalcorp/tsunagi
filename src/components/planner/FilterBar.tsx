'use client';

import { useState, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import type { Repository } from '@/lib/types';
import { getRepoColor } from '@/lib/repo-colors';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

export interface FilterState {
  statuses: string[];
  repos: string[];
  search: string;
}

interface FilterBarProps {
  repositories: Repository[];
  onFilterChange: (filters: FilterState) => void;
}

const STATUSES = ['backlog', 'planning', 'coding', 'reviewing', 'done'] as const;

const STATUS_STYLES: Record<string, { active: string; inactive: string }> = {
  backlog: {
    active: 'bg-muted text-foreground ring-1 ring-foreground/20',
    inactive: 'bg-transparent text-muted-foreground hover:bg-muted/50',
  },
  planning: {
    active: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    inactive: 'bg-transparent text-muted-foreground hover:bg-muted/50',
  },
  coding: {
    active: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    inactive: 'bg-transparent text-muted-foreground hover:bg-muted/50',
  },
  reviewing: {
    active: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    inactive: 'bg-transparent text-muted-foreground hover:bg-muted/50',
  },
  done: {
    active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    inactive: 'bg-transparent text-muted-foreground hover:bg-muted/50',
  },
};

export function FilterBar({ repositories, onFilterChange }: FilterBarProps) {
  const [filters, setFilters] = useState<FilterState>({
    statuses: [],
    repos: [],
    search: '',
  });

  const updateFilters = useCallback(
    (partial: Partial<FilterState>) => {
      const next = { ...filters, ...partial };
      setFilters(next);
      onFilterChange(next);
    },
    [filters, onFilterChange]
  );

  const toggleStatus = useCallback(
    (status: string) => {
      const current = filters.statuses;
      const next = current.includes(status)
        ? current.filter((s) => s !== status)
        : [...current, status];
      updateFilters({ statuses: next });
    },
    [filters.statuses, updateFilters]
  );

  const toggleRepo = useCallback(
    (repoKey: string) => {
      const current = filters.repos;
      const next = current.includes(repoKey)
        ? current.filter((r) => r !== repoKey)
        : [...current, repoKey];
      updateFilters({ repos: next });
    },
    [filters.repos, updateFilters]
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateFilters({ search: e.target.value });
    },
    [updateFilters]
  );

  const clearSearch = useCallback(() => {
    updateFilters({ search: '' });
  }, [updateFilters]);

  return (
    <div className="space-y-2">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <Input
          value={filters.search}
          onChange={handleSearchChange}
          placeholder="Search tasks..."
          className="h-8 pl-8 pr-8 text-xs"
        />
        {filters.search && (
          <button
            onClick={clearSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 size-4 inline-flex items-center justify-center rounded-sm hover:bg-accent"
          >
            <X className="size-3 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap items-center gap-1">
        {STATUSES.map((status) => {
          const isActive = filters.statuses.includes(status);
          const style = STATUS_STYLES[status];
          return (
            <button
              key={status}
              onClick={() => toggleStatus(status)}
              className={cn(
                'inline-flex h-6 items-center rounded-full px-2.5 text-[0.625rem] font-medium transition-colors',
                isActive ? style.active : style.inactive
              )}
            >
              {status}
            </button>
          );
        })}
      </div>

      {/* Repository chips */}
      {repositories.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {repositories.map((repo) => {
            const repoKey = `${repo.owner}/${repo.repo}`;
            const isActive = filters.repos.includes(repoKey);
            const color = getRepoColor(repo.owner, repo.repo);
            return (
              <button
                key={repo.id}
                onClick={() => toggleRepo(repoKey)}
                className={cn(
                  'inline-flex h-6 items-center rounded-full px-2.5 text-[0.625rem] font-medium transition-colors',
                  isActive
                    ? `${color.bg} ${color.text}`
                    : 'bg-transparent text-muted-foreground hover:bg-muted/50'
                )}
              >
                {repoKey}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
