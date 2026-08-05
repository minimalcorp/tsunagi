'use client';

import type { ReactNode } from 'react';
import { CheckCircle2, Loader2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { SERVER_UP_STEPS, type LocalServerInfo } from '@/hooks/useInferenceServer';

function formatBytes(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 0.1) return `${gb.toFixed(2)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

function formatEta(seconds: number | null): string {
  if (seconds === null) return '残り時間を計算中...';
  if (seconds < 60) return `残り約${seconds}秒`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `残り約${min}分${sec}秒`;
}

interface LocalServerPanelProps {
  serverInfo: LocalServerInfo | null;
  startIcon: ReactNode;
  startLabel: string;
  startingServerLabel: string;
  downloadingLabel: string;
  notFoundLabel: string;
  onStart: () => void;
  onStop: () => void;
}

export function LocalServerPanel({
  serverInfo,
  startIcon,
  startLabel,
  startingServerLabel,
  downloadingLabel,
  notFoundLabel,
  onStart,
  onStop,
}: LocalServerPanelProps) {
  const progress = serverInfo?.downloadProgress;
  const progressPercent = progress ? (progress.downloadedBytes / progress.totalBytes) * 100 : 0;

  return (
    <div className="border-t border-border pt-4">
      {serverInfo && !serverInfo.serverDir && (
        <p className="mb-2 text-destructive">{notFoundLabel}</p>
      )}

      {(!serverInfo || serverInfo.step === 'not_running' || serverInfo.step === 'error') && (
        <div className="flex flex-col gap-2">
          <Button size="default" onClick={onStart} disabled={!serverInfo}>
            {serverInfo ? startIcon : <Loader2 className="animate-spin" />}
            {startLabel}
          </Button>
          {serverInfo?.step === 'error' && serverInfo.error && (
            <p className="text-xs/relaxed text-destructive">{serverInfo.error}</p>
          )}
        </div>
      )}

      {serverInfo?.step === 'installing_deps' && (
        <Button size="default" disabled>
          <Loader2 className="animate-spin" />
          依存関係をインストール中... (数分かかる場合があります)
        </Button>
      )}

      {serverInfo?.step === 'downloading_model' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs/relaxed text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {downloadingLabel}
          </div>
          {progress && (
            <>
              <Progress value={progressPercent} />
              <p className="text-xs/relaxed text-muted-foreground">
                {formatBytes(progress.downloadedBytes)} / {formatBytes(progress.totalBytes)} (
                {progressPercent.toFixed(0)}%) ・ {formatEta(progress.etaSeconds)}
              </p>
            </>
          )}
        </div>
      )}

      {serverInfo?.step === 'starting_server' && (
        <Button size="default" disabled>
          <Loader2 className="animate-spin" />
          {startingServerLabel}
        </Button>
      )}

      {serverInfo && SERVER_UP_STEPS.includes(serverInfo.step) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-2 text-success">
            <CheckCircle2 className="size-4" />
            サーバーは起動しています
          </span>
          {/* tsunagi外(make whisper/make llm等)で起動された場合(running_external)も、
              ポート番号を手がかりに停止できるため、起動中は常に停止ボタンを出す。 */}
          <Button size="default" variant="outline" onClick={onStop}>
            <Square />
            サーバーを停止
          </Button>
        </div>
      )}
    </div>
  );
}
