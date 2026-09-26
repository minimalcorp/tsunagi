'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CircleHelp,
  Loader2,
  PackageX,
  RotateCw,
  Square,
} from 'lucide-react';
import type { SearxngSettings, SearxngStatus } from '@minimalcorp/tsunagi-shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/input';
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

// Ollama / LM Studio の有効化に合わせた自動起動・停止に追従する
const STATUS_POLL_MS = 3000;

const DOCS_URL = 'https://docs.searxng.org/admin/installation.html';
const DOCKER_DOCS_URL = 'https://minimalcorp.github.io/tsunagi/ja/features/local-search/';

interface FormState {
  port: string;
  binPath: string;
  settingsPath: string;
}

/**
 * ローカル検索（SearXNG）。Ollama / LM Studio のどちらかが有効なときだけ表示する。
 * 起動・停止は tsunagi が自動で行うため、ここは状態の確認と再起動・詳細設定のみ。
 */
export function SearxngSection() {
  const [status, setStatus] = useState<SearxngStatus | null>(null);
  const [settings, setSettings] = useState<SearxngSettings | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      setStatus(await requestData<SearxngStatus>('/api/settings/searxng/status'));
    } catch (error) {
      console.error('Failed to fetch SearXNG status:', error);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
    requestData<SearxngSettings>('/api/settings/searxng')
      .then(setSettings)
      .catch((error: unknown) => console.error('Failed to fetch SearXNG settings:', error));
    const timer = setInterval(() => void fetchStatus(), STATUS_POLL_MS);
    return () => clearInterval(timer);
  }, [fetchStatus]);

  useEffect(() => {
    if (settings) {
      setForm({
        port: String(settings.port),
        binPath: settings.binPath,
        settingsPath: settings.settingsPath,
      });
    }
  }, [settings]);

  const post = useCallback(async (path: string, failTitle: string) => {
    setBusy(true);
    try {
      setStatus(await requestData<SearxngStatus>(path, { method: 'POST' }));
    } catch (error) {
      toaster.create({ type: 'error', title: failTitle, description: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!form) return;
    setBusy(true);
    try {
      setSettings(
        await putJson<SearxngSettings>('/api/settings/searxng', {
          port: Number(form.port),
          binPath: form.binPath,
          settingsPath: form.settingsPath,
        })
      );
    } catch (error) {
      toaster.create({
        type: 'error',
        title: 'SearXNG の設定を保存できませんでした',
        description: errorMessage(error),
      });
      setBusy(false);
      return;
    }
    setBusy(false);
    // 新しい設定で起動し直す
    await post('/api/settings/searxng/restart', 'SearXNG を再起動できません');
  }, [form, post]);

  if (!status?.required) return null;

  const updateForm = (patch: Partial<FormState>) =>
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-1">
          <CardTitle>ローカル検索 (SearXNG)</CardTitle>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setModalOpen(true)}
            title="ローカル検索について"
          >
            <CircleHelp />
          </Button>
        </div>
        <CardDescription>
          Ollama / LM Studio タブの WebSearch をローカルの SearXNG で行います。
          <strong className="font-medium text-foreground">
            Ollama か LM Studio が有効な間、tsunagi が自動で起動・停止します
          </strong>
          。SearXNG のインストールはご自身で行ってください。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <StatusRow>
          {status.state === 'running' || status.state === 'external' ? (
            <>
              <span className="flex items-center gap-2 text-success">
                <CheckCircle2 className="size-4" />
                {status.state === 'running' ? '起動中' : '起動中（tsunagi 外で起動）'}
              </span>
              <span className="font-mono text-xs text-muted-foreground">{status.url}</span>
            </>
          ) : status.state === 'starting' ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              起動中...
            </span>
          ) : status.state === 'not-installed' ? (
            <span className="flex items-center gap-2 text-warning">
              <PackageX className="size-4" />
              SearXNG が見つかりません（<Code>searxng-run</Code>）
            </span>
          ) : status.state === 'error' ? (
            <span className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-4" />
              エラー
            </span>
          ) : (
            <span className="text-muted-foreground">停止中</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {status.state !== 'external' && status.state !== 'starting' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void post('/api/settings/searxng/restart', 'SearXNG を起動できません')
                }
                disabled={busy}
              >
                <RotateCw />
                {status.state === 'running' ? '再起動' : '起動'}
              </Button>
            )}
            {status.state === 'running' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void post('/api/settings/searxng/stop', 'SearXNG を停止できません')}
                disabled={busy}
              >
                <Square />
                停止
              </Button>
            )}
          </div>
        </StatusRow>

        {status.state === 'error' && status.error && (
          <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 text-[0.65rem] whitespace-pre-wrap text-destructive">
            {status.error}
          </pre>
        )}

        {status.state === 'not-installed' && (
          <p className="text-xs text-muted-foreground">
            nix なら <Code>nix profile install nixpkgs#searxng</Code> などで{' '}
            <Code>searxng-run</Code> を PATH に入れてください（
            <a href={DOCS_URL} target="_blank" rel="noreferrer" className="underline">
              インストール方法
            </a>
            ）。PATH にない場合は詳細設定でパスを指定できます。Docker で起動する場合は{' '}
            <Code>{status.url}</Code> で公開し、settings.yml の search.formats に json
            を含めてください（
            <a href={DOCKER_DOCS_URL} target="_blank" rel="noreferrer" className="underline">
              手順
            </a>
            ）。
          </p>
        )}

        {form && (
          <AdvancedSettings>
            <Field label="ポート" hint="既定は 7964（キーパッドで sxng）">
              <Input
                type="number"
                min={1}
                max={65535}
                value={form.port}
                onChange={(e) => updateForm({ port: e.target.value })}
                className="font-mono"
              />
            </Field>
            <Field label="searxng-run のパス (任意)" hint="空欄なら PATH から探します">
              <Input
                value={form.binPath}
                onChange={(e) => updateForm({ binPath: e.target.value })}
                placeholder={status.binPath ?? 'searxng-run'}
                className="font-mono"
              />
            </Field>
            <Field
              label="settings.yml のパス (任意)"
              hint="空欄なら tsunagi が生成したもの（~/.tsunagi/searxng/settings.yml）を使います。独自のものを使う場合は search.formats に json を含めてください"
            >
              <Input
                value={form.settingsPath}
                onChange={(e) => updateForm({ settingsPath: e.target.value })}
                className="font-mono"
              />
            </Field>
            <div>
              <Button size="default" onClick={() => void handleSave()} disabled={busy}>
                {busy && <Loader2 className="animate-spin" />}
                保存して再起動
              </Button>
            </div>
          </AdvancedSettings>
        )}
      </CardContent>

      <Dialog
        open={modalOpen}
        onOpenChange={({ open }) => setModalOpen(open)}
        title="ローカル検索について"
        maxWidth="2xl"
      >
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-medium text-foreground">仕組み</p>
            <p className="text-muted-foreground">
              Claude Code の WebSearch は Anthropic
              のサーバーツールのため、ローカルLLMでは使えません（LM Studio は無視し、Ollama は
              ollama.com のサインインが必要）。ローカル検索を使うタブでは WebSearch
              を無効化し、tsunagi の MCP が提供する <Code>web_search</Code> ツールで SearXNG
              に検索させます。
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">自動起動・停止</p>
            <p className="text-muted-foreground">
              Ollama か LM Studio が有効なら、tsunagi の起動時・有効化時に SearXNG
              を起動し、両方を無効にしたときと tsunagi の終了時に停止します。既にポートで SearXNG
              が動いていればそれを使います（tsunagi は止めません）。SearXNG がなくても tsunagi
              自体は通常どおり動きます。
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">注意</p>
            <p className="text-muted-foreground">
              SearXNG は Google / Bing / DuckDuckGo
              などの検索エンジンに問い合わせます。短時間に大量に検索すると、検索エンジン側で一時的にブロックされることがあります。
            </p>
          </div>
        </div>
      </Dialog>
    </Card>
  );
}
