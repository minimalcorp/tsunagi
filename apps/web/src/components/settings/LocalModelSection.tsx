'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CircleHelp,
  Cpu,
  Loader2,
  MemoryStick,
  Play,
  PowerOff,
  RefreshCw,
} from 'lucide-react';
import type {
  LmStudioEstimate,
  LocalLlmModel,
  LocalLlmProvider,
  LocalLlmSettings,
  LocalLlmStatus,
} from '@minimalcorp/tsunagi-shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Combobox } from '@/components/ui/Combobox';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LocalLlmIcon } from '@/components/icons/BrandIcons';
import { useLocalLlmSettings } from '@/hooks/useLocalLlmSettings';
import { formatContextLength, parseContextLength } from '@/lib/context-length';
import { toaster } from '@/lib/toaster';
import { ContextLengthInput, isValidContextLength } from './ContextLengthInput';
import {
  AdvancedSettings,
  Code,
  Field,
  StatusRow,
  envToText,
  errorMessage,
  formatBytes,
  putJson,
  requestData,
  textToEnv,
} from './local-llm-ui';

// 読み込み中・自動解放・他の画面での操作に追従する
const STATUS_POLL_MS = 3000;
const ESTIMATE_DEBOUNCE_MS = 600;

const PROVIDER_LABEL: Record<LocalLlmProvider, string> = {
  ollama: 'Ollama',
  lmstudio: 'LM Studio',
};

interface ModelsResponse {
  models: LocalLlmModel[];
  errors: Array<{ provider: LocalLlmProvider; message: string }>;
}

interface FormState {
  /** `${provider}:${model}`。未選択は空文字 */
  selection: string;
  context: string;
  idleUnloadMinutes: string;
  unloadOnExit: boolean;
  webSearch: LocalLlmSettings['webSearch'];
  extraEnvText: string;
}

function selectionOf(provider: LocalLlmProvider, model: string): string {
  return `${provider}:${model}`;
}

function parseSelection(selection: string): { provider: LocalLlmProvider; model: string } | null {
  const idx = selection.indexOf(':');
  if (idx < 0) return null;
  const provider = selection.slice(0, idx);
  if (provider !== 'ollama' && provider !== 'lmstudio') return null;
  return { provider, model: selection.slice(idx + 1) };
}

function toFormState(settings: LocalLlmSettings): FormState {
  return {
    selection: settings.active ? selectionOf(settings.active.provider, settings.active.model) : '',
    context: formatContextLength(settings.active?.contextTokens ?? 65536),
    idleUnloadMinutes: String(settings.idleUnloadMinutes),
    unloadOnExit: settings.unloadOnExit,
    webSearch: settings.webSearch,
    extraEnvText: envToText(settings.extraEnv),
  };
}

