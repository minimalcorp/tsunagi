'use client';

import { useState, type FormEvent } from 'react';
import { LoadingSpinner } from './LoadingSpinner';

interface CloneRepositoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onClone: (data: { gitUrl: string; authToken?: string }) => Promise<void>;
}

export function CloneRepositoryDialog({ isOpen, onClose, onClone }: CloneRepositoryDialogProps) {
  const [gitUrl, setGitUrl] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await onClone({ gitUrl, authToken: authToken || undefined });
      onClose();
      // Reset form
      setGitUrl('');
      setAuthToken('');
    } catch (error) {
      console.error('Failed to clone repository:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-theme-card rounded-lg p-6 w-full max-w-md relative">
        {isLoading && (
          <div className="absolute inset-0 bg-theme-card bg-opacity-90 rounded-lg flex items-center justify-center z-10">
            <LoadingSpinner size="lg" message="Cloning repository..." />
          </div>
        )}

        <h2 className="text-xl font-bold mb-4 text-theme-fg">Clone Repository</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-theme-fg">Git URL *</label>
            <input
              type="text"
              required
              placeholder="https://github.com/owner/repo.git"
              value={gitUrl}
              onChange={(e) => setGitUrl(e.target.value)}
              className="w-full px-3 py-2 border border-theme rounded text-theme-fg bg-theme-card"
              disabled={isLoading}
            />
            <p className="text-xs text-theme-muted mt-1">
              HTTPS or SSH形式のGit URLを入力してください
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-theme-fg">
              Auth Token (Optional)
            </label>
            <input
              type="password"
              placeholder="ghp_xxx or oauth token"
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              className="w-full px-3 py-2 border border-theme rounded text-theme-fg bg-theme-card"
              disabled={isLoading}
            />
            <p className="text-xs text-theme-muted mt-1">プライベートリポジトリの場合に必要です</p>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-theme rounded text-theme-fg active:scale-95 transition-transform"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-primary text-white rounded active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading}
            >
              Clone
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
