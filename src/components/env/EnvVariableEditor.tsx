'use client';

import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { EnvVariableItem, type EnvironmentVariable } from './EnvVariableItem';
import type { SelectedNode } from './EnvTreeNavigation';
import { LoadingSpinner } from '../LoadingSpinner';

interface EnvVariableEditorProps {
  selectedNode: SelectedNode;
  onAddClick: () => void;
  refreshTrigger?: number;
}

export function EnvVariableEditor({
  selectedNode,
  onAddClick,
  refreshTrigger,
}: EnvVariableEditorProps) {
  const [envVars, setEnvVars] = useState<EnvironmentVariable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 環境変数をロード
  useEffect(() => {
    const loadEnvVars = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ scope: selectedNode.scope });
        if (selectedNode.owner) params.set('owner', selectedNode.owner);
        if (selectedNode.repo) params.set('repo', selectedNode.repo);

        const response = await fetch(`/api/env/list?${params}`);
        if (!response.ok) throw new Error('Failed to fetch environment variables');

        const data = await response.json();
        setEnvVars(data.data.envVars || []);
      } catch (err) {
        console.error('Failed to load environment variables:', err);
        setError('Failed to load environment variables');
      } finally {
        setIsLoading(false);
      }
    };

    loadEnvVars();
  }, [selectedNode, refreshTrigger]);

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
      const response = await fetch('/api/env/toggle', {
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
    // 必須変数のバリデーション（Global スコープのみ）
    if (selectedNode.scope === 'global') {
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
            'Cannot delete the last enabled Claude Token. Please add another Claude Token first.'
          );
          return;
        }
      }
    }

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

      const response = await fetch(`/api/env?${params}`, {
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
        <div className="text-red-500 text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-theme-fg">
          {selectedNode.label} Environment Variables
        </h2>
        <button
          onClick={onAddClick}
          className="px-3 py-1.5 bg-primary text-white rounded hover:brightness-110 active:scale-95 transition-transform cursor-pointer flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          Add Variable
        </button>
      </div>

      {envVars.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-theme-muted">
          <p className="mb-4">No environment variables</p>
          <button
            onClick={onAddClick}
            className="px-4 py-2 bg-primary text-white rounded hover:brightness-110 cursor-pointer"
          >
            Add First Variable
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-3">
          {envVars.map((variable) => (
            <EnvVariableItem
              key={variable.key}
              variable={variable}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
