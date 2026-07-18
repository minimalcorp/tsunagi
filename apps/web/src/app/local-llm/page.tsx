'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, Bot, Loader2, Send, Settings, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { VoiceInputButton } from '@/components/VoiceInputButton';
import { markdownComponents } from '@/components/MarkdownComponents';
import { apiUrl } from '@/lib/api-url';
import { toaster } from '@/lib/toaster';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

type LlmProfile = 'instruct' | 'thinking';

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
const MAX_REVIEW_ROUNDS = 3;

const PROFILE_LABEL: Record<LlmProfile, string> = {
  instruct: '通常',
  thinking: 'シンキング',
};

// mlx_lm.serverのデフォルト(max_tokens=512)は、シンキングモードだと思考過程だけで
// 使い切ってしまい回答本文(content)に到達しないことがあるため、profileごとに
// 十分な上限を明示する。instructも短すぎて途中で切れないよう少し余裕を持たせる。
const PROFILE_MAX_TOKENS: Record<LlmProfile, number> = {
  instruct: 1536,
  thinking: 8192,
};

interface ServerInfo {
  step: ServerStep;
  serverDir: string | null;
  error?: string;
}

interface ApiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ReviewStep {
  label: string;
  content: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  reviewSteps?: ReviewStep[];
  stopped?: boolean;
}

interface Metrics {
  firstTokenMs: number | null;
  totalMs: number;
  tokenCount: number;
}

interface StreamSnapshot {
  text: string;
  reasoning: string;
}

interface StreamResult extends StreamSnapshot {
  firstTokenMs: number | null;
  totalMs: number;
  tokenCount: number;
}

const DEFAULT_SYSTEM_PROMPT =
  '以下は音声認識による文字起こし結果です。元の言葉遣いや言い回し、文章構成はできるだけそのまま維持してください。行ってよいのは句読点の追加と、明らかな誤字(音声認識の誤変換)の修正のみです。要約・言い換え・フィラーの除去・文の並び替えなどは行わないでください。';

const CRITIQUE_PROMPT =
  '直前の自分の回答を批判的に見直し、誤り・抜け・改善できる点を簡潔に指摘してください。指摘のみを述べ、回答の書き直しはまだしないでください。';

const REVISE_PROMPT =
  '直前の指摘を踏まえて、回答を改善してください。改善後の回答のみを出力し、指摘内容の繰り返しや前置きは不要です。';

// mlx_lm.serverの/v1/chat/completions(SSE)を叩き、ストリーミング中のテキストをonDeltaで
// 都度通知しつつ、完了時の全文・応答速度メトリクスをまとめて返す。
// draft生成・自己レビューの批評/改訂、いずれも同じ形の呼び出しになるため共通化している。
//
// シンキングモードのモデルは、回答本文とは別に思考過程を `delta.reasoning` として
// 送ってくる(`delta.content` には乗らない)。両方を別々に蓄積して呼び出し元へ渡す。
async function streamChatCompletion(
  apiMessages: ApiMessage[],
  profile: LlmProfile,
  onDelta: (snapshot: StreamSnapshot) => void,
  signal: AbortSignal
): Promise<StreamResult> {
  const startTime = performance.now();
  let firstTokenTime: number | null = null;
  let tokenCount = 0;
  let accumulated = '';
  let accumulatedReasoning = '';

  const res = await fetch(apiUrl('/api/llm/chat'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      messages: apiMessages,
      profile,
      max_tokens: PROFILE_MAX_TOKENS[profile],
    }),
    signal,
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
        const delta = json.choices?.[0]?.delta;
        const contentDelta: string | undefined = delta?.content;
        const reasoningDelta: string | undefined = delta?.reasoning;
        if (contentDelta || reasoningDelta) {
          if (firstTokenTime === null) firstTokenTime = performance.now();
          tokenCount += 1;
          if (contentDelta) accumulated += contentDelta;
          if (reasoningDelta) accumulatedReasoning += reasoningDelta;
          onDelta({ text: accumulated, reasoning: accumulatedReasoning });
        }
      } catch {
        // 不完全なチャンクの可能性があるためJSON parse失敗は無視する
      }
    }
  }

  return {
    text: accumulated,
    reasoning: accumulatedReasoning,
    firstTokenMs: firstTokenTime !== null ? firstTokenTime - startTime : null,
    totalMs: performance.now() - startTime,
    tokenCount,
  };
}

