'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';

const TerminalView = dynamic(
  () => import('@/components/TerminalView').then((m) => m.TerminalView),
  { ssr: false }
);

interface HookEvent {
  receivedAt: string;
  event: string;
  sessionId?: string;
  raw: Record<string, unknown>;
}

const FASTIFY_API_BASE = 'http://localhost:2792';

const SESSION_STORAGE_KEY = 'terminal-test-session-id';

// 確認用: workspace パスを固定
const WORKSPACE_PATH = '/Users/jigengineer/.tsunagi/workspaces/minimalcorp/tsunagi/feat-terminal';

export default function TerminalTestPage() {
  // sessionStorage はブラウザ専用 API → SSR では null、クライアント初回 effect で確定
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [hookEvents, setHookEvents] = useState<HookEvent[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSessionId(
      sessionStorage.getItem(SESSION_STORAGE_KEY) ??
        (() => {
          const newId = crypto.randomUUID();
          sessionStorage.setItem(SESSION_STORAGE_KEY, newId);
          return newId;
        })()
    );
  }, []);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCountRef = useRef(0);

  // hookイベントをポーリング（2秒間隔）
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${FASTIFY_API_BASE}/hooks/events`);
        if (!res.ok) return;
        const data = (await res.json()) as { events: HookEvent[] };
        if (data.events.length !== lastCountRef.current) {
          lastCountRef.current = data.events.length;
          setHookEvents([...data.events].reverse()); // 新着が上
        }
      } catch {
        // Fastifyが起動していない場合は無視
      }
    };

    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // --resume を先に試みて失敗したら --session-id にフォールバック。
  // --resume 失敗時のエラー出力は 2>/dev/null で捨てるため PTY 上には表示されない。
  const claudeCommand = sessionId
    ? `claude --resume ${sessionId} 2>/dev/null || claude --session-id ${sessionId}`
    : undefined;

  return (
    <div className="flex flex-col h-screen bg-theme-bg text-theme-fg">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-theme flex-shrink-0">
        <h1 className="text-sm font-semibold">Terminal Test</h1>
        <span className="text-xs text-theme-muted">Fastify :2792 / PTY</span>

        {sessionId && (
          <div className="flex items-center gap-3 ml-auto">
            <span className="text-xs text-theme-muted font-mono">{sessionId.slice(0, 8)}…</span>
            <button
              onClick={() => {
                const newId = crypto.randomUUID();
                sessionStorage.setItem(SESSION_STORAGE_KEY, newId);
                // ページリロードで新規セッションとして再起動
                window.location.reload();
              }}
              className="text-xs px-2 py-1 rounded border border-theme text-theme-muted hover:text-theme-fg hover:bg-theme-hover cursor-pointer"
            >
              New Session
            </button>
          </div>
        )}
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Terminal: sessionId確定後に常にClaudeで自動起動 */}
        <div className="flex-1 min-h-0 min-w-0">
          {sessionId && (
            <TerminalView
              sessionId={sessionId}
              cwd={WORKSPACE_PATH}
              worktreePath={WORKSPACE_PATH}
              command={claudeCommand}
            />
          )}
        </div>

        {/* Hook Events ログ */}
        <div className="w-80 flex-shrink-0 border-l border-theme flex flex-col">
          <div className="px-3 py-2 border-b border-theme flex items-center justify-between">
            <span className="text-xs font-semibold">Hook Events</span>
            <span className="text-xs text-theme-muted">{hookEvents.length} received</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {hookEvents.length === 0 ? (
              <p className="text-xs text-theme-muted text-center pt-4">No events yet.</p>
            ) : (
              hookEvents.map((ev, i) => <HookEventCard key={i} ev={ev} />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HookEventCard({ ev }: { ev: HookEvent }) {
  const [expanded, setExpanded] = useState(false);

  const toolName = ev.raw.tool_name as string | undefined;
  const prompt = ev.raw.prompt as string | undefined;
  const toolInput = ev.raw.tool_input as Record<string, unknown> | undefined;
  const todos = (toolInput?.todos ?? []) as Array<{ content: string; status: string }>;

  return (
    <div className="text-xs border border-theme rounded p-2 space-y-1">
      <div className="flex items-center justify-between">
        <span className={`font-semibold ${eventColor(ev.event)}`}>{ev.event}</span>
        <span className="text-theme-muted">{formatTime(ev.receivedAt)}</span>
      </div>

      {toolName && (
        <div className="text-theme-muted">
          tool: <span className="text-theme-fg font-mono">{toolName}</span>
        </div>
      )}

      {prompt && (
        <div className="text-theme-muted truncate" title={prompt}>
          prompt:{' '}
          <span className="text-theme-fg">
            {prompt.slice(0, 60)}
            {prompt.length > 60 ? '…' : ''}
          </span>
        </div>
      )}

      {todos.length > 0 && (
        <div className="space-y-0.5 mt-1">
          {todos.map((todo, j) => (
            <div key={j} className="flex items-center gap-1">
              <span className="text-theme-muted">{todoStatusIcon(todo.status)}</span>
              <span className="truncate text-theme-muted">{todo.content}</span>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-theme-muted hover:text-theme-fg cursor-pointer"
      >
        {expanded ? '▲ raw' : '▼ raw'}
      </button>
      {expanded && (
        <pre className="text-theme-muted bg-theme-hover rounded p-1 overflow-x-auto text-[10px] leading-tight">
          {JSON.stringify(ev.raw, null, 2)}
        </pre>
      )}
    </div>
  );
}

function eventColor(event: string): string {
  switch (event) {
    case 'SessionStart':
      return 'text-green-500';
    case 'UserPromptSubmit':
      return 'text-purple-500';
    case 'PostToolUse':
      return 'text-yellow-500';
    case 'Stop':
      return 'text-blue-500';
    case 'StopFailure':
      return 'text-red-500';
    default:
      return 'text-theme-fg';
  }
}

function todoStatusIcon(status: string): string {
  switch (status) {
    case 'completed':
      return '✓';
    case 'in_progress':
      return '▶';
    default:
      return '○';
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
