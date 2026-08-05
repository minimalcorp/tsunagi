'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { RemoteServerInfo } from '@/hooks/useInferenceServer';

interface RemoteServerPanelProps {
  serviceLabel: string;
  cliCommand: string;
  serverInfo: RemoteServerInfo | null;
  onSave: (url: string) => Promise<boolean>;
  onRecheck: () => void;
}

// リモートサーバーはtsunagi UIから起動/停止できない(Windows側でCLIから独立して
// 起動される想定のため)。ここではURLの入力・保存と、接続確認のみを行う。
export function RemoteServerPanel({
  serviceLabel,
  cliCommand,
  serverInfo,
  onSave,
  onRecheck,
}: RemoteServerPanelProps) {
  const [url, setUrl] = useState(serverInfo?.url ?? '');
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (serverInfo?.url) setUrl(serverInfo.url);
  }, [serverInfo?.url]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(url.trim());
    } finally {
      setSaving(false);
    }
  };

  const handleRecheck = () => {
    setChecking(true);
    onRecheck();
    // ステータス取得は非同期でserverInfoに反映されるため、ボタンのスピナーは
    // 一定時間で戻す(fetchStatus自体の完了を待つ仕組みは持たないため簡易対応)。
    setTimeout(() => setChecking(false), 1500);
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          {serviceLabel}サーバーのURL
        </label>
        <div className="flex gap-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://192.168.1.xx:xxxx"
            className="text-xs"
          />
          <Button size="default" onClick={() => void handleSave()} disabled={saving || !url.trim()}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            保存
          </Button>
        </div>
        <p className="mt-1 text-[0.65rem] text-muted-foreground">
          Windows機で <code className="rounded bg-muted px-1">{cliCommand}</code>{' '}
          を実行した際に表示されるURLを入力してください。
        </p>
      </div>

      {serverInfo && (
        <div className="flex flex-wrap items-center gap-2">
          {serverInfo.healthy ? (
            <span className="flex items-center gap-2 text-success">
              <CheckCircle2 className="size-4" />
              接続できています
            </span>
          ) : (
            <span className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-4" />
              接続できません
            </span>
          )}
          <Button size="default" variant="outline" onClick={handleRecheck} disabled={checking}>
            {checking ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            再確認
          </Button>
        </div>
      )}

      {serverInfo && !serverInfo.healthy && (
        <p className="text-xs/relaxed text-destructive">
          Windows側で <code className="rounded bg-muted px-1">{cliCommand}</code>{' '}
          を起動し忘れていないか確認してください。
        </p>
      )}
    </div>
  );
}
