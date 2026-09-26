'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Globe, Loader2, RefreshCw, TriangleAlert } from 'lucide-react';
import type {
  OllamaAccountStatus,
  OllamaSettings,
  OllamaStatus,
} from '@minimalcorp/tsunagi-shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { OllamaIcon } from '@/components/icons/BrandIcons';
import { useOllamaSettings } from '@/hooks/useLocalLlmSettings';
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

// Ollama アプリの起動・終了やモデルの読み込みに追従する
const STATUS_POLL_MS = 5000;

/** Ollama の接続設定。モデルの選択は「ローカルLLM」欄で行う */
export function OllamaSection() {
  const { settings, setSettings } = useOllamaSettings();
  const [baseUrl, setBaseUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [account, setAccount] = useState<OllamaAccountStatus | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) setBaseUrl(settings.baseUrl);
  }, [settings]);

  const save = useCallback(
    async (next: OllamaSettings): Promise<boolean> => {
      setSaving(true);
      try {
        setSettings(await putJson<OllamaSettings>('/api/settings/ollama', next));
        return true;
      } catch (error) {
        toaster.create({
          type: 'error',
          title: 'Ollama の設定を保存できませんでした',
          description: errorMessage(error),
        });
        return false;
      } finally {
        setSaving(false);
      }
    },
    [setSettings]
  );

  const fetchStatus = useCallback(async (url: string) => {
    try {
      setStatus(
        await requestData<OllamaStatus>(
          `/api/settings/ollama/status?baseUrl=${encodeURIComponent(url)}`
        )
      );
    } catch (error) {
      console.error('Failed to fetch Ollama status:', error);
    }
  }, []);

  // WebSearch を Ollama に代行させる場合、ollama.com のサインイン状態で可否が決まる
  const fetchAccount = useCallback(async (url: string) => {
    setAccountLoading(true);
    setAccountError(null);
    try {
      setAccount(
        await requestData<OllamaAccountStatus>(
          `/api/settings/ollama/account?baseUrl=${encodeURIComponent(url)}`
        )
      );
    } catch (error) {
      setAccount(null);
      setAccountError(errorMessage(error));
    } finally {
      setAccountLoading(false);
    }
  }, []);

  const enabled = settings?.enabled === true;
  const savedBaseUrl = settings?.baseUrl;
  useEffect(() => {
    if (!enabled || !savedBaseUrl) return;
    void fetchStatus(savedBaseUrl);
    void fetchAccount(savedBaseUrl);
    const timer = setInterval(() => void fetchStatus(savedBaseUrl), STATUS_POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, savedBaseUrl, fetchStatus, fetchAccount]);

  const handleSave = useCallback(async () => {
    if (!settings) return;
    if (await save({ ...settings, baseUrl })) {
      toaster.create({ type: 'success', title: 'Ollama の設定を保存しました' });
    }
  }, [settings, baseUrl, save]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ollama</CardTitle>
        <CardDescription>
          ローカルLLMのプロバイダーとして Ollama を使います。Ollama のインストール・モデルの
          pull・起動はご自身で行ってください（例:{' '}
          <Code>ollama pull qwen3.6:35b-a3b-coding-nvfp4</Code>）。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!settings ? (
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
            <OllamaIcon className="size-4" />
            Ollama を有効化する
          </Button>
        ) : (
          <>
            <StatusRow>
              {!status ? (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  確認中...
                </span>
              ) : status.reachable ? (
                <>
                  <span className="flex items-center gap-2 text-success">
                    <CheckCircle2 className="size-4" />
                    接続中{status.version && ` (v${status.version})`}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {status.loaded.length > 0
                      ? `読み込み中: ${status.loaded
                          .map(
                            (l) =>
                              `${l.name}${l.contextLength ? ` (${formatContextLength(l.contextLength)})` : ''}`
                          )
                          .join(', ')}`
                      : '読み込み中のモデルなし'}
                  </span>
                </>
              ) : (
                <span className="flex items-center gap-2 text-warning">
                  <TriangleAlert className="size-4" />
                  Ollama に接続できません。Ollama アプリを起動してください
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => void save({ ...settings, enabled: false })}
                disabled={saving}
              >
                無効にする
              </Button>
            </StatusRow>

            <Field
              label="ollama.com（WebSearch を Ollama に代行させる場合）"
              hint={
                <>
                  「Claude Code のローカルLLM」欄の WebSearch
                  を「ollama.com」にした場合のみ必要です。Ollama を動かしているマシンで{' '}
                  <Code>ollama signin</Code> を実行してください（検索クエリは ollama.com
                  に送信されます）。
                </>
              }
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {accountLoading ? (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    確認中...
                  </span>
                ) : account?.signedIn ? (
                  <span className="flex items-center gap-2 text-success">
                    <Globe className="size-4" />
                    サインイン済み（{account.name}）
                  </span>
                ) : account ? (
                  <>
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <TriangleAlert className="size-4" />
                      未サインイン
                    </span>
                    {account.signinUrl && (
                      <a
                        href={account.signinUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={buttonVariants({ variant: 'outline', size: 'sm' })}
                      >
                        <ExternalLink />
                        サインイン
                      </a>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-destructive">{accountError}</span>
                )}
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => void fetchAccount(settings.baseUrl)}
                  disabled={accountLoading}
                  title="サインイン状態を再確認"
                >
                  <RefreshCw className={accountLoading ? 'animate-spin' : undefined} />
                </Button>
              </div>
            </Field>

            <AdvancedSettings>
              <Field
                label="Base URL"
                hint={
                  <>
                    Docker で tsunagi を動かしている場合は{' '}
                    <Code>http://host.docker.internal:11434</Code>
                  </>
                }
              >
                <div className="flex items-center gap-2">
                  <Input
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="http://localhost:11434"
                  />
                  <Button
                    size="default"
                    onClick={() => void handleSave()}
                    disabled={saving || baseUrl === settings.baseUrl}
                  >
                    保存
                  </Button>
                </div>
              </Field>
            </AdvancedSettings>
          </>
        )}
      </CardContent>
    </Card>
  );
}
