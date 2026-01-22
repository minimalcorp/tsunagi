'use client';

import { useState, type FormEvent } from 'react';
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
    prompt: string;
  }) => Promise<void>;
  owners: string[];
  repos: string[];
}

export function AddTaskDialog({ isOpen, onClose, onAdd, owners, repos }: AddTaskDialogProps) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    owner: '',
    repo: '',
    branch: '',
    prompt: '',
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await onAdd(formData);
      onClose();
      // Reset form
      setFormData({
        title: '',
        description: '',
        owner: '',
        repo: '',
        branch: '',
        prompt: '',
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
      <div className="bg-theme-card rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto relative">
        {isLoading && (
          <div className="absolute inset-0 bg-theme-card bg-opacity-90 rounded-lg flex items-center justify-center z-10">
            <LoadingSpinner size="lg" message="Creating task..." />
          </div>
        )}

        <h2 className="text-xl font-bold mb-4 text-theme-fg">Add New Task</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
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
            <label className="block text-sm font-medium mb-1 text-theme-fg">Owner *</label>
            <select
              required
              value={formData.owner}
              onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
              className="w-full px-3 py-2 border border-theme rounded text-theme-fg bg-theme-card"
              disabled={isLoading}
            >
              <option value="">Select owner</option>
              {owners.map((owner) => (
                <option key={owner} value={owner}>
                  {owner}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-theme-fg">Repository *</label>
            <select
              required
              value={formData.repo}
              onChange={(e) => setFormData({ ...formData, repo: e.target.value })}
              className="w-full px-3 py-2 border border-theme rounded text-theme-fg bg-theme-card"
              disabled={isLoading}
            >
              <option value="">Select repository</option>
              {repos.map((repo) => (
                <option key={repo} value={repo}>
                  {repo}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-theme-fg">Branch *</label>
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
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-theme-fg">Prompt</label>
            <textarea
              value={formData.prompt}
              onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
              className="w-full px-3 py-2 border border-theme rounded h-24 text-theme-fg bg-theme-card"
              placeholder="Initial instructions for Claude..."
              disabled={isLoading}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-theme rounded text-theme-fg active:scale-95 transition-all"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500 text-white rounded active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading}
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
