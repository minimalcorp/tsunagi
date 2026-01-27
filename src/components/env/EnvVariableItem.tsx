'use client';

import { useState } from 'react';
import { Eye, EyeOff, Trash2, Pencil, X, Check } from 'lucide-react';

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
  onUpdate: (key: string, value: string) => Promise<void>;
  isDeletable?: boolean;
}

export function EnvVariableItem({
  variable,
  onToggle,
  onDelete,
  onUpdate,
  isDeletable = true,
}: EnvVariableItemProps) {
  const [showValue, setShowValue] = useState(false);
  const [isTogglingEnabled, setIsTogglingEnabled] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(variable.value);

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

  const handleEdit = () => {
    setIsEditing(true);
    setEditValue(variable.value);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditValue(variable.value);
  };

  const handleSaveEdit = async () => {
    try {
      await onUpdate(variable.key, editValue);
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to update variable:', err);
      alert('Failed to update variable');
    }
  };

  return (
    <div className="border border-theme rounded p-3 space-y-2">
      {/* Key */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-mono text-theme-fg">{variable.key}</span>
        {!isEditing && (
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
              onClick={handleEdit}
              className="p-1 hover:bg-theme-hover rounded cursor-pointer"
              title="Edit"
            >
              <Pencil className="w-4 h-4 text-theme-muted" />
            </button>
            {isDeletable && (
              <button
                onClick={handleDelete}
                className="p-1 hover:bg-theme-hover rounded cursor-pointer"
                title="Delete"
              >
                <Trash2 className="w-4 h-4 text-red-500" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Value */}
      {isEditing ? (
        <div className="space-y-2">
          <input
            type="password"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="w-full px-3 py-2 border border-theme rounded font-mono text-sm text-theme-fg bg-theme-card"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={handleCancelEdit}
              className="px-3 py-1.5 border border-theme rounded text-theme-fg hover:bg-theme-hover active:scale-95 transition-transform cursor-pointer text-sm"
            >
              <X className="w-4 h-4" />
            </button>
            <button
              onClick={handleSaveEdit}
              className="px-3 py-1.5 bg-primary text-white rounded active:scale-95 transition-transform cursor-pointer text-sm"
            >
              <Check className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div>
          <input
            type={showValue ? 'text' : 'password'}
            value={variable.value}
            readOnly
            className="w-full px-3 py-2 border border-theme rounded font-mono text-sm text-theme-fg bg-theme-card"
          />
        </div>
      )}
    </div>
  );
}
