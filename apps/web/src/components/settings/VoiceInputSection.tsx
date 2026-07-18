'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, CircleHelp, Loader2, Mic, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/Dialog';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { apiUrl } from '@/lib/api-url';
import { toaster } from '@/lib/toaster';
import { WHISPER_PROMPT_STORAGE_KEY } from '@/components/VoiceInputButton';

const STORAGE_KEY = 'tsunagi:voice-input-enabled';

type ServerStep =
  | 'not_running'
  | 'installing_deps'
  | 'downloading_model'
  | 'starting_server'
  | 'running'
  | 'running_external'
  | 'error';

interface DownloadProgress {
  downloadedBytes: number;
  totalBytes: number;
  etaSeconds: number | null;
}

interface ServerInfo {
  step: ServerStep;
  serverDir: string | null;
  downloadProgress?: DownloadProgress;
  error?: string;
}

const STEP_LABEL: Record<ServerStep, string> = {
  not_running: '停止中',
  installing_deps: '依存関係をインストール中...',
  downloading_model: 'モデルをダウンロード中...',
  starting_server: 'サーバーを起動中...',
  running: '実行中',
  running_external: '実行中 (tsunagi外で起動)',
  error: 'エラー',
};

const IN_PROGRESS_STEPS: ServerStep[] = ['installing_deps', 'downloading_model', 'starting_server'];
const SERVER_UP_STEPS: ServerStep[] = ['running', 'running_external'];

