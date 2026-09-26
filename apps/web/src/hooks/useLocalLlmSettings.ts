'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  LmStudioSettings,
  LocalLlmSettings,
  OllamaSettings,
} from '@minimalcorp/tsunagi-shared';
import { apiUrl } from '@/lib/api-url';

/**
 * AppSetting（/api/settings/<key>）を取得する hook。
 * 取得前・取得失敗時は null（関連する UI は出さない）。
 */
function useAppSetting<T>(key: string) {
  const [settings, setSettings] = useState<T | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(apiUrl(`/api/settings/${key}`));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: T };
      setSettings(json.data);
    } catch (error) {
      console.error(`Failed to fetch ${key} settings:`, error);
      setSettings(null);
    }
  }, [key]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { settings, setSettings, reload };
}

/** 実験的機能 ローカルLLM の設定（使用中のモデル等） */
export function useLocalLlmSettings() {
  return useAppSetting<LocalLlmSettings>('local-llm');
}

/** Ollama の接続設定 */
export function useOllamaSettings() {
  return useAppSetting<OllamaSettings>('ollama');
}

/** LM Studio の接続設定 */
export function useLmStudioSettings() {
  return useAppSetting<LmStudioSettings>('lmstudio');
}
