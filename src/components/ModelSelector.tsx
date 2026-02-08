'use client';

import { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import type { AvailableModel } from '@/lib/types';

interface ModelSelectorProps {
  taskId: string;
  tabId: string;
  currentModel?: string;
  onModelChange?: (model: string | undefined) => void;
}

export function ModelSelector({ tabId, currentModel, onModelChange }: ModelSelectorProps) {
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | undefined>(currentModel);

  useEffect(() => {
    const loadModels = async () => {
      try {
        const response = await fetch('/api/models?enabled=true');
        const data = await response.json();
        setModels(data.data.models || []);
      } catch (error) {
        console.error('Failed to load models:', error);
      }
    };
    loadModels();
  }, []);

  useEffect(() => {
    setSelectedModel(currentModel);
  }, [currentModel]);

  const handleChange = async (value: string) => {
    const newModel = value === 'default' ? undefined : value;
    setSelectedModel(newModel);

    try {
      // Update tab model via API
      await fetch(`/api/tabs/${tabId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: newModel }),
      });

      onModelChange?.(newModel);
    } catch (error) {
      console.error('Failed to update tab model:', error);
      setSelectedModel(currentModel);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Sparkles className="w-4 h-4 text-primary-light flex-shrink-0" />
      <select
        value={selectedModel || 'default'}
        onChange={(e) => handleChange(e.target.value)}
        className="px-2 py-1 text-sm bg-theme-card border border-theme-border rounded text-theme-fg"
      >
        <option value="default">デフォルト (階層設定)</option>
        {models.map((model) => (
          <option key={model.id} value={model.modelId}>
            {model.displayName}
          </option>
        ))}
      </select>
    </div>
  );
}
