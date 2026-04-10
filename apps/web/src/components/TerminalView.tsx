'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { io, type Socket } from 'socket.io-client';
import { useTheme } from '@/contexts/ThemeContext';
import { Loader2, Copy, Play, Check, SquarePen } from 'lucide-react';
import { MonacoEditorModal } from '@/components/MonacoEditorModal';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { apiUrl, getServerUrl } from '@/lib/api-url';

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
  /** DBから読み込んだ初期Todoリスト */
  initialTodos?: Todo[];
  /** Todoリスト更新時のコールバック（タスクカードの Progress Bar 用） */
  onTodosUpdated?: (tabId: string, todos: Todo[]) => void;
  /** タブがアクティブかどうか（フォーカス制御用） */
  isActive?: boolean;
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
  /** xterm.js にフォーカスを当てる */
  focus: () => void;
}

export const TerminalView = forwardRef<TerminalViewHandle, TerminalViewProps>(function TerminalView(
  {
    tabId,
    cwd,
    env,
    worktreePath,
    command,
    className = '',
    initialTodos,
    isActive,
    onTodosUpdated,
    onStatusChange,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const sessionIdRef = useRef<string | null>(tabId);
  const [showEditorModal, setShowEditorModal] = useState(false);
  // EditorSessionProvider 経由（Ctrl+G）でエディタが開いているかを追跡するref。
  // xterm の customKeyEventHandler（_keyUp内のfocus再取得）から参照する。
  const isExternalEditorOpenRef = useRef(false);
  const isActiveRef = useRef(isActive);
  // 初回接続かどうかを追跡（再接続時のフォーカス復帰判定用）
  const hasConnectedOnceRef = useRef(false);
  // reused接続時、リングバッファ受信後にsendResize()するまでuseEffectからのsendResizeを抑制
  const suppressResizeRef = useRef(false);
  const [status, setStatus] = useState<TerminalStatus>('idle');
  const [claudeStatus, setClaudeStatus] = useState<ClaudeStatus>('idle');
  const [todos, setTodos] = useState<Todo[]>(initialTodos ?? []);
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

  useLayoutEffect(() => {
    isActiveRef.current = isActive;
  });

  // アクティブになったタイミングで xterm にフォーカスを当てる
  // タブヘッダーのクリックでは xterm の mousedown handler が呼ばれないため明示的にフォーカスする
  useEffect(() => {
    if (!isActive) return;
    termRef.current?.focus();
  }, [isActive]);

  // Editor Modal の開閉に合わせてフォーカスを制御
  // 開く: xterm を blur → Monaco がフォーカスを取得できるようにする
  // 閉じる: Dialog close 処理完了後に xterm にフォーカスを戻す
  useEffect(() => {
    if (showEditorModal) {
      termRef.current?.blur();
    } else if (isActive) {
      const textarea = containerRef.current?.querySelector<HTMLTextAreaElement>(
        'textarea.xterm-helper-textarea'
      );
      textarea?.focus();
    }
  }, [showEditorModal, isActive]);

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

    // マウント時にアクティブタブなら即座にフォーカス（新規タブ作成時用）
    // useEffect([isActive]) はこのマウントeffectより先に実行されるため termRef.current が null でスキップされる。
    // ここで補完することで新規タブでも確実にフォーカスが当たる。
    if (isActiveRef.current) {
      term.focus();
    }

    // エディタモーダルが開いている間は xterm の _keyUp が this.focus() を呼んでフォーカスを
    // 奪い返すのを防ぐ。customKeyEventHandler が false を返すと _keyUp が早期リターンする。
    term.attachCustomKeyEventHandler(() => {
      if (isExternalEditorOpenRef.current) return false;
      return true;
    });

    // xterm.js は CompositionHelper 内で composition 中のキーストロークを内部で抑制し、
    // compositionend 後の setTimeout で確定テキストのみ triggerDataEvent → onData で通知する。
    // そのため我々が compositionstart/end を監視して onData をガードする必要はない。

    const observer = new ResizeObserver(() => {
      fitAddon.fit();
      // reused接続中はリングバッファ受信前にsendResizeしない（suppressResizeRefで制御）
      if (!suppressResizeRef.current) {
        sendResize();
      }
    });
    observer.observe(containerRef.current);

    // AbortController をエフェクトのローカルスコープで作成
    // cleanup で abort() を呼ぶことで in-flight な fetch を実際にキャンセルする
    const abortController = new AbortController();

    connectSession(tabId, term, abortController.signal);

    return () => {
      abortController.abort();
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

  // エディタセッション開閉イベント（EditorSessionProvider → TerminalView 通知）
  useEffect(() => {
    function handleEditorSessionOpen() {
      // xterm の _keyUp による focus 再取得を防ぐフラグを立てる
      isExternalEditorOpenRef.current = true;
      // xterm から明示的に blur して Monaco がフォーカスを取得できるようにする
      termRef.current?.blur();
    }
    function handleEditorSessionDone() {
      isExternalEditorOpenRef.current = false;
      // claude 2.1.94 は $EDITOR 終了後に Ink の内部状態と実画面の position がズレて
      // 余白が発生する。実ブラウザリサイズでは直ることを確認済みなので、
      // プログラム側から疑似的な dimension 変化 (bump-then-restore) を注入して
      // Node.js の 'resize' event → Ink の full re-layout を強制発火させる。
      //
      // 注意点:
      // - Node.js の 'resize' event は process.stdout の cols/rows が実際に
      //   変化した時のみ発火するため、同サイズ resize では効かない。
      // - 200ms 遅延: monaco-editor.sh が polling から exit して foreground PG が
      //   claude に戻るのを待つ。sh が前景にいる間に resize すると SIGWINCH が
      //   sh に届いてしまう。
      // - rows+1: 一瞬増やす方向にすることで、入力欄が画面外に押し出される
      //   flicker を避ける (rows-1 だと入力欄が 1 行上に動くのが見える)。
      // - 30ms の間隔: 2 回の resize を別 tick で処理させて、Node 側で集約され
      //   てしまうのを防ぐ。
      setTimeout(() => {
        const socket = socketRef.current;
        const sid = sessionIdRef.current;
        const term = termRef.current;
        if (!socket?.connected || !sid || !term) return;
        socket.emit('resize', { sessionId: sid, cols: term.cols, rows: term.rows + 1 });
        setTimeout(() => {
          const t = termRef.current;
          const s = socketRef.current;
          if (s?.connected && sid && t) {
            s.emit('resize', { sessionId: sid, cols: t.cols, rows: t.rows });
          }
        }, 30);
      }, 200);
      // アクティブタブのみフォーカスを復帰する
      if (!isActiveRef.current) return;
      // xterm 内の textarea を直接 focus する（Terminal.focus() では効かない）
      const textarea = containerRef.current?.querySelector<HTMLTextAreaElement>(
        'textarea.xterm-helper-textarea'
      );
      textarea?.focus();
    }
    window.addEventListener('editor-session-open', handleEditorSessionOpen);
    window.addEventListener('editor-session-done', handleEditorSessionDone);
    return () => {
      window.removeEventListener('editor-session-open', handleEditorSessionOpen);
      window.removeEventListener('editor-session-done', handleEditorSessionDone);
    };
  }, []);

  // フォアグラウンド復帰時にWebSocket接続の生死を検証し、死んでいれば即座に再接続する
  useEffect(() => {
    const HEALTH_CHECK_TIMEOUT_MS = 3000;

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return;

      const socket = socketRef.current;
      if (!socket || !socket.connected) return;

      // ヘルスチェック: サーバーにpingを送り、応答がなければ強制切断→自動再接続
      const timer = setTimeout(() => {
        // タイムアウト: 接続が死んでいる → 強制切断してSocket.IOの自動再接続に委ねる
        socket.off('health-check-ack', onAck);
        socket.disconnect();
      }, HEALTH_CHECK_TIMEOUT_MS);

      function onAck() {
        clearTimeout(timer);
        // 接続は生きている → フォーカスのみ復帰
        if (isActiveRef.current) {
          termRef.current?.focus();
        }
      }

      socket.once('health-check-ack', onAck);
      socket.emit('health-check');
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

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
    focus: () => {
      termRef.current?.focus();
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

  async function connectSession(sessionId: string, term: Terminal, signal: AbortSignal) {
    setStatus('connecting');

    try {
      const res = await fetch(apiUrl('/api/terminal/sessions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd, env, worktreePath, sessionId, command }),
        signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(`Failed to create session: ${res.status} ${errorText}`);
      }

      const body = (await res.json()) as { sessionId: string; reused: boolean };

      // await 後にキャンセル済みかチェック（StrictMode の cleanup 等による中断）
      if (signal.aborted) return;

      sessionIdRef.current = body.sessionId;

      // 新規セッションのみ画面をクリア（reused の場合はリングバッファで復元するため触らない）
      if (!body.reused) {
        clearTerminalDisplay(term);
      }

      connectSocket(body.sessionId, body.reused, term, signal);
    } catch (err) {
      // AbortError はクリーンアップによる正常なキャンセル → エラーとして扱わない
      if (err instanceof Error && err.name === 'AbortError') return;
      const message = err instanceof Error ? err.message : String(err);
      console.error('[TerminalView] connectSession error:', message);
      setStatus('error');
    }
  }

  function connectSocket(sessionId: string, reused: boolean, term: Terminal, signal: AbortSignal) {
    const socket = io(getServerUrl(), { transports: ['websocket'] });
    socketRef.current = socket;
    // reused時: 最初のoutputイベント（リングバッファ）受信後にリサイズを再送する
    let firstMessageHandled = false;

    socket.on('connect', () => {
      const isReconnect = hasConnectedOnceRef.current;
      hasConnectedOnceRef.current = true;

      if (isReconnect) {
        // 再接続時: reusedフラグに関係なくroom再参加のみ行う
        term.writeln('\x1b[90mReconnected.\x1b[0m');
      } else if (reused) {
        // 初回接続 + reused: リングバッファ受信後にリサイズする
        suppressResizeRef.current = true;
        clearTerminalDisplay(term);
      } else {
        // 初回接続 + 新規
        term.writeln('\x1b[90mConnected.\x1b[0m');
      }
      setStatus('connected');

      // roomに参加（再接続時も必ず再参加する）
      socket.emit('join', { room: `tab:${sessionId}` });

      // 再接続時: アクティブタブならフォーカスを復帰
      if (isReconnect && isActiveRef.current) {
        term.focus();
      }
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
      // signal.aborted = true の場合は cleanup 由来の切断 → 状態を更新しない
      if (!signal.aborted) {
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

    // editor:open イベント（tabルーム経由で受信）→ カスタムイベントでEditorSessionProviderに通知
    socket.on(
      'editor:open',
      ({ sessionId: editorSessionId, content }: { sessionId: string; content: string }) => {
        window.dispatchEvent(
          new CustomEvent('editor-session-open-request', {
            detail: { sessionId: editorSessionId, content },
          })
        );
      }
    );

    term.onData((data) => {
      if (socket.connected && sessionIdRef.current) {
        socket.emit('input', { sessionId: sessionIdRef.current, data });
      }
    });
  }

  async function reconnectSession() {
    const term = termRef.current;
    if (!term) return;
    // 手動再接続は unmount を待たないため、独立した AbortController を使用
    const abortController = new AbortController();
    await connectSession(tabId, term, abortController.signal);
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
    const claudeCmd = `claude --dangerously-skip-permissions --resume ${sid} 2>/dev/null || claude --dangerously-skip-permissions --session-id ${sid}\n`;
    socket.emit('input', { sessionId: sid, data: claudeCmd });
  }

  const isConnecting = status === 'connecting';
  const isPausedOrExited = status === 'paused' || status === 'exited' || status === 'error';
  const isConnected = status === 'connected';

  const completedTodos = todos.filter((t) => t.status === 'completed').length;
  const totalTodos = todos.length;

  // 短縮表示用UUID（先頭8文字 + …）
  const shortTabId = tabId.length > 8 ? `${tabId.slice(0, 8)}…` : tabId;

  return (
    <>
      <div className={`flex flex-col h-full min-h-0 ${className}`}>
        {/* UUID表示バー */}
        <div className="flex items-center gap-2 px-2 py-1 border-b border-border flex-shrink-0 bg-card">
          <span className="font-mono text-xs text-muted-foreground" title={tabId}>
            {shortTabId}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleCopyTabId}
            className="text-muted-foreground hover:text-foreground"
            title="Copy tab ID"
          >
            {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
          </Button>
          <Button size="xs" onClick={handleRunClaude} disabled={!isConnected} title="Run Claude">
            <Play className="w-3 h-3" />
            Run Claude
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setShowEditorModal(true)}
            disabled={!isConnected}
            className="text-muted-foreground hover:text-foreground"
            title="Open editor input"
          >
            <SquarePen className="w-3 h-3" />
            Open Editor
          </Button>
          {totalTodos > 0 && (
            <div
              className="ml-auto flex items-center gap-1.5 shrink-0"
              title={todos.find((t) => t.status === 'in_progress')?.content ?? ''}
            >
              <Progress
                value={completedTodos}
                max={totalTodos}
                className="w-16 gap-0 [&_[data-slot=progress-track]]:h-[3px]"
              />
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {completedTodos}/{totalTodos}
              </span>
            </div>
          )}
        </div>

        {/* Terminal エリア: xterm コンテナは常にDOMに存在（マウント要件）、接続中はオーバーレイで隠す */}
        <div className="relative flex-1 min-h-0 overflow-hidden">
          <div ref={containerRef} className="w-full h-full" style={{ padding: '4px' }} />

          {/* 接続中オーバーレイ: connected になると消える */}
          {isConnecting && (
            <div className="absolute inset-0 flex items-center justify-center bg-background">
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Connecting...</span>
              </div>
            </div>
          )}

          {/* exited / error: overlayで再接続を促す */}
          {isPausedOrExited && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/90">
              <div className="text-center space-y-2">
                {status === 'error' && (
                  <p className="text-xs text-destructive">Connection failed</p>
                )}
                {status === 'exited' && (
                  <p className="text-xs text-muted-foreground">Session ended</p>
                )}
                {status === 'paused' && <p className="text-xs text-muted-foreground">Paused</p>}
                <Button size="xs" onClick={reconnectSession}>
                  Reconnect
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Editor Input Modal */}
      <MonacoEditorModal
        open={showEditorModal}
        onOpenChange={(details) => {
          if (!details.open) setShowEditorModal(false);
        }}
        onSubmit={(text) => {
          // term.paste() を使うことで xterm の Bracketed Paste Mode を自動処理する。
          // bracketedPasteMode ON（Claude Code等）: \x1b[200~...\x1b[201~ でラップして改行をそのまま挿入
          // bracketedPasteMode OFF（通常シェル）: \r?\n → \r に変換（xterm 内部処理）
          if (termRef.current && text) {
            termRef.current.paste(text);
          }
          setShowEditorModal(false);
        }}
        title="Terminal Input"
        submitLabel="Paste"
      />
    </>
  );
});
