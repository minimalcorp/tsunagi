'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export default function SettingsPage() {
  const router = useRouter();
  const [claudeToken, setClaudeToken] = useState('');
  const [githubPat, setGithubPat] = useState('');
  const [claudeEnabled, setClaudeEnabled] = useState(true);
  const [githubEnabled, setGithubEnabled] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // 現在の環境変数とenable状態をロード
    Promise.all([
      fetch('/api/env').then((r) => r.json()),
      fetch('/api/env/list').then((r) => r.json()),
    ])
      .then(([envData, listData]) => {
        // 値を設定（CLAUDE_CODE_OAUTH_TOKEN優先、なければANTHROPIC_API_KEY）
        const anthropicApiKey = envData.data.env.ANTHROPIC_API_KEY || '';
        const claudeCodeToken = envData.data.env.CLAUDE_CODE_OAUTH_TOKEN || '';
        setClaudeToken(claudeCodeToken || anthropicApiKey);
        setGithubPat(envData.data.env.GITHUB_PAT || '');

        // enabled状態を設定
        const envVars = listData.data.envVars || [];
        const anthropicVar = envVars.find((v: { key: string }) => v.key === 'ANTHROPIC_API_KEY');
        const claudeCodeVar = envVars.find(
          (v: { key: string }) => v.key === 'CLAUDE_CODE_OAUTH_TOKEN'
        );
        const githubVar = envVars.find((v: { key: string }) => v.key === 'GITHUB_PAT');

        // CLAUDE_CODE_OAUTH_TOKEN優先でenabled状態を取得
        const claudeVarEnabled =
          claudeCodeVar?.enabled !== false || anthropicVar?.enabled !== false;
        setClaudeEnabled(claudeVarEnabled);
        setGithubEnabled(githubVar?.enabled !== false);
      })
      .catch((err) => {
        console.error('Failed to load environment variables:', err);
        setError('環境変数の読み込みに失敗しました');
      });
  }, []);

  const detectTokenType = (
    token: string
  ): 'ANTHROPIC_API_KEY' | 'CLAUDE_CODE_OAUTH_TOKEN' | null => {
    if (token.startsWith('sk-ant-oat')) {
      return 'CLAUDE_CODE_OAUTH_TOKEN';
    } else if (token.startsWith('sk-ant-api')) {
      return 'ANTHROPIC_API_KEY';
    }
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Claude Tokenが入力されていない場合
    if (!claudeToken) {
      setError('Claude Token (API Key または OAuth Token) は必須です');
      return;
    }

    // トークンタイプの自動判別
    const tokenType = detectTokenType(claudeToken);
    if (!tokenType) {
      setError(
        'Claude Tokenの形式が正しくありません。sk-ant-api... (API Key) または sk-ant-oat... (OAuth Token) で始まる必要があります'
      );
      return;
    }

    // GITHUB_PATが入力されていない場合
    if (!githubPat) {
      setError('GITHUB_PAT は必須です');
      return;
    }

    setIsLoading(true);
    try {
      // Claude Tokenを適切な環境変数として保存
      const saveResponse = await fetch('/api/env', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: tokenType,
          value: claudeToken,
          scope: 'global',
        }),
      });

      if (!saveResponse.ok) throw new Error('Failed to save Claude token');

      // もう一方のtokenをdisableにする（両方が有効にならないようにする）
      const otherTokenType =
        tokenType === 'ANTHROPIC_API_KEY' ? 'CLAUDE_CODE_OAUTH_TOKEN' : 'ANTHROPIC_API_KEY';
      await fetch('/api/env/toggle', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: otherTokenType,
          scope: 'global',
          enabled: false,
        }),
      });

      // enabled状態を更新
      await fetch('/api/env/toggle', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: tokenType,
          scope: 'global',
          enabled: claudeEnabled,
        }),
      });

      // GitHub PATを保存
      const githubResponse = await fetch('/api/env', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'GITHUB_PAT',
          value: githubPat,
          scope: 'global',
        }),
      });

      if (!githubResponse.ok) throw new Error('Failed to save GitHub PAT');

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

      setSuccess('設定を保存しました');
      setTimeout(() => {
        router.push('/');
      }, 1500);
    } catch (err) {
      console.error('Failed to save environment variables:', err);
      setError('環境変数の設定に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-theme-bg">
      {/* Header */}
      <div className="sticky top-0 z-50 p-4 border-b border-theme bg-theme-card">
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push('/')}
            className="text-primary-light hover:brightness-110 font-medium flex items-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Board
          </button>

          <h1 className="text-xl font-bold text-theme-fg absolute left-1/2 -translate-x-1/2">
            Settings
          </h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-theme-card rounded-lg p-6 relative">
          {isLoading && (
            <div className="absolute inset-0 bg-theme-card bg-opacity-90 rounded-lg flex items-center justify-center z-10">
              <LoadingSpinner size="lg" message="Saving settings..." />
            </div>
          )}

          <h2 className="text-2xl font-bold mb-6 text-theme-fg">Environment Settings</h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-theme-fg">
                  Claude Token (API Key or OAuth Token) *
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={claudeEnabled}
                    onChange={(e) => setClaudeEnabled(e.target.checked)}
                    disabled={isLoading}
                    className="w-4 h-4 cursor-pointer"
                  />
                  <span className="text-xs text-theme-muted">Enabled</span>
                </label>
              </div>
              <input
                type="password"
                placeholder="sk-ant-api... or sk-ant-oat..."
                value={claudeToken}
                onChange={(e) => setClaudeToken(e.target.value)}
                className="w-full px-3 py-2 border border-theme rounded font-mono text-sm text-theme-fg bg-theme-card"
                disabled={isLoading}
              />
              <p className="text-xs text-theme-muted mt-1">
                <strong>sk-ant-api</strong> で始まる場合はAPI Key、<strong>sk-ant-oat</strong>{' '}
                で始まる場合はOAuth Tokenとして自動判別されます
              </p>
              <p className="text-xs text-theme-muted mt-1">
                API Key:{' '}
                <a
                  href="https://console.anthropic.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  console.anthropic.com
                </a>
                、OAuth Token:{' '}
                <a
                  href="https://claude.ai/settings/developer"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  claude.ai/settings/developer
                </a>
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-theme-fg">GITHUB_PAT *</label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={githubEnabled}
                    onChange={(e) => setGithubEnabled(e.target.checked)}
                    disabled={isLoading}
                    className="w-4 h-4 cursor-pointer"
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
                  className="text-primary underline"
                >
                  github.com/settings/tokens
                </a>
                から取得）。Docker環境でリポジトリをcloneするために必要です。
              </p>
            </div>

            {error && <div className="text-red-500 text-sm">{error}</div>}
            {success && <div className="text-green-500 text-sm">{success}</div>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => router.push('/')}
                className="px-4 py-2 border border-theme rounded text-theme-fg active:scale-95 transition-transform cursor-pointer"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-primary text-white rounded active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                disabled={isLoading}
              >
                Save
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