export default function LocalLlmPage() {
  const router = useRouter();
  useDocumentTitle('local-llm');

  const [profile, setProfile] = useState<LlmProfile>('instruct');
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [metrics, setMetrics] = useState<Record<string, Metrics>>({});
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [selfReviewEnabled, setSelfReviewEnabled] = useState(false);
  const [reviewRounds, setReviewRounds] = useState(1);

  const nextIdRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const nextId = useCallback(() => {
    nextIdRef.current += 1;
    return `msg-${nextIdRef.current}`;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const res = await fetch(apiUrl(`/api/llm/server/${profile}/status`));
        const data = (await res.json()) as ServerInfo;
        if (!cancelled) setServerInfo(data);
      } catch {
        if (!cancelled) setServerInfo({ step: 'not_running', serverDir: null });
      }
    };
    setServerInfo(null);
    void fetchStatus();
    const interval = setInterval(fetchStatus, SERVER_STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [profile]);

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

    setMessages([...history, { id: assistantId, role: 'assistant', content: '', reviewSteps: [] }]);
    setInput('');
    setStreaming(true);
    setStreamingMessageId(assistantId);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const { signal } = abortController;

    const overallStart = performance.now();
    const baseApiMessages: ApiMessage[] = [
      ...(systemPrompt.trim() ? [{ role: 'system' as const, content: systemPrompt.trim() }] : []),
      ...history.map((m) => ({ role: m.role, content: m.content })),
    ];

    try {
      setStage('下書きを生成中...');
      const draft = await streamChatCompletion(
        baseApiMessages,
        profile,
        (snapshot) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: snapshot.text, reasoning: snapshot.reasoning }
                : m
            )
          );
        },
        signal
      );

      let finalText = draft.text;
      let finalReasoning = draft.reasoning;
      const firstTokenMs = draft.firstTokenMs;
      let totalTokenCount = draft.tokenCount;
      const steps: ReviewStep[] = [];
      let conversation: ApiMessage[] = [
        ...baseApiMessages,
        { role: 'assistant', content: finalText },
      ];

      if (selfReviewEnabled && reviewRounds > 0) {
        for (let round = 1; round <= reviewRounds; round++) {
          setStage(`自己レビュー中... (${round}/${reviewRounds}: 批評)`);
          const critiqueMessages: ApiMessage[] = [
            ...conversation,
            { role: 'user', content: CRITIQUE_PROMPT },
          ];
          const critique = await streamChatCompletion(
            critiqueMessages,
            profile,
            (snapshot) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        reviewSteps: [
                          ...steps,
                          { label: `批評 ${round}`, content: snapshot.text || snapshot.reasoning },
                        ],
                      }
                    : m
                )
              );
            },
            signal
          );
          steps.push({ label: `批評 ${round}`, content: critique.text });
          totalTokenCount += critique.tokenCount;
          conversation = [...critiqueMessages, { role: 'assistant', content: critique.text }];

          setStage(`自己レビュー中... (${round}/${reviewRounds}: 改訂)`);
          const reviseMessages: ApiMessage[] = [
            ...conversation,
            { role: 'user', content: REVISE_PROMPT },
          ];
          const revise = await streamChatCompletion(
            reviseMessages,
            profile,
            (snapshot) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: snapshot.text,
                        reasoning: snapshot.reasoning,
                        reviewSteps: steps,
                      }
                    : m
                )
              );
            },
            signal
          );
          steps.push({ label: `改訂 ${round}`, content: revise.text });
          totalTokenCount += revise.tokenCount;
          finalText = revise.text;
          finalReasoning = revise.reasoning;
          conversation = [...reviseMessages, { role: 'assistant', content: revise.text }];
        }
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: finalText, reasoning: finalReasoning, reviewSteps: steps }
            : m
        )
      );
      setMetrics((prev) => ({
        ...prev,
        [assistantId]: {
          firstTokenMs,
          totalMs: performance.now() - overallStart,
          tokenCount: totalTokenCount,
        },
      }));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        // ユーザーが停止ボタンで中断した場合は、それまでにストリーミングされた
        // 内容(reasoning/content)をそのまま残し、エラー扱いにはしない。
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, stopped: true } : m))
        );
      } else {
        toaster.create({
          type: 'error',
          title: '応答の取得に失敗しました',
          description: error instanceof Error ? error.message : String(error),
        });
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      }
    } finally {
      abortControllerRef.current = null;
      setStreaming(false);
      setStreamingMessageId(null);
      setStage(null);
    }
  }, [
    input,
    streaming,
    serverReady,
    messages,
    systemPrompt,
    profile,
    selfReviewEnabled,
    reviewRounds,
    nextId,
  ]);

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

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
        <div className="flex items-center gap-0.5 rounded-md bg-input/20 p-0.5 dark:bg-input/30">
          {(['instruct', 'thinking'] as const).map((p) => (
            <Button
              key={p}
              variant="ghost"
              size="sm"
              onClick={() => setProfile(p)}
              disabled={streaming}
              className={
                profile === p
                  ? 'bg-primary text-primary-foreground hover:bg-primary/80 hover:text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }
            >
              {PROFILE_LABEL[p]}
            </Button>
          ))}
        </div>
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
                    {PROFILE_LABEL[profile]}モードのローカルLLMサーバーが起動していません
                  </p>
                  <p className="text-xs/relaxed text-muted-foreground">
                    設定画面からローカルLLM(実験的機能)を有効化し、{PROFILE_LABEL[profile]}
                    モードのサーバーを起動してください。
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
          <div className="border-b border-border bg-card p-4 space-y-3">
            <div>
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

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant={selfReviewEnabled ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelfReviewEnabled((prev) => !prev)}
              >
                自己レビュー: {selfReviewEnabled ? '有効' : '無効'}
              </Button>
              {selfReviewEnabled && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  レビュー回数
                  <Input
                    type="number"
                    min={1}
                    max={MAX_REVIEW_ROUNDS}
                    value={reviewRounds}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v)) {
                        setReviewRounds(Math.min(MAX_REVIEW_ROUNDS, Math.max(1, Math.round(v))));
                      }
                    }}
                    className="h-7 w-16"
                  />
                </label>
              )}
              <span className="text-[0.65rem] text-muted-foreground">
                (生成→自己批評→改訂 を指定回数繰り返します。回数分だけ生成が増え時間がかかります)
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {messages.length === 0 && (
              <p className="text-center text-xs/relaxed text-muted-foreground">
                下の入力欄からメッセージを送信してください(音声入力も利用できます)。
              </p>
            )}
            {messages.map((message) => {
              const m = metrics[message.id];
              const isActivelyStreaming = message.id === streamingMessageId;
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
                      {/* シンキングモードは回答本文(content)より前に思考過程(reasoning)を
                          送ってくる。content が空でも reasoning があれば「動いている」ことが
                          分かるよう、思考中はそのまま表示し、本文が出始めたら折りたたむ。
                          生成が終わったのに content が空のままなら、max_tokensの上限に
                          達して思考の途中で打ち切られたことをはっきり伝える。 */}
                      {message.reasoning && !message.content && (
                        <div className="mb-2 rounded-md bg-muted/50 p-2">
                          <p className="mb-1 flex items-center gap-1 text-[0.65rem] font-medium text-muted-foreground">
                            {isActivelyStreaming ? (
                              <>
                                <Loader2 className="size-3 animate-spin" />
                                思考中...
                              </>
                            ) : message.stopped ? (
                              'ユーザー操作により生成を停止しました(回答本文は未生成)'
                            ) : (
                              '思考の途中でトークン上限に達し、回答本文は生成されませんでした'
                            )}
                          </p>
                          <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                            {message.reasoning}
                          </p>
                        </div>
                      )}
                      {message.reasoning && message.content && (
                        <details className="mb-2 rounded-md border border-border p-2">
                          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                            思考過程を表示
                          </summary>
                          <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                            {message.reasoning}
                          </p>
                        </details>
                      )}

                      {message.content ? (
                        <div className="prose prose-sm prose-slate dark:prose-invert max-w-none">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={markdownComponents}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      ) : !message.reasoning && isActivelyStreaming ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      ) : null}

                      {message.stopped && message.content && (
                        <p className="mt-1 text-[0.65rem] text-muted-foreground">
                          (ユーザー操作により生成を停止しました、途中までの内容です)
                        </p>
                      )}

                      {!!message.reviewSteps?.length && (
                        <details className="mt-2 rounded-md border border-border p-2">
                          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                            レビュー履歴 ({message.reviewSteps.length}ステップ)
                          </summary>
                          <div className="mt-2 space-y-2">
                            {message.reviewSteps.map((step, i) => (
                              <div key={i}>
                                <p className="text-[0.65rem] font-medium text-muted-foreground">
                                  {step.label}
                                </p>
                                <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                                  {step.content}
                                </p>
                              </div>
                            ))}
                          </div>
                        </details>
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
            {stage && <p className="text-center text-xs/relaxed text-muted-foreground">{stage}</p>}
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
              {streaming ? (
                <Button
                  size="icon"
                  variant="destructive"
                  onClick={stopGeneration}
                  title="生成を停止"
                >
                  <Square />
                </Button>
              ) : (
                <Button
                  size="icon"
                  onClick={() => void sendMessage()}
                  disabled={!input.trim()}
                  title="送信"
                >
                  <Send />
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
