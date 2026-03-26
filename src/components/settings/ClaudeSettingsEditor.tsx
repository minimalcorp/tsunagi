'use client';

import { useState, useEffect } from 'react';
import { Settings, Info } from 'lucide-react';

interface ClaudeSettingsEditorProps {
  scope: 'global' | 'owner' | 'repo';
  owner?: string;
  repo?: string;
}

export function ClaudeSettingsEditor({ scope, owner, repo }: ClaudeSettingsEditorProps) {
  const [sources, setSources] = useState<Array<'user' | 'project' | 'local'>>([]);
  const [loading, setLoading] = useState(true);

  // 初期ロード
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const params = new URLSearchParams({ scope });
        if (owner) params.append('owner', owner);
        if (repo) params.append('repo', repo);

        const response = await fetch(`/api/claude-settings?${params}`);
        const data = await response.json();

        if (data.data.sources) {
          setSources(data.data.sources);
        }
      } catch (error) {
        console.error('Failed to load claude settings:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [scope, owner, repo]);

  // チェックボックス変更ハンドラ
  const handleToggle = async (source: 'user' | 'project' | 'local', checked: boolean) => {
    try {
      let newSources: Array<'user' | 'project' | 'local'>;

      if (checked) {
        newSources = [...sources, source];
      } else {
        newSources = sources.filter((s) => s !== source);
      }

      // 楽観的更新
      setSources(newSources);

      // サーバーに保存
      const response = await fetch('/api/claude-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, sources: newSources, owner, repo }),
      });

      if (!response.ok) {
        // エラー時は元に戻す
        setSources(sources);
        console.error('Failed to update claude settings');
      }
    } catch (error) {
      // エラー時は元に戻す
      setSources(sources);
      console.error('Failed to update claude settings:', error);
    }
  };

  if (loading) {
    return <div className="text-muted-foreground text-sm">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="w-5 h-5 text-primary-light" />
        <h3 className="text-lg font-semibold text-foreground">Claude Settings Sources</h3>
      </div>

      <div className="bg-card-hover border border-border rounded-xl p-4 space-y-3">
        {/* 説明 */}
        <div className="flex gap-2 text-sm text-muted-foreground">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p>
            設定ファイル（.mcp.json、CLAUDE.md、.claude/settings.json）の読み込み方法を選択します。
            すべて無効の場合、isolationモードで実行されます。
          </p>
        </div>

        {/* チェックボックス */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={sources.includes('user')}
              onChange={(e) => handleToggle('user', e.target.checked)}
              className="w-4 h-4 rounded border-theme-border"
            />
            <span className="text-foreground">
              User settings{' '}
              <span className="text-muted-foreground text-sm">(~/.claude/settings.json)</span>
            </span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={sources.includes('project')}
              onChange={(e) => handleToggle('project', e.target.checked)}
              className="w-4 h-4 rounded border-theme-border"
            />
            <span className="text-foreground">
              Project settings{' '}
              <span className="text-muted-foreground text-sm">
                (.claude/settings.json, CLAUDE.md, .mcp.json)
              </span>
            </span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={sources.includes('local')}
              onChange={(e) => handleToggle('local', e.target.checked)}
              className="w-4 h-4 rounded border-theme-border"
            />
            <span className="text-foreground">
              Local settings{' '}
              <span className="text-muted-foreground text-sm">(.claude/settings.local.json)</span>
            </span>
          </label>
        </div>

        {/* 現在の状態表示 */}
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-sm text-muted-foreground">
            {sources.length === 0 ? (
              <span className="text-warning font-medium">
                Isolation mode (設定ファイルを読み込みません)
              </span>
            ) : (
              <>
                有効な設定:{' '}
                <span className="text-primary-light font-medium">{sources.join(', ')}</span>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
