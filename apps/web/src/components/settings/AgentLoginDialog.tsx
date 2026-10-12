'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { CircleCheck } from 'lucide-react';
import type { AgentAuthStatus, AgentProfileWithStatus } from '@minimalcorp/tsunagi-shared';
import { apiUrl } from '@/lib/api-url';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { TerminalView } from '@/components/TerminalView';
import { errorMessage, requestData } from './local-llm-ui';

/** ログイン完了を確認する間隔 */
const STATUS_POLL_MS = 2000;

interface AgentLoginDialogProps {
  profile: AgentProfileWithStatus;
  onClose: () => void;
}

/** エージェントごとの案内 */
const LOGIN_HINT: Record<AgentProfileWithStatus['agent'], string> = {
  claude:
    'ブラウザで認証してください。ブラウザが開かない場合は表示された URL を開き、表示されたコードをこのターミナルに貼り付けます。',
  codex: 'ブラウザで認証してください。ブラウザが開かない場合は表示された URL を開きます。',
};

/**
 * ブラウザから CLI の待ち受け（127.0.0.1）に届かない環境（コンテナ内）で、認証後にブラウザが開けなかった
 * 戻り先の URL を貼り付けて CLI に渡す欄
 */
function CallbackPasteForm({ sessionId }: { sessionId: string }) {
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    requestData(`/api/agent-profiles/login/${sessionId}/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
      .then(() => setUrl(''))
      .catch((err: unknown) => setError(errorMessage(err)))
      .finally(() => setSubmitting(false));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-1">
      <p className="text-xs text-muted-foreground">
        認証後にブラウザが 127.0.0.1 のページを開けなかったら、そのアドレスバーの URL
        を貼り付けてください。
      </p>
      <div className="flex gap-2">
        <Input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="http://127.0.0.1:1455/auth/callback?code=..."
          aria-label="Callback URL"
        />
        <Button type="submit" disabled={!url.trim() || submitting}>
          Submit
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}

/**
 * プロファイルの設定ディレクトリでログインコマンド（`claude auth login` / `codex login`）を実行するターミナル。
 * ブラウザでの認証をこのターミナルで行い、ログインを確認したら完了表示にする。
 */
export function AgentLoginDialog({ profile, onClose }: AgentLoginDialogProps) {
  const [session, setSession] = useState<{ sessionId: string; callbackPaste: boolean } | null>(
    null
  );
  const sessionId = session?.sessionId ?? null;
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<AgentAuthStatus | null>(null);

  // ログイン用 PTY を起動し、閉じたら片付ける
  useEffect(() => {
    let id: string | null = null;
    let cancelled = false;
    requestData<{ sessionId: string; callbackPaste: boolean }>(
      `/api/agent-profiles/${profile.agent}/${profile.slug}/login`,
      { method: 'POST' }
    )
      .then((data) => {
        id = data.sessionId;
        if (cancelled) {
          void fetch(apiUrl(`/api/agent-profiles/login/${id}`), { method: 'DELETE' });
          return;
        }
        setSession(data);
      })
      .catch((err: unknown) => setError(errorMessage(err)));
    return () => {
      cancelled = true;
      if (id) void fetch(apiUrl(`/api/agent-profiles/login/${id}`), { method: 'DELETE' });
    };
  }, [profile.agent, profile.slug]);

  // ログイン完了を確認する（ログインコマンドはログイン後に終了するだけなので状態を問い合わせる）
  const loggedIn = status?.loggedIn ?? false;
  useEffect(() => {
    if (!sessionId || loggedIn) return;
    const timer = setInterval(() => {
      requestData<{ status: AgentAuthStatus }>(
        `/api/agent-profiles/${profile.agent}/${profile.slug}/status`
      )
        .then((data) => {
          // 再ログイン時はログイン済みのまま始まるため、アカウントが変わったかではなく
          // ログイン状態の変化だけを見る（未ログイン → ログイン済み）
          if (data.status.loggedIn && !profile.status.loggedIn) setStatus(data.status);
        })
        .catch(() => undefined);
    }, STATUS_POLL_MS);
    return () => clearInterval(timer);
  }, [sessionId, loggedIn, profile.agent, profile.slug, profile.status.loggedIn]);

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
            {LOGIN_HINT[profile.agent]}
            {profile.status.loggedIn && ' 再ログインが終わったら閉じてください。'}
          </p>
        )}
        {!loggedIn && session?.callbackPaste && <CallbackPasteForm sessionId={session.sessionId} />}
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
