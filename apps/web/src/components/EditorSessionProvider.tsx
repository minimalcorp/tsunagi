'use client';

import { useEffect, useRef, useState } from 'react';
import { MonacoEditorModal } from '@/components/MonacoEditorModal';

const FASTIFY_API_BASE = 'http://localhost:2792';

interface EditorSession {
  sessionId: string;
  content: string;
}

export function EditorSessionProvider() {
  const [session, setSession] = useState<EditorSession | null>(null);

  // TerminalViewのsocketから転送されるカスタムイベントをリッスン
  // （editor:openはtabルーム宛に送信されるため、該当タブのTerminalViewのみが受信→転送する）
  useEffect(() => {
    function handleOpenRequest(e: Event) {
      const { sessionId, content } = (e as CustomEvent<EditorSession>).detail;
      setSession({ sessionId, content });
    }

    window.addEventListener('editor-session-open-request', handleOpenRequest);
    return () => {
      window.removeEventListener('editor-session-open-request', handleOpenRequest);
    };
  }, []);

  // session の変化を監視してカスタムイベントを発火する。
  // open: xterm の blur と customKeyEventHandler の無効化を TerminalView に通知
  // done: Ctrl+L 送信と focus 復帰を TerminalView に通知
  const prevSessionRef = useRef<EditorSession | null>(null);
  useEffect(() => {
    const prev = prevSessionRef.current;
    if (prev === null && session !== null) {
      window.dispatchEvent(new CustomEvent('editor-session-open'));
    }
    if (prev !== null && session === null) {
      window.dispatchEvent(new CustomEvent('editor-session-done'));
    }
    prevSessionRef.current = session;
  }, [session]);

  async function handleSubmit(text: string) {
    if (!session) return;
    await fetch(`${FASTIFY_API_BASE}/api/editor/session/${session.sessionId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
    });
    setSession(null);
  }

  async function handleCancel() {
    if (!session) return;
    // Cancel / Esc / × ボタンで閉じた場合、元のコンテンツで complete を呼ぶ。
    // これにより shell script が正常終了し、Claude Code は元の状態に戻る。
    await fetch(`${FASTIFY_API_BASE}/api/editor/session/${session.sessionId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: session.content }),
    });
    setSession(null);
  }

  return (
    <MonacoEditorModal
      open={session !== null}
      onOpenChange={(details) => {
        if (!details.open) handleCancel();
      }}
      onSubmit={handleSubmit}
      initialValue={session?.content ?? ''}
      title="Edit Prompt"
      submitLabel="Submit"
    />
  );
}
