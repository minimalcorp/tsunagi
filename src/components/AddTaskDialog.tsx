'use client';

import { useState, useEffect, useMemo, type FormEvent } from 'react';
import type { Repository } from '@/lib/types';
import { LoadingSpinner } from './LoadingSpinner';

interface AddTaskDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (data: {
    title: string;
    description: string;
    owner: string;
    repo: string;
    branch: string;
    baseBranch: string;
  }) => Promise<void>;
  repositories: Repository[];
}

export function AddTaskDialog({ isOpen, onClose, onAdd, repositories }: AddTaskDialogProps) {
  const [combinedRepo, setCombinedRepo] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    owner: '',
    repo: '',
    branch: '',
    baseBranch: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [defaultBranch, setDefaultBranch] = useState('');
  const [isFetchingBranches, setIsFetchingBranches] = useState(false);
  const [branchError, setBranchError] = useState('');

  const repoOptions = useMemo(() => {
    return repositories.map((repo) => ({
      value: `${repo.owner}/${repo.repo}`,
      label: `${repo.owner}/${repo.repo}`,
    }));
  }, [repositories]);

  const handleRepositoryChange = (value: string) => {
    setCombinedRepo(value);

    if (value) {
      const [owner, repo] = value.split('/');
      setFormData((prev) => ({
        ...prev,
        owner,
        repo,
        baseBranch: '',
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        owner: '',
        repo: '',
        baseBranch: '',
      }));
    }
  };

  useEffect(() => {
    if (!combinedRepo) {
      setBranches([]);
      setDefaultBranch('');
      setFormData((prev) => ({ ...prev, baseBranch: '' }));
      return;
    }

    const fetchBranches = async () => {
      setIsFetchingBranches(true);
      setBranchError('');
      try {
        const [owner, repo] = combinedRepo.split('/');
        const response = await fetch(`/api/repos/${owner}/${repo}/branches`);
        if (!response.ok) throw new Error('Failed to fetch branches');

        const data = await response.json();
        setBranches(data.data.branches);
        setDefaultBranch(data.data.defaultBranch);
        setFormData((prev) => ({ ...prev, baseBranch: data.data.defaultBranch }));
      } catch (error) {
        console.error('Failed to fetch branches:', error);
        setBranchError('Failed to load branches. Repository may not be initialized.');
        setBranches([]);
        setDefaultBranch('');
      } finally {
        setIsFetchingBranches(false);
      }
    };

    fetchBranches();
  }, [combinedRepo]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await onAdd(formData);
      onClose();
      // Reset form
      setCombinedRepo('');
      setFormData({
        title: '',
        description: '',
        owner: '',
        repo: '',
        branch: '',
        baseBranch: '',
      });
    } catch (error) {
      console.error('Failed to create task:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-theme-card rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto relative">
        {isLoading && (
          <div className="absolute inset-0 bg-theme-card bg-opacity-90 rounded-lg flex items-center justify-center z-10">
            <LoadingSpinner size="lg" message="Creating task..." />
          </div>
        )}

        <h2 className="text-xl font-bold mb-4 text-theme-fg">Add New Task</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-theme-fg">Repository *</label>
            <select
              required
              value={combinedRepo}
              onChange={(e) => handleRepositoryChange(e.target.value)}
              className="w-full pl-3 pr-10 py-2 border border-theme rounded text-theme-fg bg-theme-card"
              disabled={isLoading}
            >
              <option value="">Select repository</option>
              {repoOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-theme-fg">Title *</label>
            <input
              type="text"
              required
              maxLength={200}
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border border-theme rounded text-theme-fg bg-theme-card"
              disabled={isLoading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-theme-fg">Description</label>
            <textarea
              maxLength={5000}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-theme rounded h-24 text-theme-fg bg-theme-card"
              disabled={isLoading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-theme-fg">Base Branch *</label>
            {isFetchingBranches ? (
              <div className="w-full px-3 py-2 border border-theme rounded text-theme-muted bg-theme-card flex items-center gap-2">
                <LoadingSpinner size="sm" />
                <span className="text-xs">Loading branches...</span>
              </div>
            ) : branches.length > 0 ? (
              <select
                required
                value={formData.baseBranch}
                onChange={(e) => setFormData({ ...formData, baseBranch: e.target.value })}
                className="w-full pl-3 pr-10 py-2 border border-theme rounded text-theme-fg bg-theme-card"
                disabled={isLoading}
              >
                {branches.map((branch) => (
                  <option key={branch} value={branch}>
                    {branch}
                    {branch === defaultBranch ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-sm text-theme-muted">
                {branchError || 'Select repository first'}
              </div>
            )}
            <p className="text-xs text-theme-muted mt-1">
              Your new branch will be created from this branch
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-theme-fg">
              New Branch Name *
            </label>
            <input
              type="text"
              required
              maxLength={255}
              value={formData.branch}
              onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
              className="w-full px-3 py-2 border border-theme rounded text-theme-fg bg-theme-card"
              placeholder="feature/new-feature"
              disabled={isLoading}
            />
            <p className="text-xs text-theme-muted mt-1">
              Will be created from {formData.baseBranch || 'base branch'}
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-theme rounded text-theme-fg active:scale-95 transition-transform cursor-pointer"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-primary text-white rounded active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              disabled={isLoading || isFetchingBranches}
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
