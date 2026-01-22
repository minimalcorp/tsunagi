'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { LoadingSpinner } from './LoadingSpinner';

interface EnvironmentSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (key: string, value: string) => Promise<void>;
}

export function EnvironmentSettingsDialog({
  isOpen,
  onClose,
  onSave,
}: EnvironmentSettingsDialogProps) {
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [claudeCodeToken, setClaudeCodeToken] = useState('');
  const [githubPat, setGithubPat] = useState('');
  const [anthropicEnabled, setAnthropicEnabled] = useState(true);
  const [claudeCodeEnabled, setClaudeCodeEnabled] = useState(true);
  const [githubEnabled, setGithubEnabled] = useState(true);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // 現在の環境変数とenable状態をロード
      Promise.all([
        fetch('/api/env').then((r) => r.json()),
        fetch('/api/env/list').then((r) => r.json()),
      ])
        .then(([envData, listData]) => {
          // 値を設定
          setAnthropicApiKey(envData.data.env.ANTHROPIC_API_KEY || '');
          setClaudeCodeToken(envData.data.env.CLAUDE_CODE_OAUTH_TOKEN || '');
          setGithubPat(envData.data.env.GITHUB_PAT || '');

          // enabled状態を設定
          const envVars = listData.data.envVars || [];
          const anthropicVar = envVars.find((v: { key: string }) => v.key === 'ANTHROPIC_API_KEY');
          const claudeCodeVar = envVars.find(
            (v: { key: string }) => v.key === 'CLAUDE_CODE_OAUTH_TOKEN'
          );
          const githubVar = envVars.find((v: { key: string }) => v.key === 'GITHUB_PAT');

          setAnthropicEnabled(anthropicVar?.enabled !== false);
          setClaudeCodeEnabled(claudeCodeVar?.enabled !== false);
          setGithubEnabled(githubVar?.enabled !== false);
        })
        .catch((err) => {
          console.error('Failed to load environment variables:', err);
        });
    }
  }, [isOpen]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    // どちらか片方は必須
    if (!anthropicApiKey && !claudeCodeToken) {
      setError('ANTHROPIC_API_KEY または CLAUDE_CODE_OAUTH_TOKEN のどちらか一方は必須です');
      return;
    }

    setIsLoading(true);
    try {
      // 入力された環境変数のみを設定
      if (anthropicApiKey) {
        await onSave('ANTHROPIC_API_KEY', anthropicApiKey);
        // enabled状態を更新
        await fetch('/api/env/toggle', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: 'ANTHROPIC_API_KEY',
            scope: 'global',
            enabled: anthropicEnabled,
          }),
        });
      }
      if (claudeCodeToken) {
        await onSave('CLAUDE_CODE_OAUTH_TOKEN', claudeCodeToken);
        // enabled状態を更新
        await fetch('/api/env/toggle', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: 'CLAUDE_CODE_OAUTH_TOKEN',
            scope: 'global',
            enabled: claudeCodeEnabled,
          }),
        });
      }
      if (githubPat) {
        await onSave('GITHUB_PAT', githubPat);
        // enabled状態を更新
        await fetch('/api/env/toggle', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: 'GITHUB_PAT',
            scope: 'global',
            enabled: githubEnabled,
          }),
        });
      }
      onClose();
    } catch (err) {
      console.error('Failed to save environment variables:', err);
      setError('環境変数の設定に失敗しました');
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
            <LoadingSpinner size="lg" message="Saving settings..." />
          </div>
        )}

        <h2 className="text-xl font-bold mb-4 text-theme-fg">Environment Settings</h2>

        <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/50 rounded text-sm text-theme-fg">
          どちらか片方の認証情報を設定してください
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-theme-fg">
                ANTHROPIC_API_KEY (Optional)
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={anthropicEnabled}
                  onChange={(e) => setAnthropicEnabled(e.target.checked)}
                  disabled={isLoading}
                  className="w-4 h-4"
                />
                <span className="text-xs text-theme-muted">Enabled</span>
              </label>
            </div>
            <input
              type="password"
              placeholder="sk-ant-xxx"
              value={anthropicApiKey}
              onChange={(e) => setAnthropicApiKey(e.target.value)}
              className="w-full px-3 py-2 border border-theme rounded font-mono text-sm text-theme-fg bg-theme-card"
              disabled={isLoading}
            />
            <p className="text-xs text-theme-muted mt-1">
              Claude APIキー（
              <a
                href="https://console.anthropic.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 underline"
              >
                console.anthropic.com
              </a>
              から取得）
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-theme-fg">
                CLAUDE_CODE_OAUTH_TOKEN (Optional)
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={claudeCodeEnabled}
                  onChange={(e) => setClaudeCodeEnabled(e.target.checked)}
                  disabled={isLoading}
                  className="w-4 h-4"
                />
                <span className="text-xs text-theme-muted">Enabled</span>
              </label>
            </div>
            <input
              type="password"
              placeholder="oauth_xxx"
              value={claudeCodeToken}
              onChange={(e) => setClaudeCodeToken(e.target.value)}
              className="w-full px-3 py-2 border border-theme rounded font-mono text-sm text-theme-fg bg-theme-card"
              disabled={isLoading}
            />
            <p className="text-xs text-gray-500 mt-1">
              Claude Code OAuth Token（
              <a
                href="https://claude.ai/settings/developer"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 underline"
              >
                claude.ai/settings/developer
              </a>
              から取得）
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-theme-fg">GITHUB_PAT (Optional)</label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={githubEnabled}
                  onChange={(e) => setGithubEnabled(e.target.checked)}
                  disabled={isLoading}
                  className="w-4 h-4"
                />
                <span className="text-xs text-theme-muted">Enabled</span>
              </label>
            </div>
            <input
              type="password"
              placeholder="ghp_xxx or github_pat_xxx"
              value={githubPat}
              onChange={(e) => setGithubPat(e.target.value)}
              className="w-full px-3 py-2 border border-theme rounded font-mono text-sm text-theme-fg bg-theme-card"
              disabled={isLoading}
            />
            <p className="text-xs text-theme-muted mt-1">
              GitHub Personal Access Token（
              <a
                href="https://github.com/settings/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 underline"
              >
                github.com/settings/tokens
              </a>
              から取得）
            </p>
          </div>

          {error && <div className="text-red-500 text-sm">{error}</div>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-theme rounded text-theme-fg active:scale-95 transition-all"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500 text-white rounded active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading}
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
