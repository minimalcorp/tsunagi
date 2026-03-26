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
    <div className="border border-border rounded p-3 space-y-2">
      {/* Key */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-mono text-foreground">{variable.key}</span>
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
              <span className="text-xs text-muted-foreground">Enabled</span>
            </label>
            <button
              onClick={() => setShowValue(!showValue)}
              className="size-8 rounded-md inline-flex items-center justify-center hover:bg-accent transition-colors cursor-pointer"
              title={showValue ? 'Hide value' : 'Show value'}
            >
              {showValue ? (
                <EyeOff className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Eye className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
            <button
              onClick={handleEdit}
              className="size-8 rounded-md inline-flex items-center justify-center hover:bg-accent transition-colors cursor-pointer"
              title="Edit"
            >
              <Pencil className="w-4 h-4 text-muted-foreground" />
            </button>
            {isDeletable && (
              <button
                onClick={handleDelete}
                className="size-8 rounded-md inline-flex items-center justify-center hover:bg-accent transition-colors cursor-pointer"
                title="Delete"
              >
                <Trash2 className="w-4 h-4 text-destructive" />
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
            className="w-full h-9 px-3 py-1 rounded-md border border-input bg-transparent font-mono text-sm shadow-xs text-foreground"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={handleCancelEdit}
              className="h-8 px-3 rounded-md text-sm font-medium border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground active:scale-95 transition-[color,background-color,transform] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <button
              onClick={handleSaveEdit}
              className="h-8 px-3 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 transition-[color,background-color,transform] cursor-pointer"
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
            className="w-full h-9 px-3 py-1 rounded-md border border-input bg-transparent font-mono text-sm shadow-xs text-foreground"
          />
        </div>
      )}
    </div>
  );
}
