'use client';

import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useTheme } from '@/contexts/ThemeContext';

const FASTIFY_WS_BASE = 'ws://localhost:2792';
const FASTIFY_API_BASE = 'http://localhost:2792';

interface TerminalViewProps {
  /** PTYを起動する作業ディレクトリ */
  cwd?: string;
  /** PTYに渡す環境変数 */
  env?: Record<string, string>;
  className?: string;
}

type TerminalStatus = 'idle' | 'connecting' | 'connected' | 'exited' | 'error';

interface WsOutMessage {
  type: 'output' | 'exit' | 'error';
  data?: string;
  exitCode?: number;
  message?: string;
}

export function TerminalView({ cwd, env, className = '' }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<TerminalStatus>('idle');
  const { effectiveTheme } = useTheme();

  const isDark = effectiveTheme === 'dark';

  // xterm テーマ
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

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // open() 直後はレンダラーが未初期化のため、1フレーム待ってから fit()
    requestAnimationFrame(() => {
      fitAddon.fit();
    });

    // リサイズオブザーバー：dimensions が有効になってから fit() を呼ぶ
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        fitAddon.fit();
        sendResize();
      });
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // テーマ変更時にxtermのテーマを更新
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = xtermTheme;
    }
  }, [isDark]); // eslint-disable-line react-hooks/exhaustive-deps

  function sendResize() {
    const ws = wsRef.current;
    const term = termRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !term) return;
    ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
  }

  async function startSession() {
    const term = termRef.current;
    if (!term) return;

    setStatus('connecting');
    term.clear();
    term.writeln('\x1b[90mConnecting...\x1b[0m');

    try {
      // セッション作成
      const res = await fetch(`${FASTIFY_API_BASE}/api/terminal/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd, env }),
      });

      if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);

      const { sessionId } = (await res.json()) as { sessionId: string };
      sessionIdRef.current = sessionId;

      // WebSocket 接続
      const ws = new WebSocket(`${FASTIFY_WS_BASE}/api/terminal/sessions/${sessionId}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        sendResize();
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data as string) as WsOutMessage;
        if (msg.type === 'output' && msg.data) {
          term.write(msg.data);
        } else if (msg.type === 'exit') {
          setStatus('exited');
          term.writeln(`\r\n\x1b[90m[Process exited with code ${msg.exitCode ?? 0}]\x1b[0m`);
          sessionIdRef.current = null;
          wsRef.current = null;
        } else if (msg.type === 'error') {
          term.writeln(`\r\n\x1b[31m[Error: ${msg.message}]\x1b[0m`);
          setStatus('error');
        }
      };

      ws.onerror = () => {
        term.writeln('\r\n\x1b[31m[WebSocket error]\x1b[0m');
        setStatus('error');
      };

      ws.onclose = () => {
        if (status !== 'exited') {
          setStatus('exited');
        }
      };

      // キー入力 → PTY へ送信
      const keyDisposable = term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data }));
        }
      });

      return () => {
        keyDisposable.dispose();
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      term.writeln(`\r\n\x1b[31m[Error: ${message}]\x1b[0m`);
      setStatus('error');
    }
  }

  async function stopSession() {
    // WebSocket を閉じる
    wsRef.current?.close();
    wsRef.current = null;

    // セッション削除
    if (sessionIdRef.current) {
      await fetch(`${FASTIFY_API_BASE}/api/terminal/sessions/${sessionIdRef.current}`, {
        method: 'DELETE',
      }).catch(() => {});
      sessionIdRef.current = null;
    }
    setStatus('idle');
    termRef.current?.clear();
  }

  // アンマウント時のクリーンアップ
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      if (sessionIdRef.current) {
        fetch(`${FASTIFY_API_BASE}/api/terminal/sessions/${sessionIdRef.current}`, {
          method: 'DELETE',
        }).catch(() => {});
      }
    };
  }, []);

  const statusLabel: Record<TerminalStatus, string> = {
    idle: 'Idle',
    connecting: 'Connecting...',
    connected: 'Connected',
    exited: 'Exited',
    error: 'Error',
  };

  const statusColor: Record<TerminalStatus, string> = {
    idle: 'text-theme-muted',
    connecting: 'text-yellow-500',
    connected: 'text-green-500',
    exited: 'text-theme-muted',
    error: 'text-red-500',
  };

  return (
    <div className={`flex flex-col h-full min-h-0 ${className}`}>
      {/* ツールバー */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-theme flex-shrink-0">
        <span className={`text-xs font-medium ${statusColor[status]}`}>{statusLabel[status]}</span>
        <div className="flex gap-2">
          {(status === 'idle' || status === 'exited' || status === 'error') && (
            <button
              onClick={startSession}
              className="text-xs px-2 py-1 rounded bg-primary text-white hover:opacity-80 cursor-pointer"
            >
              Start
            </button>
          )}
          {(status === 'connecting' || status === 'connected') && (
            <button
              onClick={stopSession}
              className="text-xs px-2 py-1 rounded bg-red-500 text-white hover:opacity-80 cursor-pointer"
            >
              Stop
            </button>
          )}
        </div>
      </div>

      {/* xterm コンテナ */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-hidden"
        style={{ padding: '4px' }}
      />
    </div>
  );
}
