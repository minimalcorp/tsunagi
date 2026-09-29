'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CircleHelp, Download, Loader2, Trash2 } from 'lucide-react';
import type { AsrModelEntry, AsrModelList } from '@minimalcorp/tsunagi-shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { apiUrl } from '@/lib/api-url';
import { toaster } from '@/lib/toaster';
import { cn } from '@/lib/utils';

interface ServerState {
  step: string;
  modelId: string | null;
  downloadProgress?: { downloadedBytes: number; totalBytes: number };
}

interface AsrModelSelectorProps {
  serverInfo: ServerState | null;
  /** モデル切り替えでサーバーが再起動した場合などに、親にサーバー状態の再取得を促す */
  onServerChanged: () => void;
}

const SERVER_UP_STEPS = ['running', 'running_external'];

function formatSize(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

async function requestModels(path: string, init?: RequestInit): Promise<AsrModelList> {
  const res = await fetch(apiUrl(path), init);
  const body = (await res.json().catch(() => null)) as { data?: AsrModelList; error?: string };
  if (!res.ok || !body?.data) throw new Error(body?.error || `HTTPエラー: ${res.status}`);
  return body.data;
}

export function AsrModelSelector({ serverInfo, onServerChanged }: AsrModelSelectorProps) {
  const [list, setList] = useState<AsrModelList | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const fetchModels = useCallback(async () => {
    try {
      setList(await requestModels('/api/whisper/models'));
    } catch (error) {
      console.error('Failed to fetch ASR models:', error);
    }
  }, []);

  // ダウンロード完了などサーバーの状態が変わるたびに、ダウンロード済み表示を更新する
  const step = serverInfo?.step;
  useEffect(() => {
    void fetchModels();
  }, [fetchModels, step]);

  const run = useCallback(
    async (id: string, path: string, init: RequestInit, errorTitle: string) => {
      setPendingId(id);
      try {
        setList(await requestModels(path, init));
        onServerChanged();
      } catch (error) {
        toaster.create({
          type: 'error',
          title: errorTitle,
          description: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setPendingId(null);
      }
    },
    [onServerChanged]
  );

  const handleSelect = useCallback(
    (model: AsrModelEntry) =>
      run(
        model.id,
        '/api/whisper/models/selected',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelId: model.id }),
        },
        'モデルを切り替えられませんでした'
      ),
    [run]
  );

  const handleDelete = useCallback(
    (model: AsrModelEntry) =>
      run(
        model.id,
        `/api/whisper/models/${encodeURIComponent(model.id)}`,
        { method: 'DELETE' },
        'モデルを削除できませんでした'
      ),
    [run]
  );

  if (!list) {
    return (
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        モデル一覧を読み込み中...
      </span>
    );
  }

  const settingUp = serverInfo !== null && !SERVER_UP_STEPS.includes(serverInfo.step);
  const busy = pendingId !== null || serverInfo?.step === 'downloading_model';

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">音声認識モデル</span>
      {list.models.map((model) => {
        const selected = model.id === list.selectedModelId;
        const loaded =
          serverInfo?.modelId === model.id && SERVER_UP_STEPS.includes(serverInfo.step);
        const downloading =
          serverInfo?.modelId === model.id && serverInfo.step === 'downloading_model';
        const progress = downloading ? serverInfo?.downloadProgress : undefined;
        const inUse = serverInfo?.modelId === model.id;

        return (
          <div
            key={model.id}
            className={cn(
              'flex flex-col gap-2 rounded-md border p-3 transition-colors duration-[130ms]',
              selected ? 'border-primary bg-accent/40' : 'border-border'
            )}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-not-allowed"
                onClick={() => void handleSelect(model)}
                disabled={selected || busy}
              >
                <span
                  className={cn(
                    'size-3.5 shrink-0 rounded-full border',
                    selected ? 'border-4 border-primary' : 'border-input'
                  )}
                />
                <span className="truncate text-sm font-medium">{model.label}</span>
              </button>
              <span
                className="text-muted-foreground"
                title={`${model.description}\nライセンス: ${model.license}\n${model.repo}`}
              >
                <CircleHelp className="size-4" />
              </span>
              <span className="text-xs text-muted-foreground">
                {formatSize(model.expectedBytes)}
              </span>
              {loaded ? (
                <Badge variant="default">
                  <CheckCircle2 />
                  使用中
                </Badge>
              ) : model.installed ? (
                <Badge variant="secondary">取得済み</Badge>
              ) : (
                <Badge variant="outline" title="選択して起動すると自動でダウンロードされます">
                  <Download />
                  未取得
                </Badge>
              )}
              {model.installed && !inUse && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => void handleDelete(model)}
                  disabled={busy}
                  title="ダウンロード済みのモデルを削除"
                >
                  <Trash2 />
                </Button>
              )}
              {pendingId === model.id && <Loader2 className="size-4 animate-spin" />}
            </div>
            {progress && (
              <div className="flex flex-col gap-1">
                <Progress value={(progress.downloadedBytes / progress.totalBytes) * 100} />
                <span className="text-[0.65rem] text-muted-foreground">
                  {formatSize(progress.downloadedBytes)} / {formatSize(progress.totalBytes)}
                </span>
              </div>
            )}
            {selected && settingUp && serverInfo?.modelId === model.id && !downloading && (
              <span className="flex items-center gap-2 text-[0.65rem] text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                準備中...
              </span>
            )}
          </div>
        );
      })}
      <p className="text-[0.65rem] text-muted-foreground">
        サーバー起動中に切り替えると、選択したモデルで再起動します(未取得の場合はダウンロードから行います)。
      </p>
    </div>
  );
}
