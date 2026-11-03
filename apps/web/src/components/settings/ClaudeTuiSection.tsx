'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { ClaudeTuiSettings } from '@minimalcorp/tsunagi-shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toaster } from '@/lib/toaster';
import { Code, errorMessage, putJson, requestData } from './local-llm-ui';

const API_PATH = '/api/settings/claude-tui';

/** tsunagi で起動する Claude Code を fullscreen レンダラにするか（既定で ON） */
export function ClaudeTuiSection() {
  const [settings, setSettings] = useState<ClaudeTuiSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    requestData<ClaudeTuiSettings>(API_PATH)
      .then(setSettings)
      .catch((error: unknown) => console.error('Failed to fetch Claude TUI settings:', error));
  }, []);

  const save = useCallback(async (next: ClaudeTuiSettings) => {
    setSaving(true);
    try {
      setSettings(await putJson<ClaudeTuiSettings>(API_PATH, next));
    } catch (error) {
      toaster.create({
        type: 'error',
        title: '画面描画の設定を保存できませんでした',
        description: errorMessage(error),
      });
    } finally {
      setSaving(false);
    }
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Claude Code の画面描画</CardTitle>
        <CardDescription>
          fullscreen レンダラでは、会話ログが重複・ループして表示される問題が起きません。OFF
          にすると Claude Code 自身の設定（<Code>/tui</Code>）に従います。起動中のタブは
          応答が終わった後に再起動して反映されます。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!settings ? (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            読み込み中...
          </span>
        ) : (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.fullscreen}
              disabled={saving}
              onChange={(e) => void save({ fullscreen: e.target.checked })}
              className="size-4 accent-primary"
            />
            fullscreen レンダラを使う（<Code>CLAUDE_CODE_NO_FLICKER=1</Code>）
          </label>
        )}
      </CardContent>
    </Card>
  );
}
