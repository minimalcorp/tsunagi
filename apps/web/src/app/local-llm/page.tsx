'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, Bot, Loader2, Send, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { VoiceInputButton } from '@/components/VoiceInputButton';
import { markdownComponents } from '@/components/MarkdownComponents';
import { apiUrl } from '@/lib/api-url';
import { toaster } from '@/lib/toaster';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

type ServerStep =
  | 'not_running'
  | 'installing_deps'
  | 'downloading_model'
  | 'starting_server'
  | 'running'
  | 'running_external'
  | 'error';

const SERVER_UP_STEPS: ServerStep[] = ['running', 'running_external'];
const SERVER_STATUS_POLL_MS = 5000;

interface ServerInfo {
  step: ServerStep;
  serverDir: string | null;
  error?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface Metrics {
  firstTokenMs: number | null;
  totalMs: number;
  tokenCount: number;
}

const DEFAULT_SYSTEM_PROMPT =
  '以下の音声文字起こし結果を、意味を変えずに読みやすく整形してください。フィラー(えー、あの、など)や言い淀みの重複は除去し、適切な句読点を補ってください。';

export default function LocalLlmPage() {
  const router = useRouter();
  useDocumentTitle('local-llm');

  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [metrics, setMetrics] = useState<Record<string, Metrics>>({});
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);

  const nextIdRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const nextId = useCallback(() => {
    nextIdRef.current += 1;
    return `msg-${nextIdRef.current}`;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const res = await fetch(apiUrl('/api/llm/server/status'));
        const data = (await res.json()) as ServerInfo;
        if (!cancelled) setServerInfo(data);
      } catch {
        if (!cancelled) setServerInfo({ step: 'not_running', serverDir: null });
      }
    };
    void fetchStatus();
    const interval = setInterval(fetchStatus, SERVER_STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const serverReady = serverInfo !== null && SERVER_UP_STEPS.includes(serverInfo.step);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming || !serverReady) return;

    const userMessage: ChatMessage = { id: nextId(), role: 'user', content: text };
    const assistantId = nextId();
    const history = [...messages, userMessage];

    setMessages([...history, { id: assistantId, role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);

    const apiMessages = [
      ...(systemPrompt.trim() ? [{ role: 'system' as const, content: systemPrompt.trim() }] : []),
      ...history.map((m) => ({ role: m.role, content: m.content })),
    ];

    const startTime = performance.now();
    let firstTokenTime: number | null = null;
    let tokenCount = 0;
    let accumulated = '';

    try {
      const res = await fetch(apiUrl('/api/llm/chat'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `HTTPエラー: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const event of events) {
          const line = event.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice('data:'.length).trim();
          if (payload === '[DONE]') continue;

          try {
            const json = JSON.parse(payload);
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              if (firstTokenTime === null) firstTokenTime = performance.now();
              tokenCount += 1;
              accumulated += delta;
              const snapshot = accumulated;
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: snapshot } : m))
              );
            }
          } catch {
            // 不完全なチャンクの可能性があるためJSON parse失敗は無視する
          }
        }
      }

      setMetrics((prev) => ({
        ...prev,
        [assistantId]: {
          firstTokenMs: firstTokenTime !== null ? firstTokenTime - startTime : null,
          totalMs: performance.now() - startTime,
          tokenCount,
        },
      }));
    } catch (error) {
      toaster.create({
        type: 'error',
        title: '応答の取得に失敗しました',
        description: error instanceof Error ? error.message : String(error),
      });
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, serverReady, messages, systemPrompt, nextId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void sendMessage();
      }
    },
    [sendMessage]
  );

  return (
    <div className="h-screen flex flex-col bg-background">
      <div className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-border bg-card px-4">
        <Button variant="ghost" onClick={() => router.push('/settings')}>
          <ArrowLeft />
          設定へ戻る
        </Button>
        <h1 className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2 text-sm font-bold text-foreground">
          <Bot className="size-4" />
          ローカルLLM対話デモ
        </h1>
        <div />
      </div>

      {!serverReady ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <Card className="max-w-md">
            <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
              {serverInfo === null ? (
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <p className="font-medium text-foreground">
                    ローカルLLMサーバーが起動していません
                  </p>
                  <p className="text-xs/relaxed text-muted-foreground">
                    設定画面からローカルLLM(実験的機能)を有効化し、サーバーを起動してください。
                  </p>
                  <Button size="default" onClick={() => router.push('/settings')}>
                    <Settings />
                    設定を開く
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
          <div className="border-b border-border bg-card p-4">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              システムプロンプト
            </label>
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="min-h-12 text-xs"
              placeholder="システムプロンプト(空でも可)"
            />
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {messages.length === 0 && (
              <p className="text-center text-xs/relaxed text-muted-foreground">
                下の入力欄からメッセージを送信してください(音声入力も利用できます)。
              </p>
            )}
            {messages.map((message) => {
              const m = metrics[message.id];
              return (
                <div
                  key={message.id}
                  className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                >
                  <Card
                    className={
                      message.role === 'user' ? 'max-w-[80%] bg-primary/10' : 'max-w-[80%] bg-card'
                    }
                  >
                    <CardContent className="p-3">
                      {message.content ? (
                        <div className="prose prose-sm prose-slate dark:prose-invert max-w-none">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={markdownComponents}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      )}
                      {m && (
                        <p className="mt-2 text-[0.65rem] text-muted-foreground">
                          初回応答:{' '}
                          {m.firstTokenMs !== null ? `${Math.round(m.firstTokenMs)}ms` : '-'}
                          {' ・ '}
                          生成時間: {(m.totalMs / 1000).toFixed(1)}秒{' ・ '}
                          概算{m.tokenCount}トークン (
                          {m.totalMs > 0 ? (m.tokenCount / (m.totalMs / 1000)).toFixed(1) : '-'}{' '}
                          tok/s)
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-border bg-card p-4">
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="メッセージを入力... (Enterで送信、Shift+Enterで改行)"
                className="flex-1"
                disabled={streaming}
              />
              <VoiceInputButton
                onTranscribed={(text) => setInput((prev) => (prev ? `${prev} ${text}` : text))}
              />
              <Button
                size="icon"
                onClick={() => void sendMessage()}
                disabled={streaming || !input.trim()}
                title="送信"
              >
                {streaming ? <Loader2 className="animate-spin" /> : <Send />}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
