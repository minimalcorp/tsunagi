'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CircleHelp, Loader2, RefreshCw } from 'lucide-react';
import type { OllamaSettings } from '@minimalcorp/tsunagi-shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { OllamaIcon } from '@/components/icons/BrandIcons';
import { useOllamaSettings } from '@/hooks/useOllamaSettings';
import { apiUrl } from '@/lib/api-url';
import { toaster } from '@/lib/toaster';

const MODELS_DATALIST_ID = 'ollama-models';

/** extraEnv を「KEY=VALUE」行のテキストに変換する */
function envToText(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

/** 「KEY=VALUE」行のテキストを extraEnv に変換する（空行・# 始まりは無視） */
function textToEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

interface FormState {
  baseUrl: string;
  model: string;
  contextTokens: string;
  extraEnvText: string;
}

function toFormState(settings: OllamaSettings): FormState {
  return {
    baseUrl: settings.baseUrl,
    model: settings.model,
    contextTokens: String(settings.contextTokens),
    extraEnvText: envToText(settings.extraEnv),
  };
}

export function OllamaSection() {
  const { settings, setSettings } = useOllamaSettings();
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  // 取得した設定でフォームを初期化する（保存後もサーバーの正規化結果に揃える）
  useEffect(() => {
    if (settings) setForm(toFormState(settings));
  }, [settings]);

  const save = useCallback(
    async (next: OllamaSettings): Promise<boolean> => {
      setSaving(true);
      try {
        const res = await fetch(apiUrl('/api/settings/ollama'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        });
        const body = (await res.json().catch(() => null)) as {
          data?: OllamaSettings;
          error?: string;
        } | null;
        if (!res.ok || !body?.data) throw new Error(body?.error || `HTTPエラー: ${res.status}`);
        setSettings(body.data);
        return true;
      } catch (error) {
        toaster.create({
          type: 'error',
          title: 'Ollama の設定を保存できませんでした',
          description: error instanceof Error ? error.message : String(error),
        });
        return false;
      } finally {
        setSaving(false);
      }
    },
    [setSettings]
  );

  const fetchModels = useCallback(async (baseUrl: string) => {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const res = await fetch(
        apiUrl(`/api/settings/ollama/models?baseUrl=${encodeURIComponent(baseUrl)}`)
      );
      const body = (await res.json().catch(() => null)) as {
        data?: { models: string[] };
        error?: string;
      } | null;
      if (!res.ok || !body?.data) throw new Error(body?.error || `HTTPエラー: ${res.status}`);
      setModels(body.data.models);
    } catch (error) {
      setModels([]);
      setModelsError(error instanceof Error ? error.message : String(error));
    } finally {
      setModelsLoading(false);
    }
  }, []);

  // 有効化済みなら、pull 済みモデルの候補を一度取得しておく
  const enabled = settings?.enabled === true;
  const savedBaseUrl = settings?.baseUrl;
  useEffect(() => {
    if (enabled && savedBaseUrl) void fetchModels(savedBaseUrl);
  }, [enabled, savedBaseUrl, fetchModels]);

  const handleEnable = useCallback(async () => {
    if (!settings) return;
    if (await save({ ...settings, enabled: true })) {
      toaster.create({ type: 'success', title: 'Ollama を有効化しました' });
    }
  }, [settings, save]);

  const handleDisable = useCallback(() => {
    if (settings) void save({ ...settings, enabled: false });
  }, [settings, save]);

  const handleSave = useCallback(async () => {
    if (!form) return;
    const saved = await save({
      enabled: true,
      baseUrl: form.baseUrl,
      model: form.model,
      contextTokens: Number(form.contextTokens),
      extraEnv: textToEnv(form.extraEnvText),
    });
    if (saved) toaster.create({ type: 'success', title: 'Ollama の設定を保存しました' });
  }, [form, save]);

  const updateForm = (patch: Partial<FormState>) =>
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-1">
          <CardTitle>Ollama (実験的機能)</CardTitle>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setModalOpen(true)}
            title="Ollama について"
          >
            <CircleHelp />
          </Button>
        </div>
        <CardDescription>
          Ollama のローカルLLMで Claude Code を起動できるようにします。
          <strong className="font-medium text-foreground">
            有効にすると、タスク詳細画面に Ollama タブの作成ボタンが表示されます
          </strong>
          。Ollama のインストール・モデルの pull・起動はご自身で行ってください。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!settings || !form ? (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            読み込み中...
          </span>
        ) : !enabled ? (
          <Button size="default" onClick={() => void handleEnable()} disabled={saving}>
            <OllamaIcon className="size-4" />
            Ollama を有効化する
          </Button>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-2 text-success">
                <CheckCircle2 className="size-4" />
                Ollama: 有効
              </span>
              {!settings.model && (
                <span className="text-xs text-warning">モデルを設定すると利用できます</span>
              )}
              <Button size="default" variant="outline" onClick={handleDisable} disabled={saving}>
                無効にする
              </Button>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Base URL
              </label>
              <Input
                value={form.baseUrl}
                onChange={(e) => updateForm({ baseUrl: e.target.value })}
                placeholder="http://localhost:11434"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">モデル</label>
              <div className="flex items-center gap-2">
                <Input
                  value={form.model}
                  onChange={(e) => updateForm({ model: e.target.value })}
                  placeholder="qwen3.8:27b"
                  list={MODELS_DATALIST_ID}
                />
                <datalist id={MODELS_DATALIST_ID}>
                  {models.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => void fetchModels(form.baseUrl)}
                  disabled={modelsLoading}
                  title="pull 済みのモデル一覧を取得"
                >
                  <RefreshCw className={modelsLoading ? 'animate-spin' : undefined} />
                </Button>
              </div>
              {modelsError ? (
                <p className="mt-1 text-[0.65rem] text-destructive">{modelsError}</p>
              ) : (
                <p className="mt-1 text-[0.65rem] text-muted-foreground">
                  pull 済みのモデルは候補から選べます（{models.length}件）。
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                コンテキスト長 (tokens)
              </label>
              <Input
                type="number"
                min={1}
                value={form.contextTokens}
                onChange={(e) => updateForm({ contextTokens: e.target.value })}
              />
              <p className="mt-1 text-[0.65rem] text-muted-foreground">
                Ollama 側のコンテキスト長と同じ値にしてください。Claude Code
                の自動compactの判定に使います（64k以上を推奨）。
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                追加の環境変数 (任意)
              </label>
              <Textarea
                value={form.extraEnvText}
                onChange={(e) => updateForm({ extraEnvText: e.target.value })}
                placeholder="KEY=VALUE（1行に1つ）"
                className="min-h-16 font-mono text-xs"
              />
              <p className="mt-1 text-[0.65rem] text-muted-foreground">
                Ollama タブにのみ適用されます。同名の既定値より優先されます。
              </p>
            </div>

            <div>
              <Button size="default" onClick={() => void handleSave()} disabled={saving}>
                {saving && <Loader2 className="animate-spin" />}
                保存
              </Button>
            </div>
          </>
        )}
      </CardContent>

      <Dialog
        open={modalOpen}
        onOpenChange={({ open }) => setModalOpen(open)}
        title="Ollama について"
        maxWidth="2xl"
      >
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-medium text-foreground">実験的機能です</p>
            <p className="text-muted-foreground">
              Claude Code の接続先を Ollama の Anthropic 互換 API (Ollama v0.14.0以降)
              に切り替えて起動します。Anthropic
              はClaude以外のモデルへの接続をサポートしていないため、動作は保証されません。WebSearch
              は利用できません。
            </p>
          </div>

          <div>
            <p className="mb-1 font-medium text-foreground">セットアップ</p>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>
                Ollama をインストールする（
                <a
                  href="https://ollama.com/download"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  ollama.com
                </a>
                のアプリ、または <code className="rounded bg-muted px-1">brew install ollama</code>
                ）
              </li>
              <li>
                モデルを pull する（例:{' '}
                <code className="rounded bg-muted px-1">ollama pull qwen3.8:27b</code>）
              </li>
              <li>
                コンテキスト長を 64k 以上にする。アプリは設定画面のスライダー、CLI は{' '}
                <code className="rounded bg-muted px-1">
                  OLLAMA_CONTEXT_LENGTH=65536 ollama serve
                </code>{' '}
                で起動する。既定値（VRAM 24GiB 未満は 4k）のままだと tool call が壊れます
              </li>
              <li>ここで有効化し、モデルとコンテキスト長を設定して保存する</li>
            </ol>
          </div>

          <div>
            <p className="font-medium text-foreground">Docker で tsunagi を動かしている場合</p>
            <p className="text-muted-foreground">
              Base URL は{' '}
              <code className="rounded bg-muted px-1">http://host.docker.internal:11434</code>{' '}
              を指定してください。
            </p>
          </div>

          <div>
            <p className="font-medium text-foreground">注意</p>
            <p className="text-muted-foreground">
              <code className="rounded bg-muted px-1">~/.claude/settings.json</code> の{' '}
              <code className="rounded bg-muted px-1">env</code> に{' '}
              <code className="rounded bg-muted px-1">ANTHROPIC_*</code>{' '}
              を設定している場合、そちらが優先され Ollama
              に接続されません。設定の変更は、新しく作成した Ollama タブから反映されます。
            </p>
          </div>
        </div>
      </Dialog>
    </Card>
  );
}
