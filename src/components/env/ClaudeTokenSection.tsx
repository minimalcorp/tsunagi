'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff, Pencil, Plus, X, Check, AlertCircle, Trash2 } from 'lucide-react';
import { LoadingSpinner } from '../LoadingSpinner';
import type { SelectedNode } from './EnvTreeNavigation';

interface TokenItem {
  key: string;
  value: string;
  label: string;
}

const KNOWN_TOKENS = ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'];

const TOKEN_LABELS: Record<string, string> = {
  ANTHROPIC_API_KEY: 'API Key',
  CLAUDE_CODE_OAUTH_TOKEN: 'OAuth Token',
};

function detectTokenKey(value: string): string | null {
  if (value.startsWith('sk-ant-api')) return 'ANTHROPIC_API_KEY';
  if (value.startsWith('sk-ant-oat')) return 'CLAUDE_CODE_OAUTH_TOKEN';
  return null;
}

interface ClaudeTokenSectionProps {
  selectedNode: SelectedNode;
  onboardingStatus?: { completed: boolean; hasGlobalToken: boolean };
  onSwitchToGlobal?: () => void;
}

export function ClaudeTokenSection({
  selectedNode,
  onboardingStatus,
  onSwitchToGlobal,
}: ClaudeTokenSectionProps) {
  const [tokens, setTokens] = useState<TokenItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editError, setEditError] = useState('');
  const [editDetectedKey, setEditDetectedKey] = useState<string | null>(null);
  const [showValue, setShowValue] = useState<Record<string, boolean>>({});
  const [isAdding, setIsAdding] = useState(false);
  const [addValue, setAddValue] = useState('');
  const [addError, setAddError] = useState('');
  const [detectedKey, setDetectedKey] = useState<string | null>(null);

  useEffect(() => {
    loadTokens();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode]);

  const loadTokens = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ scope: selectedNode.scope });
      if (selectedNode.owner) params.set('owner', selectedNode.owner);
      if (selectedNode.repo) params.set('repo', selectedNode.repo);

      const response = await fetch(`/api/env/list?${params}`);
      if (!response.ok) throw new Error('Failed to fetch tokens');

      const data = await response.json();
      const allVars = data.data.envVars || [];

      // Filter only known tokens
      const tokenItems = allVars
        .filter((v: { key: string }) => KNOWN_TOKENS.includes(v.key))
        .map((v: { key: string; value: string }) => ({
          key: v.key,
          value: v.value,
          label: TOKEN_LABELS[v.key] || v.key,
        }));

      setTokens(tokenItems);
    } catch (err) {
      console.error('Failed to load tokens:', err);
      setError('Failed to load tokens');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (key: string) => {
    setEditingKey(key);
    setEditValue('');
    setEditError('');
    setEditDetectedKey(null);
  };

  const handleCancelEdit = () => {
    setEditingKey(null);
    setEditValue('');
    setEditError('');
    setEditDetectedKey(null);
  };

  const handleEditValueChange = (value: string) => {
    setEditValue(value);
    setEditError('');

    // Auto-detect token type
    const detected = detectTokenKey(value);
    setEditDetectedKey(detected);

    if (value && !detected) {
      setEditError('Invalid token format. Must start with sk-ant-api or sk-ant-oat');
    }
  };

  const handleSaveEdit = async (originalKey: string) => {
    if (!editValue.trim()) {
      setEditError('Token value is required');
      return;
    }

    const detectedKey = detectTokenKey(editValue);
    if (!detectedKey) {
      setEditError('Invalid token format');
      return;
    }

    try {
      // If key type changed, delete old and create new
      if (detectedKey !== originalKey) {
        // Delete old
        const deleteParams = new URLSearchParams({
          key: originalKey,
          scope: selectedNode.scope,
        });
        if (selectedNode.owner) deleteParams.set('owner', selectedNode.owner);
        if (selectedNode.repo) deleteParams.set('repo', selectedNode.repo);

        await fetch(`/api/env?${deleteParams}`, {
          method: 'DELETE',
        });

        // Create new
        await fetch('/api/env', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: detectedKey,
            value: editValue.trim(),
            scope: selectedNode.scope,
            owner: selectedNode.owner,
            repo: selectedNode.repo,
          }),
        });
      } else {
        // Same key type, just update
        const response = await fetch('/api/env', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: originalKey,
            value: editValue.trim(),
            scope: selectedNode.scope,
            owner: selectedNode.owner,
            repo: selectedNode.repo,
          }),
        });

        if (!response.ok) throw new Error('Failed to update token');
      }

      await loadTokens();
      setEditingKey(null);
      setEditValue('');
      setEditError('');
      setEditDetectedKey(null);
    } catch (err) {
      console.error('Failed to update token:', err);
      setEditError('Failed to update token');
    }
  };

  const handleAddValueChange = (value: string) => {
    setAddValue(value);
    setAddError('');

    // Auto-detect token type
    const detected = detectTokenKey(value);
    setDetectedKey(detected);

    if (value && !detected) {
      setAddError('Invalid token format. Must start with sk-ant-api or sk-ant-oat');
    }
  };

  const handleAddToken = async () => {
    if (!addValue.trim()) {
      setAddError('Token value is required');
      return;
    }

    const key = detectTokenKey(addValue);
    if (!key) {
      setAddError('Invalid token format');
      return;
    }

    // Check if token already exists (1つのみ制限)
    if (tokens.length > 0) {
      setAddError('Only one Claude token is allowed per scope. Please edit the existing token.');
      return;
    }

    try {
      const response = await fetch('/api/env', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          value: addValue.trim(),
          scope: selectedNode.scope,
          owner: selectedNode.owner,
          repo: selectedNode.repo,
        }),
      });

      if (!response.ok) throw new Error('Failed to add token');

      await loadTokens();
      setIsAdding(false);
      setAddValue('');
      setDetectedKey(null);
    } catch (err) {
      console.error('Failed to add token:', err);
      setAddError('Failed to add token');
    }
  };

  const handleCancelAdd = () => {
    setIsAdding(false);
    setAddValue('');
    setAddError('');
    setDetectedKey(null);
  };

  const handleDelete = async (key: string) => {
    if (!confirm(`Are you sure you want to delete this token?`)) {
      return;
    }

    try {
      const deleteParams = new URLSearchParams({
        key,
        scope: selectedNode.scope,
      });
      if (selectedNode.owner) deleteParams.set('owner', selectedNode.owner);
      if (selectedNode.repo) deleteParams.set('repo', selectedNode.repo);

      const response = await fetch(`/api/env?${deleteParams}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete token');

      await loadTokens();
    } catch (err) {
      console.error('Failed to delete token:', err);
      alert('Failed to delete token');
    }
  };

  if (isLoading) {
    return (
      <div className="border-2 border-primary rounded-lg p-4 bg-theme-card">
        <h2 className="text-lg font-bold text-theme-fg mb-4">Claude Tokens</h2>
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size="sm" message="Loading tokens..." />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-2 border-primary rounded-lg p-4 bg-theme-card">
        <h2 className="text-lg font-bold text-theme-fg mb-4">Claude Tokens</h2>
        <div className="text-red-500 text-sm">{error}</div>
      </div>
    );
  }

  const showWarning =
    onboardingStatus && !onboardingStatus.completed && selectedNode.scope !== 'global';

  return (
    <div className="border-2 border-primary rounded-lg p-4 bg-theme-card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-theme-fg">Claude Tokens</h2>
        {!isAdding && tokens.length === 0 && (
          <button
            onClick={() => setIsAdding(true)}
            className="px-3 py-1.5 bg-primary text-white rounded active:scale-95 transition-transform cursor-pointer flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            Add Token
          </button>
        )}
      </div>

      {/* Warning Banner */}
      {showWarning && (
        <div className="mb-4 border-2 border-amber-500 bg-amber-50/50 rounded-lg p-3 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-amber-900">
              オンボーディングを完了するには、Globalスコープにトークンを追加してください
            </p>
          </div>
          {onSwitchToGlobal && (
            <button
              onClick={onSwitchToGlobal}
              className="px-3 py-1.5 bg-amber-600 text-white rounded active:scale-95 transition-transform cursor-pointer text-sm whitespace-nowrap"
            >
              Switch to Global
            </button>
          )}
        </div>
      )}

      <div className="space-y-3">
        {/* Add Token Form */}
        {isAdding && (
          <div className="border border-theme rounded p-3 bg-theme-hover">
            <div className="text-sm font-medium text-theme-fg mb-2">New Token</div>
            <div className="space-y-2">
              <input
                type="password"
                value={addValue}
                onChange={(e) => handleAddValueChange(e.target.value)}
                placeholder="sk-ant-api... or sk-ant-oat..."
                className="w-full px-3 py-2 border border-theme rounded font-mono text-sm text-theme-fg bg-theme-card"
                autoFocus
              />
              {detectedKey && !addError && (
                <div className="text-xs text-green-600">
                  → Detected: {TOKEN_LABELS[detectedKey]}
                </div>
              )}
              {addError && <div className="text-xs text-red-500">{addError}</div>}
              <div className="flex justify-end gap-2">
                <button
                  onClick={handleCancelAdd}
                  className="px-3 py-1.5 border border-theme rounded text-theme-fg hover:bg-theme-hover active:scale-95 transition-transform cursor-pointer text-sm"
                >
                  <X className="w-4 h-4" />
                </button>
                <button
                  onClick={handleAddToken}
                  disabled={!detectedKey || !!addError}
                  className="px-3 py-1.5 bg-primary text-white rounded active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-sm"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Existing Tokens */}
        {tokens.length === 0 && !isAdding ? (
          <div className="text-center text-theme-muted text-sm py-4">
            No Claude tokens configured
          </div>
        ) : (
          tokens.map((token) => (
            <div key={token.key} className="border border-theme rounded p-3 space-y-2">
              {editingKey === token.key ? (
                // Edit Mode (same UI as Add)
                <>
                  <div className="text-sm font-medium text-theme-fg mb-2">Edit Token</div>
                  <input
                    type="password"
                    value={editValue}
                    onChange={(e) => handleEditValueChange(e.target.value)}
                    placeholder="sk-ant-api... or sk-ant-oat..."
                    className="w-full px-3 py-2 border border-theme rounded font-mono text-sm text-theme-fg bg-theme-card"
                    autoFocus
                  />
                  {editDetectedKey && !editError && (
                    <div className="text-xs text-green-600">
                      → Detected: {TOKEN_LABELS[editDetectedKey]}
                    </div>
                  )}
                  {editError && <div className="text-xs text-red-500">{editError}</div>}
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={handleCancelEdit}
                      className="px-3 py-1.5 border border-theme rounded text-theme-fg hover:bg-theme-hover active:scale-95 transition-transform cursor-pointer text-sm"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleSaveEdit(token.key)}
                      disabled={!editDetectedKey || !!editError}
                      className="px-3 py-1.5 bg-primary text-white rounded active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-sm"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  </div>
                </>
              ) : (
                // View Mode
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-theme-fg">{token.label}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          setShowValue((prev) => ({ ...prev, [token.key]: !prev[token.key] }))
                        }
                        className="p-1 hover:bg-theme-hover rounded cursor-pointer"
                        title={showValue[token.key] ? 'Hide value' : 'Show value'}
                      >
                        {showValue[token.key] ? (
                          <EyeOff className="w-4 h-4 text-theme-muted" />
                        ) : (
                          <Eye className="w-4 h-4 text-theme-muted" />
                        )}
                      </button>
                      <button
                        onClick={() => handleEdit(token.key)}
                        className="p-1 hover:bg-theme-hover rounded cursor-pointer"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4 text-theme-muted" />
                      </button>
                      {selectedNode.scope !== 'global' && (
                        <button
                          onClick={() => handleDelete(token.key)}
                          className="p-1 hover:bg-red-50 rounded cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    type={showValue[token.key] ? 'text' : 'password'}
                    value={token.value}
                    readOnly
                    className="w-full px-3 py-2 border border-theme rounded font-mono text-sm text-theme-fg bg-theme-card"
                  />
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
