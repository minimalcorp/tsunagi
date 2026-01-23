'use client';

import { useState, useRef, useEffect } from 'react';
import { Settings, ArrowUp, Filter } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

interface HeaderProps {
  onCloneClick: () => void;
  onAddTaskClick: () => void;
  onSettingsClick: () => void;
  onReload: () => void;
  nextStep?: 'clone' | 'env' | 'task' | 'complete';
  owners: string[];
  repos: string[];
  onFilterChange: (filters: { owner: string; repo: string; search: string }) => void;
  isCloneDialogOpen?: boolean;
  isAddTaskDialogOpen?: boolean;
  isSettingsDialogOpen?: boolean;
}

export function Header({
  onCloneClick,
  onAddTaskClick,
  onSettingsClick,
  onReload,
  nextStep = 'complete',
  owners,
  repos,
  onFilterChange,
  isCloneDialogOpen = false,
  isAddTaskDialogOpen = false,
  isSettingsDialogOpen = false,
}: HeaderProps) {
  const [repoFilter, setRepoFilter] = useState<string>(''); // "owner/repo" format
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Click outside to close filter dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false);
      }
    };

    if (isFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isFilterOpen]);

  // Create combined owner/repo list
  const repoOptions = owners.flatMap((owner) =>
    repos.map((repo) => ({ value: `${owner}/${repo}`, label: `${owner}/${repo}` }))
  );

  const handleRepoChange = (value: string) => {
    setRepoFilter(value);
    if (value) {
      const [owner, repo] = value.split('/');
      onFilterChange({ owner, repo, search: searchQuery });
    } else {
      onFilterChange({ owner: '', repo: '', search: searchQuery });
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    const [owner = '', repo = ''] = repoFilter ? repoFilter.split('/') : ['', ''];
    onFilterChange({ owner, repo, search: value });
  };

  // ボタンハイライト用のスタイル関数
  const getButtonStyle = (step: string) => {
    const isHighlighted = nextStep === step;
    const baseStyle = 'px-4 py-2 rounded transition-transform active:scale-95';

    if (isHighlighted) {
      return `${baseStyle} bg-primary text-white shadow-lg ring-2 ring-primary`;
    }

    if (step === 'task') {
      return `${baseStyle} bg-primary text-white hover:bg-primary-hover`;
    }

    return `${baseStyle} bg-theme-hover hover:opacity-80 text-theme-fg`;
  };

  return (
    <header className="h-16 border-b border-theme flex items-center gap-6 px-6 bg-theme-card">
      {/* Logo */}
      <h1 className="text-2xl font-bold text-theme-fg flex-shrink-0">Tsunagi</h1>

      {/* Filters - Desktop (>= 1280px) */}
      <div className="hidden xl:flex gap-4 flex-1 justify-center">
        <select
          value={repoFilter}
          onChange={(e) => handleRepoChange(e.target.value)}
          className="px-3 py-1.5 border border-theme rounded text-theme-fg bg-theme-card min-w-48"
        >
          <option value="">All Repositories</option>
          {repoOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Search tasks..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="px-3 py-1.5 border border-theme rounded w-64 text-theme-fg bg-theme-card"
        />
      </div>

      {/* Spacer for mobile */}
      <div className="flex-1 xl:hidden" />

      {/* Theme Toggle */}
      <ThemeToggle />

      {/* Actions */}
      <div className="flex gap-2 flex-shrink-0">
        {/* Filters - Mobile/Tablet (< 1280px) */}
        <div className="xl:hidden relative" ref={filterRef}>
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className="px-4 py-2 bg-theme-hover rounded hover:opacity-80 text-theme-fg active:scale-95 transition-transform"
            title="Filters"
          >
            <Filter className="w-5 h-5" />
          </button>

          {isFilterOpen && (
            <div className="absolute top-full right-0 mt-2 bg-theme-card border border-theme rounded-lg shadow-lg p-4 w-80 z-50">
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1 text-theme-fg">Repository</label>
                  <select
                    value={repoFilter}
                    onChange={(e) => handleRepoChange(e.target.value)}
                    className="w-full px-3 py-1.5 border border-theme rounded text-theme-fg bg-theme-card"
                  >
                    <option value="">All Repositories</option>
                    {repoOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-theme-fg">Search</label>
                  <input
                    type="text"
                    placeholder="Search tasks..."
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="w-full px-3 py-1.5 border border-theme rounded text-theme-fg bg-theme-card"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="relative">
          <button
            onClick={onCloneClick}
            className={getButtonStyle('clone')}
            title="Clone Repository"
          >
            Clone Repository
          </button>
          {nextStep === 'clone' && !isCloneDialogOpen && (
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-theme-card border-2 border-primary text-theme-fg px-4 py-2 rounded text-base whitespace-nowrap animate-subtle-bounce z-[60] shadow-lg flex items-center gap-2">
              <ArrowUp className="w-5 h-5" />
              Click here first
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-theme-card border-l-2 border-t-2 border-primary rotate-45" />
            </div>
          )}
        </div>

        <button
          onClick={onReload}
          className="px-4 py-2 bg-theme-hover rounded hover:opacity-80 text-theme-fg active:scale-95 transition-transform"
        >
          Reload
        </button>

        <div className="relative">
          <button onClick={onAddTaskClick} className={getButtonStyle('task')}>
            + Add Task
          </button>
          {nextStep === 'task' && !isAddTaskDialogOpen && (
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-theme-card border-2 border-primary text-theme-fg px-4 py-2 rounded text-base whitespace-nowrap animate-subtle-bounce z-[60] shadow-lg flex items-center gap-2">
              <ArrowUp className="w-5 h-5" />
              Click here
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-theme-card border-l-2 border-t-2 border-primary rotate-45" />
            </div>
          )}
        </div>

        <div className="relative">
          <button
            onClick={onSettingsClick}
            className={getButtonStyle('env')}
            title="Environment Settings"
          >
            <Settings className="w-5 h-5 inline-block mr-2" />
            Settings
          </button>
          {nextStep === 'env' && !isSettingsDialogOpen && (
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-theme-card border-2 border-primary text-theme-fg px-4 py-2 rounded text-base whitespace-nowrap animate-subtle-bounce z-[60] shadow-lg flex items-center gap-2">
              <ArrowUp className="w-5 h-5" />
              Click here
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-theme-card border-l-2 border-t-2 border-primary rotate-45" />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
