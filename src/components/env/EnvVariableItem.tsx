'use client';

import { useState } from 'react';
import { Eye, EyeOff, Trash2, Pencil, X, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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
            <Button
              variant="ghost"
              size="icon-lg"
              onClick={() => setShowValue(!showValue)}
              title={showValue ? 'Hide value' : 'Show value'}
            >
              {showValue ? (
                <EyeOff className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Eye className="w-4 h-4 text-muted-foreground" />
              )}
            </Button>
            <Button variant="ghost" size="icon-lg" onClick={handleEdit} title="Edit">
              <Pencil className="w-4 h-4 text-muted-foreground" />
            </Button>
            {isDeletable && (
              <Button variant="ghost" size="icon-lg" onClick={handleDelete} title="Delete">
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Value */}
      {isEditing ? (
        <div className="space-y-2">
          <Input
            type="password"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="w-full font-mono"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancelEdit}
              className="active:scale-95"
            >
              <X className="w-4 h-4" />
            </Button>
            <Button size="sm" onClick={handleSaveEdit} className="active:scale-95">
              <Check className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Input
            type={showValue ? 'text' : 'password'}
            value={variable.value}
            readOnly
            className="w-full font-mono"
          />
        </div>
      )}
    </div>
  );
}
