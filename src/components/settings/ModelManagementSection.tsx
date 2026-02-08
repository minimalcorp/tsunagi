'use client';

import { useState, useEffect } from 'react';
import { Cpu, RefreshCw, Info } from 'lucide-react';
import type { AvailableModel } from '@/lib/types';

export function ModelManagementSection() {
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const loadModels = async () => {
    try {
      const response = await fetch('/api/models?enabled=false');
      const data = await response.json();
      setModels(data.data.models || []);
    } catch (error) {
      console.error('Failed to load models:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadModels();
  }, []);

  const handleSync = async () => {
    try {
      setSyncing(true);
      const response = await fetch('/api/models/sync', { method: 'POST' });
      const data = await response.json();

      if (response.ok) {
        await loadModels();
        alert(
          `Sync completed:\nSynced: ${data.data.synced}\nAdded: ${data.data.added}\nUpdated: ${data.data.updated}`
        );
      } else {
        alert('Sync failed');
      }
    } catch (error) {
      console.error('Failed to sync models:', error);
      alert('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleEnabled = async (id: string, enabled: boolean) => {
    try {
      const model = models.find((m) => m.id === id);
      if (!model) return;

      // 楽観的更新
      setModels(models.map((m) => (m.id === id ? { ...m, enabled } : m)));

      const response = await fetch(`/api/models/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });

      if (!response.ok) {
        // エラー時は元に戻す
        setModels(models);
        alert('Failed to update model');
      }
    } catch (error) {
      // エラー時は元に戻す
      setModels(models);
      console.error('Failed to update model:', error);
    }
  };

  if (loading) {
    return <div className="text-theme-muted text-sm">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-primary-light" />
          <h3 className="text-lg font-semibold text-theme-fg">Available Models</h3>
        </div>

        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-3 py-1.5 bg-primary-light text-white rounded hover:bg-primary disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          Sync from API
        </button>
      </div>

      <div className="bg-theme-card-hover border border-theme rounded p-4 space-y-3">
        <div className="flex gap-2 text-sm text-theme-muted">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p>Anthropic APIから利用可能なモデルを同期し、有効/無効を切り替えます。</p>
        </div>

        <div className="space-y-2">
          {models.length === 0 ? (
            <p className="text-theme-muted text-sm">
              No models found. Click &quot;Sync from API&quot; to fetch models.
            </p>
          ) : (
            models.map((model) => (
              <div
                key={model.id}
                className="flex items-center justify-between p-2 border border-theme rounded"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-theme-fg">{model.displayName}</span>
                    <span
                      className={`px-2 py-0.5 text-xs rounded ${
                        model.category === 'premium'
                          ? 'bg-purple-500/20 text-purple-300'
                          : model.category === 'fast'
                            ? 'bg-green-500/20 text-green-300'
                            : 'bg-blue-500/20 text-blue-300'
                      }`}
                    >
                      {model.category}
                    </span>
                  </div>
                  <p className="text-xs text-theme-muted">{model.modelId}</p>
                  {model.description && (
                    <p className="text-xs text-theme-muted mt-1">{model.description}</p>
                  )}
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={model.enabled}
                    onChange={(e) => handleToggleEnabled(model.id, e.target.checked)}
                    className="w-4 h-4 rounded border-theme-border"
                  />
                  <span className="text-sm text-theme-fg">Enabled</span>
                </label>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
