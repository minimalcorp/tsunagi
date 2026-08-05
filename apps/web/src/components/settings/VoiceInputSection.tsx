'use client';

import { useCallback, useState } from 'react';
import { AlertCircle, CheckCircle2, CircleHelp, Loader2, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/Dialog';
import { Textarea } from '@/components/ui/textarea';
import { WHISPER_PROMPT_STORAGE_KEY } from '@/components/VoiceInputButton';
import { ModeToggle } from '@/components/settings/ModeToggle';
import { LocalServerPanel } from '@/components/settings/LocalServerPanel';
import { RemoteServerPanel } from '@/components/settings/RemoteServerPanel';
import { isServerUp, useInferenceServer, type ServerStep } from '@/hooks/useInferenceServer';

const STORAGE_KEY = 'tsunagi:voice-input-enabled';

const STEP_LABEL: Record<ServerStep, string> = {
  not_running: '停止中',
  installing_deps: '依存関係をインストール中...',
  downloading_model: 'モデルをダウンロード中...',
  starting_server: 'サーバーを起動中...',
  running: '実行中',
  running_external: '実行中 (tsunagi外で起動)',
  error: 'エラー',
};

export function VoiceInputSection() {
  const {
    enabled,
    handleDisable,
    modalOpen,
    setModalOpen,
    openModal,
    serverInfo,
    fetchStatus,
    handleStart,
    handleStop,
    saveConfig,
  } = useInferenceServer({
    service: 'whisper',
    enabledStorageKey: STORAGE_KEY,
    enabledToastTitle: '音声入力が有効化されました',
    onMount: () => setPrompt(localStorage.getItem(WHISPER_PROMPT_STORAGE_KEY) ?? ''),
  });
  const [prompt, setPrompt] = useState('');
  const [viewMode, setViewMode] = useState<'local' | 'remote'>('local');
  // serverInfo.modeが変わったらviewModeを追従させる(レンダー中に直接調整する
  // Reactの推奨パターン。effectでのderiveはreact-hooks/set-state-in-effectに抵触する)。
  const [syncedServerMode, setSyncedServerMode] = useState<'local' | 'remote' | undefined>(
    undefined
  );
  if (serverInfo && serverInfo.mode !== syncedServerMode) {
    setSyncedServerMode(serverInfo.mode);
    setViewMode(serverInfo.mode);
  }

  const handlePromptChange = useCallback(
    (next: string) => {
      setPrompt(next);
      localStorage.setItem(WHISPER_PROMPT_STORAGE_KEY, next);
    },
    [setPrompt]
  );

  const handleModeChange = useCallback(
    (next: 'local' | 'remote') => {
      setViewMode(next);
      // ローカルへの切替はURL入力が不要なため即保存する。リモートへの切替は
      // RemoteServerPanelでURLを入力・保存するまで待つ(空URLでの保存は
      // バックエンド側のバリデーションで拒否されるため)。
      if (next === 'local') void saveConfig('local');
    },
    [saveConfig]
  );

  const serverKnown = serverInfo !== null;
  const serverReady = isServerUp(serverInfo);

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
          Whisperを使って音声入力を行います。下記のローカルLLMも有効にすると、
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
              {!serverKnown ? (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  状態を確認中...
                </span>
              ) : serverInfo && serverReady ? (
                <span className="flex items-center gap-2 text-success">
                  <CheckCircle2 className="size-4" />
                  音声入力: 有効 ({serverInfo.mode === 'local' ? 'ローカル' : 'リモート'})
                </span>
              ) : (
                <span className="flex items-center gap-2 text-warning">
                  <AlertCircle className="size-4" />
                  音声入力: 有効化済み（サーバー未接続）
                </span>
              )}
              {serverInfo && serverInfo.mode === 'local' && (
                <span className="text-xs/relaxed text-muted-foreground">
                  ({STEP_LABEL[serverInfo.step]})
                </span>
              )}
              {serverInfo && !serverReady && (
                <Button size="default" onClick={openModal}>
                  <Mic />
                  {serverInfo.mode === 'local' ? 'サーバーを起動' : '接続設定を開く'}
                </Button>
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
                placeholder="例: 誤字、句読点、音声入力、Whisper、固有名詞や専門用語など"
                className="min-h-16 text-xs"
              />
              <p className="mt-1 text-[0.65rem] text-muted-foreground">
                よく使う単語(固有名詞・専門用語・同音異義語で誤変換されやすい単語など)を列挙すると、
                Whisperがその表記を優先しやすくなり誤変換が減ります。文章でなく単語の羅列でも構いません。空でも可。
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
              音声入力はWhisperを利用します。ローカルモードではmlx-whisperを使用します。精度・速度は環境・接続先に依存し、今後変更される可能性があります。
            </p>
          </div>

          <ModeToggle mode={viewMode} onChange={handleModeChange} />

          {viewMode === 'local' ? (
            <>
              <div>
                <p className="font-medium text-foreground">対応環境 (ローカルモード)</p>
                <p className="text-muted-foreground">
                  Apple Silicon Mac (M1/M2/M3/M4)
                  のみ対応。別マシンで動かす場合はリモートモードを利用してください。
                </p>
              </div>

              <div>
                <p className="font-medium text-foreground">
                  必要なもの（事前に手動でインストール）
                </p>
                <ul className="list-disc pl-5 text-muted-foreground">
                  <li>Python 3.9以降（Xcode Command Line Tools または Homebrew経由で入手可能）</li>
                </ul>
              </div>

              <div>
                <p className="mb-1 font-medium text-foreground">セットアップ・起動</p>
                <p className="text-muted-foreground">
                  下のボタンから、依存関係のインストール・モデルのダウンロード・サーバー起動まで自動で行われます（初回は数分かかります）。
                </p>
              </div>

              <div>
                <p className="mb-1 font-medium text-foreground">アンインストール</p>
                <p className="text-muted-foreground">
                  音声入力のためにダウンロードされるもの（Pythonの依存関係・Whisperモデル、合計約2.6GB）は全て
                  <code className="rounded bg-muted px-1">~/.tsunagi/whisper</code>
                  に保存されます。不要になった場合はこのディレクトリを削除するだけで、関連リソースを完全に削除できます。
                </p>
              </div>

              <LocalServerPanel
                serverInfo={serverInfo?.mode === 'local' ? serverInfo : null}
                startIcon={<Mic />}
                startLabel="Whisperサーバーを起動"
                startingServerLabel="サーバーを起動中..."
                downloadingLabel="モデルをダウンロード中..."
                notFoundLabel="whisper-serverが見つかりませんでした。インストールが壊れている可能性があります。"
                onStart={() => void handleStart()}
                onStop={() => void handleStop()}
              />
            </>
          ) : (
            <>
              <div>
                <p className="font-medium text-foreground">リモートモードについて</p>
                <p className="text-muted-foreground">
                  同一LAN上の別マシン(例:
                  GPU搭載のWindows機)で起動した推論サーバーに接続します。tsunagi側でのインストール・モデル管理は行いません。
                </p>
              </div>
              <RemoteServerPanel
                serviceLabel="Whisper"
                cliCommand="tsunagi whisper"
                serverInfo={serverInfo?.mode === 'remote' ? serverInfo : null}
                onSave={(url) => saveConfig('remote', url)}
                onRecheck={() => void fetchStatus()}
              />
            </>
          )}
        </div>
      </Dialog>
    </Card>
  );
}
