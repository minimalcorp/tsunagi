'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { SelectedNode } from './EnvTreeNavigation';

interface EnvAddDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedNode: SelectedNode;
  existingKeys: string[];
  onAdd: (key: string, value: string) => Promise<void>;
}

export function EnvAddDialog({
  isOpen,
  onClose,
  selectedNode,
  existingKeys,
  onAdd,
}: EnvAddDialogProps) {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ダイアログが開いたときにフィールドをクリア
  useEffect(() => {
    if (isOpen) {
      setKey('');
      setValue('');
      setError('');
    }
  }, [isOpen]);

  const validateKey = (key: string): boolean => {
    // 英数字とアンダースコアのみ許可
    if (!/^[A-Z0-9_]+$/.test(key)) {
      setError('Key must contain only uppercase letters, numbers, and underscores');
      return false;
    }

    // 重複チェック
    if (existingKeys.includes(key)) {
      setError(`Key "${key}" already exists in this scope`);
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // バリデーション
    if (!key.trim()) {
      setError('Key is required');
      return;
    }

    if (!value.trim()) {
      setError('Value is required');
      return;
    }

    if (!validateKey(key.trim())) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onAdd(key.trim(), value.trim());
      onClose();
    } catch (err) {
      console.error('Failed to add variable:', err);
      setError('Failed to add environment variable');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-theme-card rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-theme-fg">Add Environment Variable</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-theme-hover rounded cursor-pointer"
            disabled={isSubmitting}
          >
            <X className="w-5 h-5 text-theme-muted" />
          </button>
        </div>

        <div className="mb-4 text-sm text-theme-muted">
          Scope: <span className="font-semibold text-theme-fg">{selectedNode.label}</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-theme-fg mb-1">Key *</label>
            <input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value.toUpperCase())}
              placeholder="VARIABLE_NAME"
              className="w-full px-3 py-2 border border-theme rounded font-mono text-sm text-theme-fg bg-theme-card"
              disabled={isSubmitting}
              autoFocus
            />
            <p className="text-xs text-theme-muted mt-1">
              Uppercase letters, numbers, and underscores only
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-theme-fg mb-1">Value *</label>
            <input
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter value..."
              className="w-full px-3 py-2 border border-theme rounded font-mono text-sm text-theme-fg bg-theme-card"
              disabled={isSubmitting}
            />
          </div>

          {error && <div className="text-red-500 text-sm">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-theme rounded text-theme-fg hover:bg-theme-hover active:scale-95 transition-transform cursor-pointer"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-primary text-white rounded hover:brightness-110 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Adding...' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