function modelLabel(m: LocalLlmModel): string {
  return [
    m.displayName,
    m.format.toUpperCase(),
    m.sizeBytes ? formatBytes(m.sizeBytes) : null,
    m.maxContextLength ? `最大 ${formatContextLength(m.maxContextLength)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** 状態の行の表示 */
function StateLabel({ status }: { status: LocalLlmStatus }) {
  const model = status.active
    ? `${status.active.model}（${PROVIDER_LABEL[status.active.provider]}・${formatContextLength(status.active.contextTokens)}）`
    : '';
  switch (status.state) {
    case 'unconfigured':
      return <span className="text-muted-foreground">使用するモデルが未設定です</span>;
    case 'loading':
      return (
        <span className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          読み込み中: {model}
        </span>
      );
    case 'loaded':
      return (
        <span className="flex items-center gap-2 text-success">
          <CheckCircle2 className="size-4" />
          読み込み済み: {model}
        </span>
      );
    case 'unloaded':
      return (
        <span className="flex items-center gap-2 text-muted-foreground">
          <MemoryStick className="size-4" />
          解放済み: {model}（次の発言で読み込みます）
        </span>
      );
    case 'error':
      return (
        <span className="flex items-center gap-2 text-destructive">
          <AlertCircle className="size-4" />
          {status.error}
        </span>
      );
  }
}

/**
 * ローカルLLM（実験的機能）。使用中のモデルを1つだけ選び、全てのローカルLLMタブで共有する。
 * メモリに載せるモデルは Ollama / LM Studio をまたいで常に1つ。
 */
export function LocalModelSection() {
  const { settings, setSettings } = useLocalLlmSettings();
  const [form, setForm] = useState<FormState | null>(null);
  const [status, setStatus] = useState<LocalLlmStatus | null>(null);
  const [models, setModels] = useState<ModelsResponse | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [estimate, setEstimate] = useState<LmStudioEstimate | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (settings) setForm(toFormState(settings));
  }, [settings]);

  const fetchStatus = useCallback(async () => {
    try {
      setStatus(await requestData<LocalLlmStatus>('/api/settings/local-llm/status'));
    } catch (error) {
      console.error('Failed to fetch local LLM status:', error);
    }
  }, []);

  const fetchModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      setModels(await requestData<ModelsResponse>('/api/settings/local-llm/models'));
    } catch (error) {
      toaster.create({
        type: 'error',
        title: 'モデル一覧を取得できません',
        description: errorMessage(error),
      });
    } finally {
      setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
    void fetchModels();
    const timer = setInterval(() => void fetchStatus(), STATUS_POLL_MS);
    return () => clearInterval(timer);
  }, [fetchStatus, fetchModels]);

  const selected = form ? parseSelection(form.selection) : null;
  const selectedModel = useMemo(
    () =>
      models?.models.find((m) => m.provider === selected?.provider && m.model === selected?.model),
    [models, selected?.provider, selected?.model]
  );
  const maxContext = selectedModel?.maxContextLength ?? undefined;

  // LM Studio のモデルは必要メモリを見積もる（入力中は待つ）
  const estimateModel = selected?.provider === 'lmstudio' ? selected.model : '';
  const estimateTokens = form ? parseContextLength(form.context) : null;
  useEffect(() => {
    setEstimate(null);
    if (!estimateModel || !estimateTokens) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const query = new URLSearchParams({
        model: estimateModel,
        contextTokens: String(estimateTokens),
      });
      requestData<LmStudioEstimate>(`/api/settings/local-llm/estimate?${query}`, {
        signal: controller.signal,
      })
        .then(setEstimate)
        .catch(() => setEstimate(null));
    }, ESTIMATE_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [estimateModel, estimateTokens]);

  const idleMinutes = Number(form?.idleUnloadMinutes);
  const formValid =
    form !== null &&
    isValidContextLength(form.context, maxContext) &&
    Number.isInteger(idleMinutes) &&
    idleMinutes >= 0;

  const handleSave = useCallback(async () => {
    if (!form || !formValid) return;
    const target = parseSelection(form.selection);
    const next: LocalLlmSettings = {
      active: target
        ? { ...target, contextTokens: parseContextLength(form.context) ?? 65536 }
        : null,
      idleUnloadMinutes: Number(form.idleUnloadMinutes),
      unloadOnExit: form.unloadOnExit,
      webSearch: form.webSearch,
      extraEnv: textToEnv(form.extraEnvText),
    };
    const modelChanged = JSON.stringify(settings?.active) !== JSON.stringify(next.active);
    setSaving(true);
    try {
      setSettings(await putJson<LocalLlmSettings>('/api/settings/local-llm', next));
      toaster.create({
        type: 'success',
        title: modelChanged
          ? '使用するモデルを切り替えました（他のモデルは解放します）'
          : 'ローカルLLMの設定を保存しました',
      });
      void fetchStatus();
    } catch (error) {
      toaster.create({
        type: 'error',
        title: 'ローカルLLMの設定を保存できませんでした',
        description: errorMessage(error),
      });
    } finally {
      setSaving(false);
    }
  }, [form, formValid, settings?.active, setSettings, fetchStatus]);

  const runAction = useCallback(async (path: string, failTitle: string) => {
    setBusy(true);
    try {
      setStatus(await requestData<LocalLlmStatus>(path, { method: 'POST' }));
    } catch (error) {
      toaster.create({ type: 'error', title: failTitle, description: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }, []);

  const updateForm = (patch: Partial<FormState>) =>
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));

  const options = (models?.models ?? []).map((m) => ({
    value: selectionOf(m.provider, m.model),
    label: modelLabel(m),
    group: PROVIDER_LABEL[m.provider],
  }));
  // 保存済みのモデルが一覧にない（プロバイダーに接続できない等）場合も、選択中として表示する
  const active = settings?.active;
  if (active && !options.some((o) => o.value === selectionOf(active.provider, active.model))) {
    options.unshift({
      value: selectionOf(active.provider, active.model),
      label: `${active.model}（一覧にありません）`,
      group: PROVIDER_LABEL[active.provider],
    });
  }
  const noProvider = models !== null && models.models.length === 0 && models.errors.length === 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-1">
          <CardTitle>Claude Code のローカルLLM (実験的機能)</CardTitle>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setModalOpen(true)}
            title="ローカルLLMについて"
          >
            <CircleHelp />
          </Button>
        </div>
        <CardDescription>
          Ollama / LM Studio のローカルLLMで Claude Code を起動します。
          <strong className="font-medium text-foreground">
            使用するモデルは1つだけで、全てのローカルLLMタブで共有します
          </strong>
          。切り替えると他のモデルはメモリから解放されます。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!settings || !form ? (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            読み込み中...
          </span>
        ) : (
          <>
            <StatusRow>
              {status ? (
                <StateLabel status={status} />
              ) : (
                <Loader2 className="size-4 animate-spin" />
              )}
              <div className="ml-auto flex items-center gap-2">
                {status?.state === 'unloaded' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void runAction('/api/settings/local-llm/load', 'モデルを読み込めません')
                    }
                    disabled={busy}
                  >
                    <Play />
                    読み込む
                  </Button>
                )}
                {(status?.state === 'loaded' || status?.state === 'error') && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void runAction('/api/settings/local-llm/unload', 'モデルを解放できません')
                    }
                    disabled={busy || (status?.inflight ?? 0) > 0}
                    title="メモリから外す（次の発言で自動で読み込み直します）"
                  >
                    {busy ? <Loader2 className="animate-spin" /> : <PowerOff />}
                    解放
                  </Button>
                )}
              </div>
            </StatusRow>
            {status && status.inflight > 0 && (
              <p className="text-[0.65rem] text-muted-foreground">
                応答を生成中のタブがあります（{status.inflight}
                件）。完了するまでモデルは切り替えられません。
              </p>
            )}

            {noProvider ? (
              <p className="text-xs text-warning">
                下の Ollama / LM Studio のどちらかを有効にすると、モデルを選べるようになります。
              </p>
            ) : (
              <>
                <Field
                  label="使用するモデル"
                  hint={
                    models?.errors.length ? (
                      <span className="text-destructive">
                        {models.errors
                          .map((e) => `${PROVIDER_LABEL[e.provider]}: ${e.message}`)
                          .join(' / ')}
                      </span>
                    ) : (
                      `有効なプロバイダーにダウンロード済みのモデル（${models?.models.length ?? 0}件）`
                    )
                  }
                >
                  <div className="flex items-center gap-2">
                    <Combobox
                      options={options}
                      value={form.selection}
                      onChange={(value) => updateForm({ selection: String(value) })}
                      placeholder="モデルを選択"
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => void fetchModels()}
                      disabled={modelsLoading}
                      title="モデル一覧を再取得"
                    >
                      <RefreshCw className={modelsLoading ? 'animate-spin' : undefined} />
                    </Button>
                  </div>
                </Field>

                <Field label="コンテキスト長">
                  <ContextLengthInput
                    value={form.context}
                    onChange={(context) => updateForm({ context })}
                    max={maxContext}
                  />
                  {selected?.provider === 'lmstudio' && (
                    <p className="mt-1 flex items-center gap-1 text-[0.65rem] text-muted-foreground">
                      <Cpu className="size-3" />
                      必要メモリ（見積もり）: {estimate?.totalMemory ?? '-'}
                      {selectedModel?.format === 'mlx' &&
                        '。MLX はモデルの最大値で読み込まれ、メモリは使った分だけ増えます'}
                    </p>
                  )}
                  {selected?.provider === 'ollama' && (
                    <p className="mt-1 text-[0.65rem] text-muted-foreground">
                      このコンテキスト長を固定した派生モデル（
                      <Code>{'<モデル>-tsunagi-ctx<長さ>'}</Code>
                      ）を作成して使います（重みは共有されます）。
                    </p>
                  )}
                </Field>
              </>
            )}

            <Field
              label="自動解放（分）"
              hint="最後のリクエストからこの時間がたったらモデルをメモリから外します（0 で無効）。次の発言で自動で読み込み直します"
            >
              <Input
                type="number"
                min={0}
                value={form.idleUnloadMinutes}
                onChange={(e) => updateForm({ idleUnloadMinutes: e.target.value })}
                className="w-32 font-mono"
              />
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.unloadOnExit}
                onChange={(e) => updateForm({ unloadOnExit: e.target.checked })}
                className="size-4 accent-primary"
              />
              tsunagi の終了時にモデルを解放する
            </label>

            <Field label="WebSearch">
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={form.webSearch === 'local' ? 'default' : 'outline'}
                  onClick={() => updateForm({ webSearch: 'local' })}
                >
                  ローカル検索（SearXNG）
                </Button>
                <Button
                  size="sm"
                  variant={form.webSearch === 'ollama' ? 'default' : 'outline'}
                  onClick={() => updateForm({ webSearch: 'ollama' })}
                >
                  ollama.com（Ollama のみ・要サインイン）
                </Button>
              </div>
              <p className="mt-1 text-[0.65rem] text-muted-foreground">
                {form.webSearch === 'local'
                  ? '組み込みの WebSearch を無効化し、ローカル検索（SearXNG）の web_search ツールを使います。'
                  : '使用するモデルが Ollama のとき、Ollama が ollama.com の Web 検索 API で代行します（Ollama 欄でサインイン状態を確認できます）。LM Studio のときはローカル検索になります。'}
                設定はこの後に作成・起動したタブから反映されます。
              </p>
            </Field>

            <AdvancedSettings>
              <Field
                label="追加の環境変数 (任意)"
                hint="ローカルLLMタブにのみ適用されます。同名の既定値より優先されます"
              >
                <Textarea
                  value={form.extraEnvText}
                  onChange={(e) => updateForm({ extraEnvText: e.target.value })}
                  placeholder="KEY=VALUE（1行に1つ）"
                  className="min-h-16 font-mono text-xs"
                />
              </Field>
            </AdvancedSettings>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="default"
                onClick={() => void handleSave()}
                disabled={saving || !formValid}
              >
                {saving ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  selected && <LocalLlmIcon provider={selected.provider} className="size-4" />
                )}
                保存
              </Button>
              <span className="text-[0.65rem] text-muted-foreground">
                モデルを変えて保存すると、他のモデルを解放して読み込みを始めます
              </span>
            </div>
          </>
        )}
      </CardContent>

      <Dialog
        open={modalOpen}
        onOpenChange={({ open }) => setModalOpen(open)}
        title="ローカルLLMについて"
        maxWidth="2xl"
      >
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-medium text-foreground">実験的機能です</p>
            <p className="text-muted-foreground">
              Claude Code の接続先を tsunagi の中継口に切り替え、tsunagi が Ollama / LM Studio の
              Anthropic 互換 API に転送します。Anthropic
              はClaude以外のモデルへの接続をサポートしていないため、動作は保証されません。
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">モデルは1つだけ</p>
            <p className="text-muted-foreground">
              20〜30GB
              級のモデルを2つ同時にメモリへ載せられるマシンは少ないため、使用するモデルは1つにし、全てのローカルLLMタブで共有します。切り替えると他のモデルは解放され、各タブは次の発言で会話全体を新しいモデルで読み直します（数十秒〜数分）。
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">/model について</p>
            <p className="text-muted-foreground">
              ローカルLLMタブでは <Code>/model</Code>{' '}
              によるモデルの切り替えを無効にしています（Claude Code が切り替えたモデルを通常の
              Claude タブの既定値として保存してしまうため）。切り替えはここで行ってください。
            </p>
          </div>
        </div>
      </Dialog>
    </Card>
  );
}
