'use client';

import { useState, useRef, useEffect } from 'react';
import { Settings, Filter, RefreshCw, FolderDown } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

interface HeaderProps {
  onCloneClick: () => void;
  onSettingsClick: () => void;
  onReload: () => void;
  nextStep?: 'clone' | 'env' | 'task' | 'complete';
  owners: string[];
  repos: string[];
  onFilterChange: (filters: { owner: string; repo: string; search: string }) => void;
  isCloneDialogOpen?: boolean;
}

export function Header({
  onCloneClick,
  onSettingsClick,
  onReload,
  nextStep = 'complete',
  owners,
  repos,
  onFilterChange,
  isCloneDialogOpen = false,
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
    const baseStyle =
      'px-4 h-10 rounded transition-transform active:scale-95 cursor-pointer flex items-center justify-center';

    if (isHighlighted) {
      return `${baseStyle} bg-primary text-white shadow-lg ring-2 ring-primary`;
    }

    return `${baseStyle} bg-theme-hover text-theme-fg`;
  };

  return (
    <header className="h-16 border-b border-theme flex items-center gap-6 px-6 bg-theme-card">
      {/* Logo */}
      <h1 className="text-2xl font-bold text-theme-fg flex-shrink-0">繋</h1>

      {/* Filters - Desktop (>= 1024px) */}
      <div className="hidden lg:flex gap-4 flex-1 justify-center">
        <select
          value={repoFilter}
          onChange={(e) => handleRepoChange(e.target.value)}
          className="pl-3 pr-10 py-1.5 border border-theme rounded text-theme-fg bg-theme-card min-w-48"
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
      <div className="flex-1 lg:hidden" />

      {/* Theme Toggle */}
      <ThemeToggle />

      {/* Actions */}
      <div className="flex gap-2 flex-shrink-0">
        {/* Filters - Mobile/Tablet (< 1024px) */}
        <div className="lg:hidden relative" ref={filterRef}>
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className="px-4 h-10 bg-theme-hover rounded text-theme-fg active:scale-95 cursor-pointer flex items-center justify-center"
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
                    className="w-full pl-3 pr-10 py-1.5 border border-theme rounded text-theme-fg bg-theme-card"
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
            className={`px-4 h-10 rounded active:scale-95 cursor-pointer flex items-center justify-center ${
              nextStep === 'clone'
                ? 'bg-primary text-white shadow-lg ring-2 ring-primary'
                : 'bg-theme-hover text-theme-fg'
            }`}
            title="Clone Repository"
          >
            <FolderDown className="w-5 h-5" />
          </button>
          {nextStep === 'clone' && !isCloneDialogOpen && (
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-tooltip backdrop-blur-sm border-2 border-amber-500 text-theme-fg px-4 py-2 rounded text-base whitespace-nowrap animate-subtle-bounce z-[60] shadow-lg">
              Clone a repository
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-tooltip backdrop-blur-sm border-l-2 border-t-2 border-amber-500 rotate-45" />
            </div>
          )}
        </div>

        <button
          onClick={onReload}
          className="px-4 h-10 bg-theme-hover rounded text-theme-fg active:scale-95 cursor-pointer flex items-center justify-center"
          title="Reload"
        >
          <RefreshCw className="w-5 h-5" />
        </button>

        <div className="relative">
          <button
            onClick={onSettingsClick}
            className={getButtonStyle('env')}
            title="Environment Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
          {nextStep === 'env' && (
            <div className="absolute top-full mt-2 right-[-2px] bg-tooltip backdrop-blur-sm border-2 border-amber-500 text-theme-fg px-4 py-2 rounded text-base whitespace-nowrap animate-subtle-bounce z-[60] shadow-lg">
              Set up tokens
              <div className="absolute -top-1 right-[21px] w-2 h-2 bg-tooltip backdrop-blur-sm border-l-2 border-t-2 border-amber-500 rotate-45" />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
