'use client';

import { useCallback, useEffect, useState } from 'react';
import type { OllamaSettings } from '@minimalcorp/tsunagi-shared';
import { apiUrl } from '@/lib/api-url';

/**
 * 実験的機能 Ollama の設定を取得する hook。
 * 取得前・取得失敗時は null（Ollama 関連の UI は出さない）。
 */
export function useOllamaSettings() {
  const [settings, setSettings] = useState<OllamaSettings | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/settings/ollama'));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: OllamaSettings };
      setSettings(json.data);
    } catch (error) {
      console.error('Failed to fetch ollama settings:', error);
      setSettings(null);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { settings, setSettings, reload };
}
