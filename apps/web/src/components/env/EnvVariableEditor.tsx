'use client';

import { useState, useEffect, type ClipboardEvent } from 'react';
import { Plus, X, Check, ClipboardPaste } from 'lucide-react';
import { apiUrl } from '@/lib/api-url';
import { parseEnvText, isEnvText, type EnvEntry } from '@/lib/env-paste';
import { toaster } from '@/lib/toaster';
import { EnvVariableItem, type EnvironmentVariable } from './EnvVariableItem';
import type { SelectedNode } from './EnvTreeNavigation';
import { LoadingSpinner } from '../LoadingSpinner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/Dialog';

// エージェントの認証は Profile で扱うため、汎用の環境変数としては登録させない（サーバーでも拒否する）
const RESERVED_KEYS = [
  'ANTHROPIC_API_KEY',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CONFIG_DIR',
  'TSUNAGI_CLAUDE_PROFILE',
  'CODEX_API_KEY',
  'CODEX_ACCESS_TOKEN',
  'CODEX_HOME',
  'TSUNAGI_CODEX_PROFILE',
];

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
  // ペーストで取り込む変数のうち既存キーを上書きするものがある場合、確認待ちの内容を保持する
  const [pendingImport, setPendingImport] = useState<{
    entries: EnvEntry[];
    overwriting: string[];
  } | null>(null);

  const fetchEnvVars = async (): Promise<EnvironmentVariable[]> => {
    const params = new URLSearchParams({ scope: selectedNode.scope });
    if (selectedNode.owner) params.set('owner', selectedNode.owner);
    if (selectedNode.repo) params.set('repo', selectedNode.repo);

    const response = await fetch(apiUrl(`/api/env/list?${params}`));
    if (!response.ok) throw new Error('Failed to fetch environment variables');

    const data = await response.json();
    return data.data.envVars || [];
  };

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
        setEnvVars(data.data.envVars || []);
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

    // エージェントの認証は Profile で設定する
    if (RESERVED_KEYS.includes(key)) {
      setAddError('エージェントの認証は Claude Profile / Codex Profile で設定してください');
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
        setEnvVars(data.data.envVars || []);
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

  const importEntries = async (entries: EnvEntry[]) => {
    setAddError('');
    try {
      const response = await fetch(apiUrl('/api/env/bulk'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: selectedNode.scope,
          owner: selectedNode.owner,
          repo: selectedNode.repo,
          vars: entries,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || 'Failed to import environment variables');
      }

      setEnvVars(await fetchEnvVars());
      handleCancelAdd();
      toaster.create({
        type: 'success',
        title: `Imported ${entries.length} variable${entries.length === 1 ? '' : 's'}`,
        description: entries.map((e) => e.key).join(', '),
      });
    } catch (err) {
      console.error('Failed to import environment variables:', err);
      setAddError(err instanceof Error ? err.message : 'Failed to import environment variables');
    }
  };

  // キー入力欄に `export KEY=value` 等の形式のテキストがペーストされたら、個別入力ではなく一括取り込みに切り替える
  // （値入力欄は `a=b` を含む生の値を貼る可能性があるため対象外）
  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const parsed = parseEnvText(e.clipboardData.getData('text'));
    if (!isEnvText(parsed)) return;

    e.preventDefault();
    setAddError('');

    const reserved = parsed.entries.filter((entry) => RESERVED_KEYS.includes(entry.key));
    const entries = parsed.entries.filter((entry) => !RESERVED_KEYS.includes(entry.key));

    if (reserved.length > 0) {
      toaster.create({
        type: 'warning',
        title: 'Skipped reserved keys',
        description: `${reserved.map((e) => e.key).join(', ')} — エージェントの認証は Claude Profile / Codex Profile で設定してください`,
      });
    }

    if (entries.length === 0) return;

    const existingKeys = new Set(envVars.map((v) => v.key));
    const overwriting = entries.filter((entry) => existingKeys.has(entry.key)).map((e) => e.key);

    if (overwriting.length > 0) {
      setPendingImport({ entries, overwriting });
      return;
    }

    void importEntries(entries);
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
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-foreground">New Variable</div>
              <div
                className="flex items-center gap-1 text-xs text-muted-foreground"
                title="Paste `export KEY=value` / `KEY=value` / `SET KEY=value` lines to import them all at once"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                <span>Paste to import</span>
              </div>
            </div>
            <Input
              type="text"
              value={addKey}
              onChange={(e) => setAddKey(e.target.value.toUpperCase())}
              onPaste={handlePaste}
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

      <ConfirmDialog
        open={pendingImport !== null}
        onOpenChange={({ open }) => {
          if (!open) setPendingImport(null);
        }}
        title="Overwrite existing variables?"
        message={
          <div className="space-y-2">
            <p>The following variables already exist in this scope and will be overwritten:</p>
            <ul className="font-mono text-foreground list-disc pl-5">
              {pendingImport?.overwriting.map((key) => (
                <li key={key}>{key}</li>
              ))}
            </ul>
          </div>
        }
        confirmLabel="Overwrite"
        variant="danger"
        onConfirm={() => {
          if (pendingImport) void importEntries(pendingImport.entries);
        }}
      />
    </div>
  );
}
