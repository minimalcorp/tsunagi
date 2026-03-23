'use client';

import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { io, type Socket } from 'socket.io-client';
import { useTheme } from '@/contexts/ThemeContext';
import { Loader2, Copy, Play, Check } from 'lucide-react';

const FASTIFY_API_BASE = 'http://localhost:2792';

export type TerminalStatus = 'idle' | 'connecting' | 'connected' | 'paused' | 'exited' | 'error';
export type ClaudeStatus = 'idle' | 'running' | 'waiting' | 'success' | 'failure' | 'error';

export interface Todo {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

interface TerminalViewProps {
  /** タブID（PTYのsessionIdと一致させる）。必須。 */
  tabId: string;
  /** PTYを起動する作業ディレクトリ */
  cwd?: string;
  /** PTYに渡す環境変数 */
  env?: Record<string, string>;
  /** settings.local.json を生成するworktreeパス */
  worktreePath?: string;
  /**
   * PTY起動後にシェルへ自動入力するコマンド。
   * 例: "claude --session-id <uuid>"
   * 新規セッション作成時のみ有効（reused時は無視）。
   */
  command?: string;
  className?: string;
  /** Todoリスト更新時のコールバック（KanbanカードのProgress Bar用） */
  onTodosUpdated?: (tabId: string, todos: Todo[]) => void;
  /** terminal/claudeステータス変化時のコールバック（タブ表示用） */
  onStatusChange?: (
    tabId: string,
    terminalStatus: TerminalStatus,
    claudeStatus: ClaudeStatus
  ) => void;
}

/** TerminalViewの外部からアクセス可能なハンドル */
export interface TerminalViewHandle {
  /** PTYにテキストを書き込む（末尾改行は自動付加しない） */
  sendInput: (data: string) => void;
}

export const TerminalView = forwardRef<TerminalViewHandle, TerminalViewProps>(function TerminalView(
  { tabId, cwd, env, worktreePath, command, className = '', onTodosUpdated, onStatusChange },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const sessionIdRef = useRef<string | null>(tabId);
  const unmountedRef = useRef(false);
  // reused接続時、リングバッファ受信後にsendResize()するまでuseEffectからのsendResizeを抑制
  const suppressResizeRef = useRef(false);
  // IME composition中（日本語変換中）はPTYへの入力を抑制する
  const isComposingRef = useRef(false);
  const [status, setStatus] = useState<TerminalStatus>('idle');
  const [claudeStatus, setClaudeStatus] = useState<ClaudeStatus>('idle');
  const [todos, setTodos] = useState<Todo[]>([]);
  const [copied, setCopied] = useState(false);
  const { effectiveTheme } = useTheme();
  // onStatusChange をrefで保持（useEffectの依存配列に入れず常に最新を参照）
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  const isDark = effectiveTheme === 'dark';

  const xtermTheme = isDark
    ? {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        selectionBackground: '#264f78',
      }
    : {
        background: '#ffffff',
        foreground: '#1e1e1e',
        cursor: '#1e1e1e',
        selectionBackground: '#add6ff',
      };

  // status/claudeStatus 変化時に親へ通知
  useEffect(() => {
    onStatusChangeRef.current?.(tabId, status, claudeStatus);
  }, [tabId, status, claudeStatus]);

  // connected になったタイミングで fit() を再呼び出し（オーバーレイ消滅後のサイズ確定）
  useEffect(() => {
    if (status === 'connected' && fitAddonRef.current) {
      fitAddonRef.current.fit();
      // reused時はリングバッファ受信後（firstMessageHandled）にsendResizeするため、ここでは抑制
      if (!suppressResizeRef.current) {
        sendResize();
      }
    }
  }, [status]); // sendResize は ref を参照するため依存不要

  // xterm 初期化（マウント時のみ）
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"Cascadia Code", "Fira Code", "Menlo", monospace',
      theme: xtermTheme,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // IME composition中はPTYへの入力を抑制する
    // xterm.js の内部 textarea に compositionstart/end を登録する
    const textarea = containerRef.current.querySelector('textarea');
    const onCompositionStart = () => {
      isComposingRef.current = true;
    };
    const onCompositionEnd = () => {
      isComposingRef.current = false;
    };
    if (textarea) {
      textarea.addEventListener('compositionstart', onCompositionStart);
      textarea.addEventListener('compositionend', onCompositionEnd);
    }

    const observer = new ResizeObserver(() => {
      fitAddon.fit();
      // reused接続中はリングバッファ受信前にsendResizeしない（suppressResizeRefで制御）
      if (!suppressResizeRef.current) {
        sendResize();
      }
    });
    observer.observe(containerRef.current);

    // tabIdが指定されている場合は自動接続
    connectSession(tabId, term);

    return () => {
      unmountedRef.current = true;
      observer.disconnect();
      if (textarea) {
        textarea.removeEventListener('compositionstart', onCompositionStart);
        textarea.removeEventListener('compositionend', onCompositionEnd);
      }
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      // アンマウント時はsocketのみ切断。PTYはサーバー側で生存継続（GCタイマーが管理）
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = xtermTheme;
    }
  }, [isDark]); // eslint-disable-line react-hooks/exhaustive-deps

