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
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // 現在の環境変数をロード
      fetch('/api/env')
        .then((r) => r.json())
        .then((data) => {
          setAnthropicApiKey(data.data.env.ANTHROPIC_API_KEY || '');
          setClaudeCodeToken(data.data.env.CLAUDE_CODE_OAUTH_TOKEN || '');
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
      }
      if (claudeCodeToken) {
        await onSave('CLAUDE_CODE_OAUTH_TOKEN', claudeCodeToken);
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
      <div className="bg-white rounded-lg p-6 w-full max-w-md relative">
        {isLoading && (
          <div className="absolute inset-0 bg-white bg-opacity-90 rounded-lg flex items-center justify-center z-10">
            <LoadingSpinner size="lg" message="Saving settings..." />
          </div>
        )}

        <h2 className="text-xl font-bold mb-4 text-black">Environment Settings</h2>

        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-gray-700">
          どちらか片方の認証情報を設定してください
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-black">
              ANTHROPIC_API_KEY (Optional)
            </label>
            <input
              type="password"
              placeholder="sk-ant-xxx"
              value={anthropicApiKey}
              onChange={(e) => setAnthropicApiKey(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded font-mono text-sm text-black"
              disabled={isLoading}
            />
            <p className="text-xs text-gray-500 mt-1">
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
            <label className="block text-sm font-medium mb-1 text-black">
              CLAUDE_CODE_OAUTH_TOKEN (Optional)
            </label>
            <input
              type="password"
              placeholder="oauth_xxx"
              value={claudeCodeToken}
              onChange={(e) => setClaudeCodeToken(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded font-mono text-sm text-black"
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

          {error && <div className="text-red-500 text-sm">{error}</div>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-200 rounded text-black active:scale-95 transition-all"
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
