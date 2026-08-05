'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from '@/lib/api-url';
import { toaster } from '@/lib/toaster';

export type ServerStep =
  | 'not_running'
  | 'installing_deps'
  | 'downloading_model'
  | 'starting_server'
  | 'running'
  | 'running_external'
  | 'error';

export interface DownloadProgress {
  downloadedBytes: number;
  totalBytes: number;
  etaSeconds: number | null;
}

export type ServerInfo =
  | {
      mode: 'local';
      step: ServerStep;
      serverDir: string | null;
      downloadProgress?: DownloadProgress;
      error?: string;
    }
  | { mode: 'remote'; url: string; healthy: boolean };

export type LocalServerInfo = Extract<ServerInfo, { mode: 'local' }>;
export type RemoteServerInfo = Extract<ServerInfo, { mode: 'remote' }>;

export const IN_PROGRESS_STEPS: ServerStep[] = [
  'installing_deps',
  'downloading_model',
  'starting_server',
];
export const SERVER_UP_STEPS: ServerStep[] = ['running', 'running_external'];

export function isServerUp(info: ServerInfo | null): boolean {
  if (!info) return false;
  return info.mode === 'local' ? SERVER_UP_STEPS.includes(info.step) : info.healthy;
}

interface UseInferenceServerOptions {
  service: 'whisper' | 'llm';
  enabledStorageKey: string;
  enabledToastTitle: string;
  // マウント時、enabledフラグの読み込み・初回status取得と同じeffect内で呼ばれる
  // 追加の初期化処理(呼び出し側のlocalStorage由来の値の読み込みなど)。単独のeffectで
  // setState一つだけを呼ぶ形にすると`react-hooks/set-state-in-effect`に抵触するため、
  // 既存の初期化effectに相乗りさせる形にしている。
  onMount?: () => void;
}

// LocalLlmSection/VoiceInputSectionで完全に重複していたステータスポーリング・
// start/stop・mode切替(config保存)ロジックを共通化したフック。
export function useInferenceServer({
  service,
  enabledStorageKey,
  enabledToastTitle,
  onMount,
}: UseInferenceServerOptions) {
  const basePath = `/api/${service}/server`;
  const [enabled, setEnabledState] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onMountRef = useRef(onMount);
  onMountRef.current = onMount;

  const setEnabled = useCallback(
    (next: boolean) => {
      setEnabledState(next);
      localStorage.setItem(enabledStorageKey, String(next));
    },
    [enabledStorageKey]
  );

  const fetchStatus = useCallback(async (): Promise<ServerInfo> => {
    const res = await fetch(apiUrl(`${basePath}/status`));
    const data = (await res.json()) as ServerInfo;
    setServerInfo(data);
    return data;
  }, [basePath]);

  useEffect(() => {
    setEnabledState(localStorage.getItem(enabledStorageKey) === 'true');
    onMountRef.current?.();
    void fetchStatus();
  }, [fetchStatus, enabledStorageKey]);

  // サーバーが起動状態になったら、機能を自動で有効化して通知する。
  // 起動ボタンから待機した場合・モーダルを開いた時点で既に起動していた場合の両方をカバーする。
  useEffect(() => {
    if (serverInfo && isServerUp(serverInfo) && !enabled) {
      setEnabled(true);
      toaster.create({ type: 'success', title: enabledToastTitle });
    }
  }, [serverInfo, enabled, setEnabled, enabledToastTitle]);

  useEffect(() => {
    const inProgress = serverInfo?.mode === 'local' && IN_PROGRESS_STEPS.includes(serverInfo.step);
    if (inProgress && !pollRef.current) {
      pollRef.current = setInterval(() => {
        void fetchStatus().then((info) => {
          const stillInProgress = info.mode === 'local' && IN_PROGRESS_STEPS.includes(info.step);
          if (!stillInProgress && pollRef.current) {
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
      const res = await fetch(apiUrl(`${basePath}/start`), { method: 'POST' });
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
  }, [basePath]);

  const handleStop = useCallback(async () => {
    try {
      const res = await fetch(apiUrl(`${basePath}/stop`), { method: 'POST' });
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
  }, [basePath]);

  const handleDisable = useCallback(() => {
    setEnabled(false);
    // 無効化は機能フラグを消すだけでなく、実際に起動中のローカルサーバープロセスも
    // 停止する。元々停止していた場合にまで停止リクエストを送ると無駄なエラートーストが
    // 出てしまうため、起動中と分かっている場合のみ呼ぶ(リモートモードでは何もしない)。
    if (serverInfo?.mode === 'local' && isServerUp(serverInfo)) {
      void handleStop();
    }
  }, [setEnabled, handleStop, serverInfo]);

  // mode/remoteUrlの保存。ローカル→リモート切替時のローカルサーバー停止はバックエンド側
  // (/server/config)で行われるため、ここでは呼び出すだけでよい。
  const saveConfig = useCallback(
    async (mode: 'local' | 'remote', remoteUrl?: string): Promise<boolean> => {
      try {
        const res = await fetch(apiUrl(`${basePath}/config`), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode, remoteUrl }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || `HTTPエラー: ${res.status}`);
        }
        setServerInfo((await res.json()) as ServerInfo);
        return true;
      } catch (error) {
        toaster.create({
          type: 'error',
          title: '設定の保存に失敗しました',
          description: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    },
    [basePath]
  );

  return {
    enabled,
    setEnabled,
    handleDisable,
    modalOpen,
    setModalOpen,
    openModal,
    serverInfo,
    fetchStatus,
    handleStart,
    handleStop,
    saveConfig,
  };
}