  function sendResize() {
    const socket = socketRef.current;
    const term = termRef.current;
    const sid = sessionIdRef.current;
    if (!socket || !socket.connected || !term || !sid) return;
    socket.emit('resize', { sessionId: sid, cols: term.cols, rows: term.rows });
  }

  // 外部からPTYに書き込むためのハンドル
  useImperativeHandle(ref, () => ({
    sendInput: (data: string) => {
      const socket = socketRef.current;
      const sid = sessionIdRef.current;
      if (socket?.connected && sid) {
        socket.emit('input', { sessionId: sid, data });
      }
    },
  }));

  /**
   * xterm.js の表示バッファをクリアする。
   * term.reset() は xterm.js が PTY に DA クエリ(\x1b[c)を送出するため使用禁止。
   * DA への応答(\x1b[?1;2c)がリングバッファに混入し画面が汚染される。
   * \x1b[2J  : 画面クリア
   * \x1b[3J  : スクロールバックバッファクリア
   * \x1b[H   : カーソルをホーム(1,1)へ移動
   * これらは xterm.js 内部でのみ処理され、PTY には送出されない。
   */
  function clearTerminalDisplay(term: Terminal) {
    term.write('\x1b[2J\x1b[3J\x1b[H');
  }

  async function connectSession(sessionId: string, term: Terminal) {
    setStatus('connecting');

    try {
      const res = await fetch(`${FASTIFY_API_BASE}/api/terminal/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd, env, worktreePath, sessionId, command }),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(`Failed to create session: ${res.status} ${errorText}`);
      }

      const body = (await res.json()) as { sessionId: string; reused: boolean };
      sessionIdRef.current = body.sessionId;

      // 新規セッションのみ画面をクリア（reused の場合はリングバッファで復元するため触らない）
      if (!body.reused) {
        clearTerminalDisplay(term);
      }

      connectSocket(body.sessionId, body.reused, term);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[TerminalView] connectSession error:', message);
      setStatus('error');
    }
  }

  function connectSocket(sessionId: string, reused: boolean, term: Terminal) {
    const socket = io(FASTIFY_API_BASE, { transports: ['websocket'] });
    socketRef.current = socket;
    // reused時: 最初のoutputイベント（リングバッファ）受信後にリサイズを再送する
    let firstMessageHandled = false;

    socket.on('connect', () => {
      if (reused) {
        // reused: status→connected によるuseEffectのsendResizeを抑制し、
        // リングバッファ受信後（firstMessageHandled）にのみsendResizeする
        suppressResizeRef.current = true;
        clearTerminalDisplay(term);
      } else {
        term.writeln('\x1b[90mConnected.\x1b[0m');
      }
      setStatus('connected');

      // roomに参加
      socket.emit('join', { room: `tab:${sessionId}` });
    });

    socket.on('output', ({ data }: { data: string }) => {
      if (reused && !firstMessageHandled) {
        firstMessageHandled = true;
        // リングバッファを書き込み、完了コールバックでsendResizeする。
        term.write(data, () => {
          suppressResizeRef.current = false;
          fitAddonRef.current?.fit();
          sendResize();
        });
      } else {
        term.write(data);
      }
    });

    socket.on('exit', ({ exitCode }: { exitCode: number }) => {
      console.log('[TerminalView] PTY exited with code:', exitCode);
      setStatus('exited');
      sessionIdRef.current = null;
      socketRef.current = null;
    });

    socket.on('error', ({ message }: { message: string }) => {
      console.error('[TerminalView] Socket error message:', message);
      setStatus('error');
    });

    socket.on('disconnect', () => {
      // アンマウント済み・pause/stop操作由来の切断はstateを更新しない
      if (!unmountedRef.current) {
        setStatus((prev) => {
          if (prev === 'exited' || prev === 'paused' || prev === 'idle') return prev;
          return 'exited';
        });
      }
    });

    // claude hooksからのステータス変更
    socket.on(
      'status-changed',
      ({ status: newStatus }: { sessionId: string; status: ClaudeStatus }) => {
        setClaudeStatus(newStatus);
      }
    );

    // claude hooksからのTodo更新
    socket.on('todos-updated', ({ todos: newTodos }: { sessionId: string; todos: Todo[] }) => {
      setTodos(newTodos);
      onTodosUpdated?.(tabId, newTodos);
    });

    term.onData((data) => {
      // IME composition中（日本語変換中）はPTYに送信しない
      if (isComposingRef.current) return;
      if (socket.connected && sessionIdRef.current) {
        socket.emit('input', { sessionId: sessionIdRef.current, data });
      }
    });
  }

  async function reconnectSession() {
    const term = termRef.current;
    if (!term) return;
    await connectSession(tabId, term);
  }

  const handleCopyTabId = useCallback(() => {
    navigator.clipboard.writeText(tabId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [tabId]);

  function handleRunClaude() {
    const socket = socketRef.current;
    const sid = sessionIdRef.current;
    if (!socket || !socket.connected || !sid) return;
    const claudeCmd = `claude --resume ${sid} 2>/dev/null || claude --session-id ${sid}\n`;
    socket.emit('input', { sessionId: sid, data: claudeCmd });
  }

  const isConnecting = status === 'connecting';
  const isPausedOrExited = status === 'paused' || status === 'exited' || status === 'error';
  const isConnected = status === 'connected';

  const completedTodos = todos.filter((t) => t.status === 'completed').length;
  const totalTodos = todos.length;
  const showTodoProgress = claudeStatus === 'running' && totalTodos > 0;

  // 短縮表示用UUID（先頭8文字 + …）
  const shortTabId = tabId.length > 8 ? `${tabId.slice(0, 8)}…` : tabId;

  return (
    <div className={`flex flex-col h-full min-h-0 ${className}`}>
      {/* UUID表示バー */}
      <div className="flex items-center gap-2 px-2 py-1 border-b border-theme flex-shrink-0 bg-theme-card">
        <span className="font-mono text-xs text-theme-muted" title={tabId}>
          {shortTabId}
        </span>
        <button
          onClick={handleCopyTabId}
          className="p-1 text-theme-muted hover:text-theme-fg rounded hover:bg-theme-hover cursor-pointer"
          title="Copy tab ID"
        >
          {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
        </button>
        <button
          onClick={handleRunClaude}
          disabled={!isConnected}
          className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded cursor-pointer ${
            isConnected
              ? 'bg-primary text-white hover:opacity-80'
              : 'bg-theme-hover text-theme-muted cursor-not-allowed opacity-50'
          }`}
          title="Run Claude"
        >
          <Play className="w-3 h-3" />
          Run Claude
        </button>
      </div>

      {/* Terminal エリア: xterm コンテナは常にDOMに存在（マウント要件）、接続中はオーバーレイで隠す */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <div ref={containerRef} className="w-full h-full" style={{ padding: '4px' }} />

        {/* 接続中オーバーレイ: connected になると消える */}
        {isConnecting && (
          <div className="absolute inset-0 flex items-center justify-center bg-theme-bg">
            <div className="flex items-center gap-2 text-theme-muted text-xs">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Connecting...</span>
            </div>
          </div>
        )}

        {/* exited / error: overlayで再接続を促す */}
        {isPausedOrExited && (
          <div className="absolute inset-0 flex items-center justify-center bg-theme-bg/90">
            <div className="text-center space-y-2">
              {status === 'error' && <p className="text-xs text-red-500">Connection failed</p>}
              {status === 'exited' && <p className="text-xs text-theme-muted">Session ended</p>}
              {status === 'paused' && <p className="text-xs text-theme-muted">Paused</p>}
              <button
                onClick={reconnectSession}
                className="text-xs px-3 py-1.5 rounded bg-primary text-white hover:opacity-80 cursor-pointer"
              >
                Reconnect
              </button>
            </div>
          </div>
        )}

        {/* Todo進捗（running時かつtodosがある場合のみ表示） */}
        {showTodoProgress && (
          <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-theme-card/90 border-t border-theme">
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-theme-hover rounded-full h-1 overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${totalTodos > 0 ? (completedTodos / totalTodos) * 100 : 0}%` }}
                />
              </div>
              <span className="text-[10px] text-theme-muted flex-shrink-0">
                {completedTodos}/{totalTodos}
              </span>
            </div>
            {/* 現在in_progressのtodo */}
            {todos.find((t) => t.status === 'in_progress') && (
              <p className="text-[10px] text-theme-muted truncate mt-0.5">
                {todos.find((t) => t.status === 'in_progress')?.content}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
