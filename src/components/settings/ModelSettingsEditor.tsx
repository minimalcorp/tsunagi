'use client';

import { useState, useEffect } from 'react';
import { Sparkles, Info } from 'lucide-react';
import type { AvailableModel, ModelSetting } from '@/lib/types';

interface ModelSettingsEditorProps {
  scope: 'global' | 'owner' | 'repo';
  owner?: string;
  repo?: string;
}

export function ModelSettingsEditor({ scope, owner, repo }: ModelSettingsEditorProps) {
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [settings, setSettings] = useState<ModelSetting | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      // Load available models (enabled only)
      const modelsRes = await fetch('/api/models?enabled=true');
      const modelsData = await modelsRes.json();
      setAvailableModels(modelsData.data.models || []);

      // Load current settings
      const params = new URLSearchParams({ scope });
      if (owner) params.append('owner', owner);
      if (repo) params.append('repo', repo);

      const settingsRes = await fetch(`/api/model-settings?${params}`);
      const settingsData = await settingsRes.json();

      if (settingsData.data.settings.length > 0) {
        setSettings(settingsData.data.settings[0]);
      }
    } catch (error) {
      console.error('Failed to load model settings:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, owner, repo]);

  const handleSave = async (field: keyof ModelSetting, value: string) => {
    try {
      if (settings) {
        // Update existing
        const response = await fetch(`/api/model-settings/${settings.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [field]: value }),
        });

        if (response.ok) {
          const data = await response.json();
          setSettings(data.data.setting);
        }
      } else {
        // Create new
        const response = await fetch('/api/model-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scope,
            owner,
            repo,
            [field]: value,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          setSettings(data.data.setting);
        }
      }
    } catch (error) {
      console.error('Failed to save model settings:', error);
      alert('Failed to save settings');
    }
  };

  if (loading) {
    return <div className="text-theme-muted text-sm">Loading...</div>;
  }

  const defaultModel = 'claude-3-5-sonnet-20241022';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-primary-light" />
        <h3 className="text-lg font-semibold text-theme-fg">Model Settings</h3>
      </div>

      <div className="bg-theme-card-hover border border-theme rounded p-4 space-y-4">
        <div className="flex gap-2 text-sm text-theme-muted">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p>
            タスクステータスごとに使用するモデルを設定します。未設定の場合は上位階層の設定を継承します。
          </p>
        </div>

        <div className="space-y-3">
          {/* Backlog Model */}
          <div>
            <label className="block text-sm font-medium text-theme-fg mb-1">Backlog Model</label>
            <select
              value={settings?.backlogModel || defaultModel}
              onChange={(e) => handleSave('backlogModel', e.target.value)}
              className="w-full px-3 py-2 bg-theme-card border border-theme-border rounded text-theme-fg"
            >
              {availableModels.map((model) => (
                <option key={model.id} value={model.modelId}>
                  {model.displayName} ({model.category})
                </option>
              ))}
            </select>
          </div>

          {/* Planning Model */}
          <div>
            <label className="block text-sm font-medium text-theme-fg mb-1">Planning Model</label>
            <select
              value={settings?.planningModel || defaultModel}
              onChange={(e) => handleSave('planningModel', e.target.value)}
              className="w-full px-3 py-2 bg-theme-card border border-theme-border rounded text-theme-fg"
            >
              {availableModels.map((model) => (
                <option key={model.id} value={model.modelId}>
                  {model.displayName} ({model.category})
                </option>
              ))}
            </select>
          </div>

          {/* Coding Model */}
          <div>
            <label className="block text-sm font-medium text-theme-fg mb-1">Coding Model</label>
            <select
              value={settings?.codingModel || defaultModel}
              onChange={(e) => handleSave('codingModel', e.target.value)}
              className="w-full px-3 py-2 bg-theme-card border border-theme-border rounded text-theme-fg"
            >
              {availableModels.map((model) => (
                <option key={model.id} value={model.modelId}>
                  {model.displayName} ({model.category})
                </option>
              ))}
            </select>
          </div>

          {/* Reviewing Model */}
          <div>
            <label className="block text-sm font-medium text-theme-fg mb-1">Reviewing Model</label>
            <select
              value={settings?.reviewingModel || defaultModel}
              onChange={(e) => handleSave('reviewingModel', e.target.value)}
              className="w-full px-3 py-2 bg-theme-card border border-theme-border rounded text-theme-fg"
            >
              {availableModels.map((model) => (
                <option key={model.id} value={model.modelId}>
                  {model.displayName} ({model.category})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
