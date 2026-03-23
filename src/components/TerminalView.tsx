'use client';

import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { io, type Socket } from 'socket.io-client';
import { useTheme } from '@/contexts/ThemeContext';
import { Loader2 } from 'lucide-react';

const FASTIFY_API_BASE = 'http://localhost:2792';

interface TerminalViewProps {
  /** PTYを起動する作業ディレクトリ */
  cwd?: string;
  /** PTYに渡す環境変数 */
  env?: Record<string, string>;
  /** settings.local.json を生成するworktreeパス */
  worktreePath?: string;
  /**
   * セッションID（tab_idを渡す）。
   * 指定した場合、既存PTYセッションがあれば再接続し画面を復元する。
   * 未指定の場合はサーバー側でUUIDを生成する。
   */
  sessionId?: string;
  /**
   * PTY起動後にシェルへ自動入力するコマンド。
   * 例: "claude --session-id <uuid>"
   * 新規セッション作成時のみ有効（reused時は無視）。
   */
  command?: string;
  className?: string;
}

type TerminalStatus = 'idle' | 'connecting' | 'connected' | 'paused' | 'exited' | 'error';

export function TerminalView({
  cwd,
  env,
  worktreePath,
  sessionId: propSessionId,
  command,
  className = '',
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const sessionIdRef = useRef<string | null>(propSessionId ?? null);
  const unmountedRef = useRef(false);
  // reused接続時、リングバッファ受信後にsendResize()するまでuseEffectからのsendResizeを抑制
  const suppressResizeRef = useRef(false);
  const [status, setStatus] = useState<TerminalStatus>('idle');
  const { effectiveTheme } = useTheme();

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

    const observer = new ResizeObserver(() => {
      fitAddon.fit();
      // reused接続中はリングバッファ受信前にsendResizeしない（suppressResizeRefで制御）
      if (!suppressResizeRef.current) {
        sendResize();
      }
    });
    observer.observe(containerRef.current);

    if (propSessionId) {
      connectSession(propSessionId, term);
    }

    return () => {
      unmountedRef.current = true;
      observer.disconnect();
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

      if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);

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

    term.onData((data) => {
      if (socket.connected && sessionIdRef.current) {
        socket.emit('input', { sessionId: sessionIdRef.current, data });
      }
    });
  }

  async function startSession() {
    const term = termRef.current;
    if (!term) return;
    await connectSession(propSessionId ?? crypto.randomUUID(), term);
  }

  function pauseSession() {
    // socketのみ切断。PTY はサーバー側で GC タイマーが管理（30分後に自動 kill）
    socketRef.current?.disconnect();
    socketRef.current = null;
    setStatus('paused');
  }

  async function stopSession() {
    // socket 切断 + PTY を明示的に終了（タブ削除相当）
    socketRef.current?.disconnect();
    socketRef.current = null;

    if (sessionIdRef.current) {
      await fetch(`${FASTIFY_API_BASE}/api/terminal/sessions/${sessionIdRef.current}`, {
        method: 'DELETE',
      }).catch(() => {});
      sessionIdRef.current = null;
    }
    setStatus('idle');
    if (termRef.current) clearTerminalDisplay(termRef.current);
  }

  const isConnecting = status === 'connecting';
  const isActive = status === 'connecting' || status === 'connected';
  const isPausedOrExited = status === 'paused' || status === 'exited' || status === 'error';
  const isIdle = status === 'idle';

  return (
    <div className={`flex flex-col h-full min-h-0 ${className}`}>
      {/* ツールバー */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-theme flex-shrink-0">
        <StatusBadge status={status} />
        <div className="flex gap-2">
          {(isIdle || isPausedOrExited) && (
            <button
              onClick={startSession}
              className="text-xs px-2 py-1 rounded bg-primary text-white hover:opacity-80 cursor-pointer"
            >
              {isIdle ? 'Start' : 'Reconnect'}
            </button>
          )}
          {isActive && (
            <>
              <button
                onClick={pauseSession}
                className="text-xs px-2 py-1 rounded border border-theme text-theme-fg hover:bg-theme-hover cursor-pointer"
              >
                Pause
              </button>
              <button
                onClick={stopSession}
                className="text-xs px-2 py-1 rounded bg-red-500 text-white hover:opacity-80 cursor-pointer"
              >
                Stop
              </button>
            </>
          )}
        </div>
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

        {/* idle / paused / exited / error: 操作案内を表示 */}
        {(isIdle || isPausedOrExited) && (
          <div className="absolute inset-0 flex items-center justify-center bg-theme-bg">
            <div className="text-center space-y-2">
              {status === 'error' && <p className="text-xs text-red-500">Connection failed</p>}
              {status === 'exited' && <p className="text-xs text-theme-muted">Session ended</p>}
              {status === 'paused' && <p className="text-xs text-theme-muted">Paused</p>}
              <button
                onClick={startSession}
                className="text-xs px-3 py-1.5 rounded bg-primary text-white hover:opacity-80 cursor-pointer"
              >
                {isIdle ? 'Start' : 'Reconnect'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: TerminalStatus }) {
  const config: Record<TerminalStatus, { label: string; color: string }> = {
    idle: { label: 'Idle', color: 'text-theme-muted' },
    connecting: { label: 'Connecting...', color: 'text-yellow-500' },
    connected: { label: 'Connected', color: 'text-green-500' },
    paused: { label: 'Paused', color: 'text-theme-muted' },
    exited: { label: 'Exited', color: 'text-theme-muted' },
    error: { label: 'Error', color: 'text-red-500' },
  };
  const { label, color } = config[status];
  return <span className={`text-xs font-medium ${color}`}>{label}</span>;
}
