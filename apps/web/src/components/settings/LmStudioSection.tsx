'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Play, Square, TriangleAlert } from 'lucide-react';
import type { LmStudioSettings, LmStudioStatus } from '@minimalcorp/tsunagi-shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LmStudioIcon } from '@/components/icons/BrandIcons';
import { useLmStudioSettings } from '@/hooks/useLocalLlmSettings';
import { formatContextLength } from '@/lib/context-length';
import { toaster } from '@/lib/toaster';
import {
  AdvancedSettings,
  Code,
  Field,
  StatusRow,
  errorMessage,
  putJson,
  requestData,
} from './local-llm-ui';

// サーバーの起動・停止やモデルの読み込みは LM Studio のアプリ側でも行えるため、定期的に追従する
const STATUS_POLL_MS = 5000;

interface FormState {
  baseUrl: string;
  apiToken: string;
  lmsPath: string;
}

/** LM Studio の接続設定とサーバーの起動・停止。モデルの選択は「ローカルLLM」欄で行う */
export function LmStudioSection() {
  const { settings, setSettings } = useLmStudioSettings();
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<LmStudioStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        baseUrl: settings.baseUrl,
        apiToken: settings.apiToken,
        lmsPath: settings.lmsPath,
      });
    }
  }, [settings]);

  const enabled = settings?.enabled === true;

  const fetchStatus = useCallback(async () => {
    try {
      setStatus(await requestData<LmStudioStatus>('/api/settings/lmstudio/status'));
    } catch (error) {
      console.error('Failed to fetch LM Studio status:', error);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void fetchStatus();
    const timer = setInterval(() => void fetchStatus(), STATUS_POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, fetchStatus]);

  const save = useCallback(
    async (next: LmStudioSettings): Promise<boolean> => {
      setSaving(true);
      try {
        setSettings(await putJson<LmStudioSettings>('/api/settings/lmstudio', next));
        return true;
      } catch (error) {
        toaster.create({
          type: 'error',
          title: 'LM Studio の設定を保存できませんでした',
          description: errorMessage(error),
        });
        return false;
      } finally {
        setSaving(false);
      }
    },
    [setSettings]
  );

  const runServer = useCallback(async (action: 'start' | 'stop') => {
    setBusy(true);
    try {
      setStatus(
        await requestData<LmStudioStatus>(`/api/settings/lmstudio/server/${action}`, {
          method: 'POST',
        })
      );
    } catch (error) {
      toaster.create({
        type: 'error',
        title: action === 'start' ? 'サーバーを起動できません' : 'サーバーを停止できません',
        description: errorMessage(error),
      });
    } finally {
      setBusy(false);
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!settings || !form) return;
    if (await save({ ...settings, ...form })) {
      toaster.create({ type: 'success', title: 'LM Studio の設定を保存しました' });
      void fetchStatus();
    }
  }, [settings, form, save, fetchStatus]);

  const updateForm = (patch: Partial<FormState>) =>
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));

  return (
    <Card>
      <CardHeader>
        <CardTitle>LM Studio</CardTitle>
        <CardDescription>
          ローカルLLMのプロバイダーとして LM Studio（0.4.1 以降）を使います。
          <a
            href="https://lmstudio.ai/download"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            LM Studio
          </a>
          のインストールとモデルのダウンロードはご自身で行ってください（例:{' '}
          <Code>mlx-community/Qwen3.6-35B-A3B-4bit</Code>）。一度起動すると lms CLI が入ります。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!settings || !form ? (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            読み込み中...
          </span>
        ) : !enabled ? (
          <Button
            size="default"
            onClick={() => void save({ ...settings, enabled: true })}
            disabled={saving}
          >
            <LmStudioIcon className="size-4" />
            LM Studio を有効化する
          </Button>
        ) : (
          <>
            <StatusRow>
              {!status ? (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  確認中...
                </span>
              ) : status.serverRunning ? (
                <>
                  <span className="flex items-center gap-2 text-success">
                    <CheckCircle2 className="size-4" />
                    サーバー起動中
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {status.loaded.length > 0
                      ? `読み込み中: ${status.loaded
                          .map((l) => `${l.key} (${formatContextLength(l.contextLength)})`)
                          .join(', ')}`
                      : '読み込み中のモデルなし'}
                  </span>
                </>
              ) : (
                <span className="flex items-center gap-2 text-warning">
                  <TriangleAlert className="size-4" />
                  サーバー停止中
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                {status && status.lmsPath ? (
                  status.serverRunning ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void runServer('stop')}
                      disabled={busy}
                    >
                      {busy ? <Loader2 className="animate-spin" /> : <Square />}
                      停止
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => void runServer('start')} disabled={busy}>
                      {busy ? <Loader2 className="animate-spin" /> : <Play />}
                      起動
                    </Button>
                  )
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void save({ ...settings, enabled: false })}
                  disabled={saving}
                >
                  無効にする
                </Button>
              </div>
            </StatusRow>
            {status && !status.lmsPath && !status.serverRunning && (
              <p className="text-xs text-muted-foreground">
                tsunagi から LM Studio のサーバーを起動するための lms CLI が見つかりません（tsunagi
                を Docker で動かしている場合も同様です）。LM Studio アプリの Developer
                タブでサーバーを起動するか、LM Studio を動かしているマシンで{' '}
                <Code>lms server start</Code> を実行してください。lms
                がある場合は詳細設定でパスを指定できます。
              </p>
            )}

            <AdvancedSettings>
              <Field label="Base URL">
                <Input
                  value={form.baseUrl}
                  onChange={(e) => updateForm({ baseUrl: e.target.value })}
                  placeholder="http://localhost:1234"
                />
              </Field>
              <Field
                label="API トークン (任意)"
                hint="LM Studio で「Require Authentication」を有効にしている場合のみ"
              >
                <Input
                  type="password"
                  value={form.apiToken}
                  onChange={(e) => updateForm({ apiToken: e.target.value })}
                />
              </Field>
              <Field
                label="lms のパス (任意)"
                hint="空欄なら ~/.lmstudio/bin/lms → PATH の順で探します"
              >
                <Input
                  value={form.lmsPath}
                  onChange={(e) => updateForm({ lmsPath: e.target.value })}
                  placeholder={status?.lmsPath ?? '~/.lmstudio/bin/lms'}
                  className="font-mono"
                />
              </Field>
              <div>
                <Button size="default" onClick={() => void handleSave()} disabled={saving}>
                  {saving && <Loader2 className="animate-spin" />}
                  保存
                </Button>
              </div>
            </AdvancedSettings>
          </>
        )}
      </CardContent>
    </Card>
  );
}
