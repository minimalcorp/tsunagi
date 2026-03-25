'use client';

import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { MonacoEditorModal } from '@/components/MonacoEditorModal';

const FASTIFY_API_BASE = 'http://localhost:2792';

interface EditorSession {
  sessionId: string;
  content: string;
}

export function EditorSessionProvider() {
  const [session, setSession] = useState<EditorSession | null>(null);

  useEffect(() => {
    const socket = io(FASTIFY_API_BASE, { transports: ['websocket'] });

    socket.on('editor:open', ({ sessionId, content }: EditorSession) => {
      setSession({ sessionId, content });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // session が非null → null に変化したタイミングで正確に1回だけ発火する。
  // Esc / Cancel / Submit どのパスで閉じても確実に Ctrl+L がターミナルに送られる。
  const prevSessionRef = useRef<EditorSession | null>(null);
  useEffect(() => {
    if (prevSessionRef.current !== null && session === null) {
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
