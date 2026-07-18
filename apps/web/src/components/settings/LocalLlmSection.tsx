'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, CheckCircle2, CircleHelp, Loader2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/Dialog';
import { Progress } from '@/components/ui/progress';
import { apiUrl } from '@/lib/api-url';
import { toaster } from '@/lib/toaster';

const STORAGE_KEY = 'tsunagi:local-llm-enabled';
// 音声入力(VoiceInputButton)から、文字起こし結果をLLMで整形するかどうかの
// 判定にも使う共有フラグ。
export const LOCAL_LLM_ENABLED_STORAGE_KEY = STORAGE_KEY;

type LlmProfile = 'instruct' | 'thinking';

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
  starting_server: 'サーバーを起動中... (モデルのロードに数十秒かかる場合があります)',
  running: '実行中',
  running_external: '実行中 (tsunagi外で起動)',
  error: 'エラー',
};

const IN_PROGRESS_STEPS: ServerStep[] = ['installing_deps', 'downloading_model', 'starting_server'];
const SERVER_UP_STEPS: ServerStep[] = ['running', 'running_external'];

const PROFILE_LABEL: Record<LlmProfile, string> = {
  instruct: '通常モード (Instruct)',
  thinking: 'シンキングモード (Thinking)',
};

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

// 1つのprofile(instruct/thinking)のサーバー状態取得・ポーリング・起動/停止を管理する。
// LocalLlmSectionの直下でprofileごとに1回だけ呼び出し、結果をUIへpropsとして渡す
// (Dialogの開閉に関わらずポーリングを継続させ、かつ二重ポーリングを避けるため)。
function useLlmProfileStatus(profile: LlmProfile) {
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async (): Promise<ServerInfo> => {
    const res = await fetch(apiUrl(`/api/llm/server/${profile}/status`));
    const data = (await res.json()) as ServerInfo;
    setServerInfo(data);
    return data;
  }, [profile]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

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

  const handleStart = useCallback(async () => {
    try {
      const res = await fetch(apiUrl(`/api/llm/server/${profile}/start`), { method: 'POST' });
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
  }, [profile]);

  const handleStop = useCallback(async () => {
    try {
      const res = await fetch(apiUrl(`/api/llm/server/${profile}/stop`), { method: 'POST' });
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
  }, [profile]);

  return { serverInfo, handleStart, handleStop };
}

interface LlmProfileControlProps {
  profile: LlmProfile;
  serverInfo: ServerInfo | null;
  onStart: () => void;
  onStop: () => void;
}

// 表示専用コンポーネント。状態取得はuseLlmProfileStatusが担い、ここではpropsを描画するだけ。
function LlmProfileControl({ profile, serverInfo, onStart, onStop }: LlmProfileControlProps) {
  const progress = serverInfo?.downloadProgress;
  const progressPercent = progress ? (progress.downloadedBytes / progress.totalBytes) * 100 : 0;

  return (
    <div className="rounded-md border border-border p-3">
      <p className="mb-2 font-medium text-foreground">{PROFILE_LABEL[profile]}</p>

      {(!serverInfo || serverInfo.step === 'not_running' || serverInfo.step === 'error') && (
        <div className="flex flex-col gap-2">
          <Button size="default" onClick={onStart} disabled={!serverInfo}>
            {serverInfo ? <Bot /> : <Loader2 className="animate-spin" />}
            起動
          </Button>
          {serverInfo?.step === 'error' && serverInfo.error && (
            <p className="text-xs/relaxed text-destructive">{serverInfo.error}</p>
          )}
          {serverInfo && !serverInfo.serverDir && (
            <p className="text-xs/relaxed text-destructive">
              llm-serverが見つかりませんでした。インストールが壊れている可能性があります。
            </p>
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
            モデルをダウンロード中... (約17GB)
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
            {STEP_LABEL[serverInfo.step]}
          </span>
          {/* tsunagi外(make llm等)で起動された場合(running_external)も、
              ポート番号を手がかりに停止できるため、起動中は常に停止ボタンを出す。 */}
          <Button size="default" variant="outline" onClick={onStop}>
            <Square />
            停止
          </Button>
        </div>
      )}
    </div>
  );
}

export function LocalLlmSection() {
  const [enabled, setEnabledState] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const notifiedRef = useRef(false);

  const instruct = useLlmProfileStatus('instruct');
  const thinking = useLlmProfileStatus('thinking');

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  }, []);

  useEffect(() => {
    // SSR時はlocalStorageが存在しないため、hydration後にこのeffectで実際の値を反映する。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabledState(localStorage.getItem(STORAGE_KEY) === 'true');
  }, []);

  const anyRunning = [instruct.serverInfo, thinking.serverInfo].some(
    (info) => info && SERVER_UP_STEPS.includes(info.step)
  );

  // どちらかのサーバーが起動状態になったら、ローカルLLMを自動で有効化して通知する。
  useEffect(() => {
    if (anyRunning && !enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEnabled(true);
      if (!notifiedRef.current) {
        notifiedRef.current = true;
        toaster.create({ type: 'success', title: 'ローカルLLMが有効化されました' });
      }
    }
  }, [anyRunning, enabled, setEnabled]);

  const handleDisable = useCallback(() => {
    setEnabled(false);
  }, [setEnabled]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-1">
          <CardTitle>ローカルLLM (実験的機能)</CardTitle>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setModalOpen(true)}
            title="ローカルLLMについて"
          >
            <CircleHelp />
          </Button>
        </div>
        <CardDescription>
          ローカルで動作するLLM(Qwen3-30B-A3B, MoE)を利用します。
          <strong className="font-medium text-foreground">
            有効にすると、音声入力の文字起こし結果がこのLLMで自動整形されるようになります
          </strong>
          (無効時は文字起こし結果をそのまま使用)。通常モード・シンキングモードの2つのモデルを個別に起動・停止できます。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!enabled ? (
          <Button size="default" onClick={() => setModalOpen(true)}>
            <Bot />
            ローカルLLMを有効化する
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-2 text-success">
              <CheckCircle2 className="size-4" />
              ローカルLLM: 有効
            </span>
            <Button size="default" variant="outline" onClick={() => setModalOpen(true)}>
              サーバー管理
            </Button>
            <Button size="default" variant="outline" onClick={handleDisable}>
              無効にする
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog
        open={modalOpen}
        onOpenChange={({ open }) => setModalOpen(open)}
        title="ローカルLLMについて"
        maxWidth="2xl"
      >
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-medium text-foreground">実験的機能です</p>
            <p className="text-muted-foreground">
              音声入力の文字起こし結果を、ローカルで動作するLLM(mlx-lm / Qwen3-30B-A3B,
              MoE構成)で整形します。MoE構成のため実計算に使うアクティブパラメータは約3Bで、denseな同規模モデルより高速に動作します。通常モード(Instruct、実際の整形に使用)とシンキングモード(Thinking,
              回答前に推論する)の2種類があり、それぞれ別プロセス・別モデルとして動作します。精度・速度は環境に依存し、今後変更される可能性があります。
            </p>
          </div>

          <div>
            <p className="font-medium text-foreground">対応環境</p>
            <p className="text-muted-foreground">
              Apple Silicon Mac (M1/M2/M3/M4)
              のみ対応。Windows/Linuxでは利用できません。メモリ32GB以上を推奨します(両モード同時起動時は約35GB消費するため64GB推奨)。
            </p>
          </div>

          <div>
            <p className="font-medium text-foreground">必要なもの（事前に手動でインストール）</p>
            <ul className="list-disc pl-5 text-muted-foreground">
              <li>Python 3.9以降（Xcode Command Line Tools または Homebrew経由で入手可能）</li>
            </ul>
          </div>

          <div>
            <p className="mb-1 font-medium text-foreground">アンインストール</p>
            <p className="text-muted-foreground">
              ローカルLLMのためにダウンロードされるもの（Pythonの依存関係・LLMモデル、1モデルあたり約17GB）は全て
              <code className="rounded bg-muted px-1">~/.tsunagi/llm</code>
              に保存されます。不要になった場合はこのディレクトリを削除するだけで、関連リソースを完全に削除できます。
            </p>
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <p className="font-medium text-foreground">サーバー管理</p>
            <LlmProfileControl
              profile="instruct"
              serverInfo={instruct.serverInfo}
              onStart={() => void instruct.handleStart()}
              onStop={() => void instruct.handleStop()}
            />
            <LlmProfileControl
              profile="thinking"
              serverInfo={thinking.serverInfo}
              onStart={() => void thinking.handleStart()}
              onStop={() => void thinking.handleStop()}
            />
          </div>
        </div>
      </Dialog>
    </Card>
  );
}
