'use client';

import { useState, useRef, useEffect } from 'react';
import { Settings, Filter, RefreshCw, FolderDown } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { Combobox } from './ui/Combobox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'tsunagi-repository-filter';

interface FilterState {
  repositories: string[];
  search: string;
}

// sessionStorageから読み込み
const loadFilterState = (): FilterState | null => {
  if (typeof window === 'undefined') return null;
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
};

// sessionStorageに保存
const saveFilterState = (state: FilterState) => {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // エラーは無視（localStorageが使用できない環境対応）
  }
};

interface HeaderProps {
  onCloneClick: () => void;
  onSettingsClick: () => void;
  onReload: () => void;
  nextStep?: 'clone' | 'env' | 'task' | 'complete';
  repositories: Array<{ owner: string; repo: string }>;
  onFilterChange: (filters: {
    owner: string;
    repo: string;
    search: string;
    selectedRepos?: string[];
  }) => void;
  isCloneDialogOpen?: boolean;
}

export function Header({
  onCloneClick,
  onSettingsClick,
  onReload,
  nextStep = 'complete',
  repositories,
  onFilterChange,
  isCloneDialogOpen = false,
}: HeaderProps) {
  const [repoFilter, setRepoFilter] = useState<string[]>(() => {
    const saved = loadFilterState();
    return saved?.repositories || ['all'];
  }); // Array of "owner/repo" format or ['all']
  const [searchQuery, setSearchQuery] = useState<string>(() => {
    const saved = loadFilterState();
    return saved?.search || '';
  });
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

  // 初回マウント時にlocalStorageから読み込んだフィルター状態を適用
  useEffect(() => {
    const saved = loadFilterState();
    if (saved) {
      // フィルター変更を親コンポーネントに通知
      if (saved.repositories.includes('all')) {
        onFilterChange({ owner: '', repo: '', search: saved.search, selectedRepos: ['all'] });
      } else {
        const repoList = saved.repositories
          .map((v) => v.split('/'))
          .filter((parts) => parts.length === 2);
        if (repoList.length > 0) {
          const [owner, repo] = repoList[0];
          onFilterChange({ owner, repo, search: saved.search, selectedRepos: saved.repositories });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Create combined owner/repo list with grouping
  const repoOptions = repositories.map((repository) => ({
    value: `${repository.owner}/${repository.repo}`,
    label: repository.repo,
    group: repository.owner,
  }));

  const handleRepoChange = (value: string | string[]) => {
    let values = Array.isArray(value) ? value : [value];
    const prevValues = repoFilter;

    // State transition logic
    const prevHasAll = prevValues.includes('all');
    const newHasAll = values.includes('all');

    if (prevHasAll && !newHasAll) {
      // Case: 'all' was selected, now other options are selected
      // Remove 'all' from selection (already done by Ark UI)
      // Keep the newly selected non-'all' items
    } else if (!prevHasAll && newHasAll) {
      // Case: non-'all' items were selected, now 'all' is selected
      // Keep only 'all'
      values = ['all'];
    } else if (prevHasAll && newHasAll && values.length > 1) {
      // Case: 'all' was selected, user clicked another option
      // This means user wants to switch from 'all' to specific items
      // Remove 'all', keep only the newly selected items
      values = values.filter((v) => v !== 'all');
    } else if (!prevHasAll && !newHasAll && values.length === 0) {
      // Case: no selection remains after deselecting
      // Auto-select 'all'
      values = ['all'];
    }

    setRepoFilter(values);

    // localStorageに保存
    saveFilterState({ repositories: values, search: searchQuery });

    // If 'all' is selected, show all repositories
    if (values.includes('all')) {
      onFilterChange({ owner: '', repo: '', search: searchQuery, selectedRepos: ['all'] });
    } else {
      // For multiple selections, pass selected repos
      const repoList = values.map((v) => v.split('/')).filter((parts) => parts.length === 2);
      if (repoList.length > 0) {
        const [owner, repo] = repoList[0];
        onFilterChange({ owner, repo, search: searchQuery, selectedRepos: values });
      }
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);

    // localStorageに保存
    saveFilterState({ repositories: repoFilter, search: value });

    if (repoFilter.includes('all') || repoFilter.length === 0) {
      onFilterChange({ owner: '', repo: '', search: value });
    } else {
      const repoList = repoFilter.map((v) => v.split('/')).filter((parts) => parts.length === 2);
      if (repoList.length > 0) {
        const [owner, repo] = repoList[0];
        onFilterChange({ owner, repo, search: value, selectedRepos: repoFilter });
      }
    }
  };

  // ボタンハイライト用のスタイル関数
  const handleClearRepoFilter = () => {
    setRepoFilter(['all']);
    // localStorageに保存
    saveFilterState({ repositories: ['all'], search: searchQuery });
    onFilterChange({ owner: '', repo: '', search: searchQuery, selectedRepos: ['all'] });
  };

  const getButtonHighlightClass = (step: string) => {
    const isHighlighted = nextStep === step;
    if (isHighlighted) {
      return 'bg-primary text-white shadow-lg ring-2 ring-primary hover:bg-primary/80';
    }
    return 'bg-accent text-foreground';
  };

  return (
    <header className="h-14 border-b border-border flex items-center gap-3 px-4 bg-card">
      {/* Logo */}
      <h1 className="text-2xl font-bold text-foreground flex-shrink-0">繋</h1>

      {/* Filters - Desktop (>= 1024px) */}
      <div className="hidden lg:flex gap-4 flex-1 justify-center">
        <Combobox
          options={[{ value: 'all', label: 'All Repositories' }, ...repoOptions]}
          value={repoFilter}
          onChange={handleRepoChange}
          placeholder="All Repositories"
          className="min-w-48"
          multiple={true}
          onClear={handleClearRepoFilter}
          showClearButton={!repoFilter.includes('all')}
        />

        <Input
          type="text"
          placeholder="Search tasks..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-64"
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
          <Button
            variant="ghost"
            size="icon-lg"
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className="size-9 bg-accent text-foreground active:scale-95"
            title="Filters"
          >
            <Filter className="w-5 h-5" />
          </Button>

          {isFilterOpen && (
            <div className="absolute top-full right-0 mt-2 bg-card border border-border rounded-lg shadow-lg p-4 w-80 z-50">
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1 text-foreground">
                    Repository
                  </label>
                  <Combobox
                    options={[{ value: '', label: 'All Repositories' }, ...repoOptions]}
                    value={repoFilter}
                    onChange={handleRepoChange}
                    placeholder="All Repositories"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-foreground">Search</label>
                  <Input
                    type="text"
                    placeholder="Search tasks..."
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="relative">
          <Button
            variant="ghost"
            size="icon-lg"
            onClick={onCloneClick}
            className={`size-9 active:scale-95 ${getButtonHighlightClass('clone')}`}
            title="Clone Repository"
          >
            <FolderDown className="w-5 h-5" />
          </Button>
          {nextStep === 'clone' && !isCloneDialogOpen && (
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-tooltip backdrop-blur-sm border-2 border-warning text-foreground px-4 py-2 rounded text-base whitespace-nowrap animate-subtle-bounce z-[60] shadow-lg">
              Clone a repository
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-tooltip backdrop-blur-sm border-l-2 border-t-2 border-warning rotate-45" />
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon-lg"
          onClick={onReload}
          className="size-9 bg-accent text-foreground active:scale-95"
          title="Reload"
        >
          <RefreshCw className="w-5 h-5" />
        </Button>

        <div className="relative">
          <Button
            variant="ghost"
            size="icon-lg"
            onClick={onSettingsClick}
            className={`size-9 active:scale-95 ${getButtonHighlightClass('env')}`}
            title="Environment Settings"
          >
            <Settings className="w-5 h-5" />
          </Button>
          {nextStep === 'env' && (
            <div className="absolute top-full mt-2 right-[-2px] bg-tooltip backdrop-blur-sm border-2 border-warning text-foreground px-4 py-2 rounded text-base whitespace-nowrap animate-subtle-bounce z-[60] shadow-lg">
              Set up tokens
              <div className="absolute -top-1 right-[21px] w-2 h-2 bg-tooltip backdrop-blur-sm border-l-2 border-t-2 border-warning rotate-45" />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
