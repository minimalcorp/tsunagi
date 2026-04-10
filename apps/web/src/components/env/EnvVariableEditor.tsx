'use client';

import { useState, useEffect } from 'react';
import { Plus, X, Check } from 'lucide-react';
import { apiUrl } from '@/lib/api-url';
import { EnvVariableItem, type EnvironmentVariable } from './EnvVariableItem';
import type { SelectedNode } from './EnvTreeNavigation';
import { LoadingSpinner } from '../LoadingSpinner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// Claude Tokens (excluded from variables section)
const CLAUDE_TOKENS = ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'];

interface EnvVariableEditorProps {
  selectedNode: SelectedNode;
}

export function EnvVariableEditor({ selectedNode }: EnvVariableEditorProps) {
  const [envVars, setEnvVars] = useState<EnvironmentVariable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [addKey, setAddKey] = useState('');
  const [addValue, setAddValue] = useState('');
  const [addError, setAddError] = useState('');

  // 環境変数をロード
  useEffect(() => {
    const loadEnvVars = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ scope: selectedNode.scope });
        if (selectedNode.owner) params.set('owner', selectedNode.owner);
        if (selectedNode.repo) params.set('repo', selectedNode.repo);

        const response = await fetch(apiUrl(`/api/env/list?${params}`));
        if (!response.ok) throw new Error('Failed to fetch environment variables');

        const data = await response.json();
        const allVars = data.data.envVars || [];

        // Exclude Claude Tokens
        const filteredVars = allVars.filter(
          (v: EnvironmentVariable) => !CLAUDE_TOKENS.includes(v.key)
        );

        setEnvVars(filteredVars);
      } catch (err) {
        console.error('Failed to load environment variables:', err);
        setError('Failed to load environment variables');
      } finally {
        setIsLoading(false);
      }
    };

    loadEnvVars();
  }, [selectedNode]);

  const handleToggle = async (key: string, enabled: boolean) => {
    // 必須変数のバリデーション（Global スコープのみ、無効化の場合のみ）
    if (selectedNode.scope === 'global' && !enabled) {
      const isClaudeToken = key === 'ANTHROPIC_API_KEY' || key === 'CLAUDE_CODE_OAUTH_TOKEN';
      if (isClaudeToken) {
        // 他の有効な Claude Token があるか確認
        const otherClaudeToken = envVars.find(
          (v) =>
            v.key !== key &&
            (v.key === 'ANTHROPIC_API_KEY' || v.key === 'CLAUDE_CODE_OAUTH_TOKEN') &&
            v.enabled
        );

        if (!otherClaudeToken) {
          alert(
            'Cannot disable the last enabled Claude Token. Please add or enable another Claude Token first.'
          );
          return;
        }
      }
    }

    try {
      const response = await fetch(apiUrl('/api/env/toggle'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          scope: selectedNode.scope,
          owner: selectedNode.owner,
          repo: selectedNode.repo,
          enabled,
        }),
      });

      if (!response.ok) throw new Error('Failed to toggle environment variable');

      // 楽観的更新
      setEnvVars((prev) => prev.map((v) => (v.key === key ? { ...v, enabled } : v)));
    } catch (err) {
      console.error('Failed to toggle environment variable:', err);
      // エラー時は元に戻す
      setEnvVars((prev) => prev.map((v) => (v.key === key ? { ...v, enabled: !enabled } : v)));
    }
  };

  const handleDelete = async (key: string) => {
    if (!confirm(`Delete ${key}?`)) {
      return;
    }

    try {
      const params = new URLSearchParams({
        key,
        scope: selectedNode.scope,
      });
      if (selectedNode.owner) params.set('owner', selectedNode.owner);
      if (selectedNode.repo) params.set('repo', selectedNode.repo);

      const response = await fetch(apiUrl(`/api/env?${params}`), {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete environment variable');

      // 楽観的更新
      setEnvVars((prev) => prev.filter((v) => v.key !== key));
    } catch (err) {
      console.error('Failed to delete environment variable:', err);
      alert('Failed to delete environment variable');
    }
  };

  const handleUpdate = async (key: string, value: string) => {
    try {
      const response = await fetch(apiUrl('/api/env'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          value,
          scope: selectedNode.scope,
          owner: selectedNode.owner,
          repo: selectedNode.repo,
        }),
      });

      if (!response.ok) throw new Error('Failed to update environment variable');

      // 楽観的更新
      setEnvVars((prev) => prev.map((v) => (v.key === key ? { ...v, value } : v)));
    } catch (err) {
      console.error('Failed to update environment variable:', err);
      throw err;
    }
  };

  const validateKey = (key: string): boolean => {
    // 英数字とアンダースコアのみ許可
    if (!/^[A-Z0-9_]+$/.test(key)) {
      setAddError('Key must contain only uppercase letters, numbers, and underscores');
      return false;
    }

    // Claude Token除外
    if (CLAUDE_TOKENS.includes(key)) {
      setAddError('Claude tokens should be added in the Tokens section');
      return false;
    }

    // 重複チェック
    if (envVars.some((v) => v.key === key)) {
      setAddError(`Key "${key}" already exists in this scope`);
      return false;
    }

    return true;
  };

  const handleAdd = async () => {
    setAddError('');

    if (!addKey.trim()) {
      setAddError('Key is required');
      return;
    }

    if (!addValue.trim()) {
      setAddError('Value is required');
      return;
    }

    if (!validateKey(addKey.trim())) {
      return;
    }

    try {
      const response = await fetch(apiUrl('/api/env'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: addKey.trim(),
          value: addValue.trim(),
          scope: selectedNode.scope,
          owner: selectedNode.owner,
          repo: selectedNode.repo,
        }),
      });

      if (!response.ok) throw new Error('Failed to add environment variable');

      // リストを再取得
      const params = new URLSearchParams({ scope: selectedNode.scope });
      if (selectedNode.owner) params.set('owner', selectedNode.owner);
      if (selectedNode.repo) params.set('repo', selectedNode.repo);

      const listResponse = await fetch(apiUrl(`/api/env/list?${params}`));
      if (listResponse.ok) {
        const data = await listResponse.json();
        const allVars = data.data.envVars || [];
        const filteredVars = allVars.filter(
          (v: EnvironmentVariable) => !CLAUDE_TOKENS.includes(v.key)
        );
        setEnvVars(filteredVars);
      }

      setIsAdding(false);
      setAddKey('');
      setAddValue('');
    } catch (err) {
      console.error('Failed to add environment variable:', err);
      setAddError('Failed to add environment variable');
    }
  };

  const handleCancelAdd = () => {
    setIsAdding(false);
    setAddKey('');
    setAddValue('');
    setAddError('');
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <LoadingSpinner size="md" message="Loading variables..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-destructive text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-foreground">Environment Variables</h2>
        {!isAdding && (
          <Button size="sm" onClick={() => setIsAdding(true)} className="active:scale-95">
            <Plus className="w-4 h-4" />
            Add Variable
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-3">
        {/* Add Variable Form */}
        {isAdding && (
          <div className="border border-border rounded p-3 bg-accent space-y-2">
            <div className="text-sm font-medium text-foreground">New Variable</div>
            <Input
              type="text"
              value={addKey}
              onChange={(e) => setAddKey(e.target.value.toUpperCase())}
              placeholder="VARIABLE_NAME"
              className="w-full font-mono"
              autoFocus
            />
            <Input
              type="password"
              value={addValue}
              onChange={(e) => setAddValue(e.target.value)}
              placeholder="value"
              className="w-full font-mono"
            />
            {addError && <div className="text-xs text-destructive">{addError}</div>}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelAdd}
                className="active:scale-95"
              >
                <X className="w-4 h-4" />
              </Button>
              <Button size="sm" onClick={handleAdd} className="active:scale-95">
                <Check className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Existing Variables */}
        {envVars.length === 0 && !isAdding ? (
          <div className="text-center text-muted-foreground text-sm py-4">
            No environment variables
          </div>
        ) : (
          envVars.map((variable) => (
            <EnvVariableItem
              key={variable.key}
              variable={variable}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onUpdate={handleUpdate}
              isDeletable={true}
            />
          ))
        )}
      </div>
    </div>
  );
}
