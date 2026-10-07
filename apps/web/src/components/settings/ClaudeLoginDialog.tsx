'use client';

import { useEffect, useState } from 'react';
import { CircleCheck } from 'lucide-react';
import type { ClaudeAuthStatus, ClaudeProfileWithStatus } from '@minimalcorp/tsunagi-shared';
import { apiUrl } from '@/lib/api-url';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { TerminalView } from '@/components/TerminalView';
import { errorMessage, requestData } from './local-llm-ui';

/** ログイン完了を確認する間隔 */
const STATUS_POLL_MS = 2000;

interface ClaudeLoginDialogProps {
  profile: ClaudeProfileWithStatus;
  onClose: () => void;
}

/**
 * プロファイルの CLAUDE_CONFIG_DIR で `claude auth login` を実行するターミナル。
 * ブラウザでの認証（WSL2 等ではコードの貼り付け）をこのターミナルで行い、ログインを確認したら完了表示にする。
 */
export function ClaudeLoginDialog({ profile, onClose }: ClaudeLoginDialogProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ClaudeAuthStatus | null>(null);

  // ログイン用 PTY を起動し、閉じたら片付ける
  useEffect(() => {
    let id: string | null = null;
    let cancelled = false;
    requestData<{ sessionId: string }>(`/api/claude-profiles/${profile.slug}/login`, {
      method: 'POST',
    })
      .then((data) => {
        id = data.sessionId;
        if (cancelled) {
          void fetch(apiUrl(`/api/claude-profiles/login/${id}`), { method: 'DELETE' });
          return;
        }
        setSessionId(data.sessionId);
      })
      .catch((err: unknown) => setError(errorMessage(err)));
    return () => {
      cancelled = true;
      if (id) void fetch(apiUrl(`/api/claude-profiles/login/${id}`), { method: 'DELETE' });
    };
  }, [profile.slug]);

  // ログイン完了を確認する（claude auth login はログイン後に終了するだけなので状態を問い合わせる）
  const loggedIn = status?.loggedIn ?? false;
  useEffect(() => {
    if (!sessionId || loggedIn) return;
    const timer = setInterval(() => {
      requestData<{ status: ClaudeAuthStatus }>(`/api/claude-profiles/${profile.slug}/status`)
        .then((data) => {
          // 再ログイン時はログイン済みのまま始まるため、アカウントが変わったかではなく
          // ログイン状態の変化だけを見る（未ログイン → ログイン済み）
          if (data.status.loggedIn && !profile.status.loggedIn) setStatus(data.status);
        })
        .catch(() => undefined);
    }, STATUS_POLL_MS);
    return () => clearInterval(timer);
  }, [sessionId, loggedIn, profile.slug, profile.status.loggedIn]);

  return (
    <Dialog
      open
      onOpenChange={(details) => {
        if (!details.open) onClose();
      }}
      title={`Login: ${profile.name}`}
      maxWidth="4xl"
    >
      <div className="space-y-3">
        {loggedIn && status ? (
          <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
            <CircleCheck className="size-4" />
            <span className="flex-1">
              Logged in{status.email ? ` as ${status.email}` : ''}
              {status.orgName ? ` (${status.orgName})` : ''}
            </span>
            <Button size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            ブラウザで認証してください。ブラウザが開かない場合は表示された URL
            を開き、表示されたコードをこのターミナルに貼り付けます。
            {profile.status.loggedIn && ' 再ログインが終わったら閉じてください。'}
          </p>
        )}
        <div className="h-[420px] overflow-hidden rounded-md border border-border">
          {error ? (
            <div className="flex h-full items-center justify-center text-sm text-destructive">
              {error}
            </div>
          ) : sessionId ? (
            <TerminalView tabId={sessionId} hideToolbar isActive />
          ) : (
            <div className="flex h-full items-center justify-center">
              <LoadingSpinner size="sm" message="Starting..." />
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
