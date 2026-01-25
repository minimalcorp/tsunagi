'use client';

import { useState } from 'react';
import { Eye, EyeOff, Trash2 } from 'lucide-react';

export interface EnvironmentVariable {
  key: string;
  value: string;
  scope: 'global' | 'owner' | 'repo';
  owner?: string;
  repo?: string;
  enabled: boolean;
}

interface EnvVariableItemProps {
  variable: EnvironmentVariable;
  onToggle: (key: string, enabled: boolean) => Promise<void>;
  onDelete: (key: string) => Promise<void>;
}

export function EnvVariableItem({ variable, onToggle, onDelete }: EnvVariableItemProps) {
  const [showValue, setShowValue] = useState(false);
  const [isTogglingEnabled, setIsTogglingEnabled] = useState(false);

  const handleToggleEnabled = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsTogglingEnabled(true);
    try {
      await onToggle(variable.key, e.target.checked);
    } finally {
      setIsTogglingEnabled(false);
    }
  };

  const handleDelete = async () => {
    await onDelete(variable.key);
  };

  return (
    <div className="border border-theme rounded p-3 space-y-2">
      {/* Key */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-mono text-theme-fg">{variable.key}</span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={variable.enabled}
              onChange={handleToggleEnabled}
              disabled={isTogglingEnabled}
              className="w-4 h-4 cursor-pointer"
            />
            <span className="text-xs text-theme-muted">Enabled</span>
          </label>
          <button
            onClick={() => setShowValue(!showValue)}
            className="p-1 hover:bg-theme-hover rounded cursor-pointer"
            title={showValue ? 'Hide value' : 'Show value'}
          >
            {showValue ? (
              <EyeOff className="w-4 h-4 text-theme-muted" />
            ) : (
              <Eye className="w-4 h-4 text-theme-muted" />
            )}
          </button>
          <button
            onClick={handleDelete}
            className="p-1 hover:bg-theme-hover rounded cursor-pointer"
            title="Delete"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        </div>
      </div>

      {/* Value */}
      <div>
        <input
          type={showValue ? 'text' : 'password'}
          value={variable.value}
          readOnly
          className="w-full px-3 py-2 border border-theme rounded font-mono text-sm text-theme-fg bg-theme-card"
        />
      </div>
    </div>
  );
}