function formatBytes(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 0.1) return `${gb.toFixed(2)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

function formatEta(seconds: number | null): string {
  if (seconds === null) return '残り時間を計算中...';
  if (seconds < 60) return `残り約${seconds}秒`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `残り約${min}分${sec}秒`;
}

export function VoiceInputSection() {
  const [enabled, setEnabledState] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [prompt, setPrompt] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  }, []);

  const handlePromptChange = useCallback((next: string) => {
    setPrompt(next);
    localStorage.setItem(WHISPER_PROMPT_STORAGE_KEY, next);
  }, []);

  const fetchStatus = useCallback(async (): Promise<ServerInfo> => {
    const res = await fetch(apiUrl('/api/whisper/server/status'));
    const data = (await res.json()) as ServerInfo;
    setServerInfo(data);
    return data;
  }, []);

  useEffect(() => {
    setEnabledState(localStorage.getItem(STORAGE_KEY) === 'true');
    setPrompt(localStorage.getItem(WHISPER_PROMPT_STORAGE_KEY) ?? '');
    void fetchStatus();
  }, [fetchStatus]);

  // サーバーが起動状態になったら、音声入力を自動で有効化して通知する。
  // 起動ボタンから待機した場合・モーダルを開いた時点で既に起動していた場合の両方をカバーする。
  useEffect(() => {
    if (serverInfo && SERVER_UP_STEPS.includes(serverInfo.step) && !enabled) {
      setEnabled(true);
      toaster.create({ type: 'success', title: '音声入力が有効化されました' });
    }
  }, [serverInfo, enabled, setEnabled]);

  useEffect(() => {
    if (serverInfo && IN_PROGRESS_STEPS.includes(serverInfo.step) && !pollRef.current) {
      pollRef.current = setInterval(() => {
        void fetchStatus().then((info) => {
          if (!IN_PROGRESS_STEPS.includes(info.step) && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        });
      }, 1000);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [serverInfo, fetchStatus]);

  const openModal = useCallback(() => {
    void fetchStatus();
    setModalOpen(true);
  }, [fetchStatus]);

  const handleStart = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/whisper/server/start'), { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `HTTPエラー: ${res.status}`);
      }
      setServerInfo((await res.json()) as ServerInfo);
    } catch (error) {
      toaster.create({
        type: 'error',
        title: 'サーバーの起動に失敗しました',
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  const handleStop = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/whisper/server/stop'), { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `HTTPエラー: ${res.status}`);
      }
      setServerInfo((await res.json()) as ServerInfo);
    } catch (error) {
      toaster.create({
        type: 'error',
        title: 'サーバーの停止に失敗しました',
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  const handleDisable = useCallback(() => {
    setEnabled(false);
  }, [setEnabled]);

  const serverDir = serverInfo?.serverDir;
  const progress = serverInfo?.downloadProgress;
  const progressPercent = progress ? (progress.downloadedBytes / progress.totalBytes) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-1">
          <CardTitle>音声入力 (実験的機能)</CardTitle>
          <Button variant="ghost" size="icon-sm" onClick={openModal} title="音声入力について">
            <CircleHelp />
          </Button>
        </div>
        <CardDescription>
          ローカルで動作するWhisperを使って音声入力を行います。下記のローカルLLMも有効にすると、
          文字起こし結果がLLMで自動整形されます(無効時は文字起こし結果をそのまま使用)。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!enabled ? (
          <Button size="default" onClick={openModal}>
            <Mic />
            音声入力を有効化する
          </Button>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-2 text-success">
                <CheckCircle2 className="size-4" />
                音声入力: 有効
              </span>
              {serverInfo && (
                <span className="text-xs/relaxed text-muted-foreground">
                  ({STEP_LABEL[serverInfo.step]})
                </span>
              )}
              <Button size="default" variant="outline" onClick={handleDisable}>
                無効にする
              </Button>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                文字起こしプロンプト (任意)
              </label>
              <Textarea
                value={prompt}
                onChange={(e) => handlePromptChange(e.target.value)}
                placeholder="例: 句読点を適切に打ってください。固有名詞は正確に表記してください。"
                className="min-h-16 text-xs"
              />
              <p className="mt-1 text-[0.65rem] text-muted-foreground">
                Whisperの文字起こしスタイル(表記ゆれ・句読点・固有名詞など)を誘導するヒントです。空でも構いません。
              </p>
            </div>
          </>
        )}
      </CardContent>

      <Dialog
        open={modalOpen}
        onOpenChange={({ open }) => setModalOpen(open)}
        title="音声入力について"
        maxWidth="2xl"
      >
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-medium text-foreground">実験的機能です</p>
            <p className="text-muted-foreground">
              音声入力はローカルで動作するWhisper (mlx-whisper)
              を利用します。精度・速度は環境に依存し、今後変更される可能性があります。
            </p>
          </div>

          <div>
            <p className="font-medium text-foreground">対応環境</p>
            <p className="text-muted-foreground">
              Apple Silicon Mac (M1/M2/M3/M4) のみ対応。Windows/Linuxでは利用できません。
            </p>
          </div>

          <div>
            <p className="font-medium text-foreground">必要なもの（事前に手動でインストール）</p>
            <ul className="list-disc pl-5 text-muted-foreground">
              <li>Python 3.9以降（Xcode Command Line Tools または Homebrew経由で入手可能）</li>
            </ul>
          </div>

          <div>
            <p className="mb-1 font-medium text-foreground">セットアップ・起動</p>
            <p className="text-muted-foreground">
              下のボタンから、依存関係のインストール・モデルのダウンロード・サーバー起動まで自動で行われます（初回は数分かかります）。
            </p>
            {serverInfo && !serverDir && (
              <p className="mt-1 text-destructive">
                whisper-serverが見つかりませんでした。インストールが壊れている可能性があります。
              </p>
            )}
          </div>

          <div>
            <p className="mb-1 font-medium text-foreground">アンインストール</p>
            <p className="text-muted-foreground">
              音声入力のためにダウンロードされるもの（Pythonの依存関係・Whisperモデル、合計約2.6GB）は全て
              <code className="rounded bg-muted px-1">~/.tsunagi/whisper</code>
              に保存されます。不要になった場合はこのディレクトリを削除するだけで、関連リソースを完全に削除できます。
            </p>
          </div>

          <div className="border-t border-border pt-4">
            {(!serverInfo || serverInfo.step === 'not_running' || serverInfo.step === 'error') && (
              <div className="flex flex-col gap-2">
                <Button size="default" onClick={() => void handleStart()} disabled={!serverInfo}>
                  {serverInfo ? <Mic /> : <Loader2 className="animate-spin" />}
                  Whisperサーバーを起動
                </Button>
                {serverInfo?.step === 'error' && serverInfo.error && (
                  <p className="text-xs/relaxed text-destructive">{serverInfo.error}</p>
                )}
              </div>
            )}

            {serverInfo?.step === 'installing_deps' && (
              <Button size="default" disabled>
                <Loader2 className="animate-spin" />
                依存関係をインストール中... (数分かかる場合があります)
              </Button>
            )}

            {serverInfo?.step === 'downloading_model' && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs/relaxed text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  モデルをダウンロード中...
                </div>
                {progress && (
                  <>
                    <Progress value={progressPercent} />
                    <p className="text-xs/relaxed text-muted-foreground">
                      {formatBytes(progress.downloadedBytes)} / {formatBytes(progress.totalBytes)} (
                      {progressPercent.toFixed(0)}%) ・ {formatEta(progress.etaSeconds)}
                    </p>
                  </>
                )}
              </div>
            )}

            {serverInfo?.step === 'starting_server' && (
              <Button size="default" disabled>
                <Loader2 className="animate-spin" />
                サーバーを起動中...
              </Button>
            )}

            {serverInfo && SERVER_UP_STEPS.includes(serverInfo.step) && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-2 text-success">
                  <CheckCircle2 className="size-4" />
                  サーバーは起動しています
                </span>
                {/* tsunagi外(make whisper等)で起動された場合(running_external)も、
                    ポート番号を手がかりに停止できるため、起動中は常に停止ボタンを出す。 */}
                <Button size="default" variant="outline" onClick={() => void handleStop()}>
                  <Square />
                  サーバーを停止
                </Button>
              </div>
            )}
          </div>
        </div>
      </Dialog>
    </Card>
  );
}
