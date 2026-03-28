'use client';

import { useState, useCallback } from 'react';
import { Search, SlidersHorizontal, X, Trash2 } from 'lucide-react';
import type { Repository } from '@/lib/types';
import { getRepoColor } from '@/lib/repo-colors';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export interface FilterState {
  statuses: string[];
  repos: string[];
  search: string;
}

interface SearchAndFilterBarProps {
  repositories: Repository[];
  filters: FilterState;
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

export function SearchAndFilterBar({
  repositories,
  filters,
  onFilterChange,
}: SearchAndFilterBarProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const hasActiveFilters = filters.statuses.length > 0 || filters.repos.length > 0;

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onFilterChange({ ...filters, search: e.target.value });
    },
    [filters, onFilterChange]
  );

  const clearSearch = useCallback(() => {
    onFilterChange({ ...filters, search: '' });
  }, [filters, onFilterChange]);

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Search input */}
        <div className="relative flex-1">
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

        {/* Filter button */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => setIsDialogOpen(true)}
          className={cn('size-8 flex-shrink-0', hasActiveFilters && 'border-primary text-primary')}
          title="Filters"
        >
          <SlidersHorizontal className="size-3.5" />
        </Button>
      </div>

      {/* Filter Dialog */}
      {isDialogOpen && (
        <FilterDialog
          repositories={repositories}
          filters={filters}
          onFilterChange={onFilterChange}
          onClose={() => setIsDialogOpen(false)}
        />
      )}
    </>
  );
}

function FilterDialog({
  repositories,
  filters,
  onFilterChange,
  onClose,
}: {
  repositories: Repository[];
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  onClose: () => void;
}) {
  const toggleStatus = useCallback(
    (status: string) => {
      const next = filters.statuses.includes(status)
        ? filters.statuses.filter((s) => s !== status)
        : [...filters.statuses, status];
      onFilterChange({ ...filters, statuses: next });
    },
    [filters, onFilterChange]
  );

  const toggleRepo = useCallback(
    (repoKey: string) => {
      const next = filters.repos.includes(repoKey)
        ? filters.repos.filter((r) => r !== repoKey)
        : [...filters.repos, repoKey];
      onFilterChange({ ...filters, repos: next });
    },
    [filters, onFilterChange]
  );

  const clearAll = useCallback(() => {
    onFilterChange({ ...filters, statuses: [], repos: [] });
  }, [filters, onFilterChange]);

  const hasActiveFilters = filters.statuses.length > 0 || filters.repos.length > 0;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50" onClick={onClose} />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-sm rounded-lg border border-border bg-card p-4 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Filters</h3>
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearAll} className="h-7 text-xs gap-1">
                  <Trash2 className="size-3" />
                  Clear all
                </Button>
              )}
              <button
                onClick={onClose}
                className="size-6 inline-flex items-center justify-center rounded-sm hover:bg-accent"
              >
                <X className="size-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Status filter */}
          <div className="space-y-2 mb-4">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <div className="flex flex-wrap gap-1">
              {STATUSES.map((status) => {
                const isActive = filters.statuses.includes(status);
                const style = STATUS_STYLES[status];
                return (
                  <button
                    key={status}
                    onClick={() => toggleStatus(status)}
                    className={cn(
                      'inline-flex h-7 items-center rounded-full px-3 text-xs font-medium transition-colors',
                      isActive ? style.active : style.inactive
                    )}
                  >
                    {status}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Repository filter */}
          {repositories.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Repository</label>
              <div className="flex flex-wrap gap-1">
                {repositories.map((repo) => {
                  const repoKey = `${repo.owner}/${repo.repo}`;
                  const isActive = filters.repos.includes(repoKey);
                  const color = getRepoColor(repo.owner, repo.repo);
                  return (
                    <button
                      key={repo.id}
                      onClick={() => toggleRepo(repoKey)}
                      className={cn(
                        'inline-flex h-7 items-center rounded-full px-3 text-xs font-medium transition-colors',
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
            </div>
          )}
        </div>
      </div>
    </>
  );
}
