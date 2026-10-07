'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { RestartBlocker, UpdateStatus } from '@minimalcorp/tsunagi-shared';
import { apiUrl, getServerUrl } from '@/lib/api-url';

/** 再起動の要求結果。実行中のタスクがあれば blockers を返し、再起動しない */
export type RestartResult = { ok: true } | { ok: false; blockers: RestartBlocker[] };

interface UpdateStatusContextValue {
  status: UpdateStatus | null;
  /** 更新を適用するため再起動中（サーバーが戻るまで） */
  restarting: boolean;
  /** npm の最新バージョンを今すぐ確認する。失敗時は Error を投げる */
  checkNow: () => Promise<void>;
  /** インストール済みの新しいバージョンを再起動で適用する。失敗時は Error を投げる */
  restart: () => Promise<RestartResult>;
}

const UpdateStatusContext = createContext<UpdateStatusContextValue>({
  status: null,
  restarting: false,
  checkNow: async () => {},
  restart: async () => ({ ok: true }),
});

async function fetchStatus(): Promise<UpdateStatus | null> {
  try {
    const res = await fetch(apiUrl('/api/version'));
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: UpdateStatus };
    return json.data ?? null;
  } catch {
    return null;
  }
}

/**
 * npm の最新バージョンとの比較結果と自動更新の状態を全画面に配る。
 * root layout に1つだけ置き、ページ遷移で再取得・再接続しない。
 */
export function UpdateStatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [restarting, setRestarting] = useState(false);
  // このページを読み込んだ時点で動いていたバージョン
  const loadedVersionRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const applyStatus = (next: UpdateStatus) => {
      if (loadedVersionRef.current === undefined) loadedVersionRef.current = next.current;
      // 新しいバージョンで起動し直した: 画面の JS も新しいバージョンのものに読み直す
      if (next.current !== loadedVersionRef.current) {
        window.location.reload();
        return;
      }
      setStatus(next);
    };

    // polling 併用: iOS(WebKit) は Basic 認証情報を WS に付与しないため（認証付き公開時の iOS 対策）
    const socket = io(getServerUrl(), { transports: ['polling', 'websocket'] });
    socket.on('version:status', applyStatus);
    // 他の画面から再起動された場合も含めて、再起動中の表示に切り替える
    socket.on('version:restarting', () => setRestarting(true));
    // 初回と再起動後の再接続で最新の状態を取り直す。同じバージョンのまま戻った場合は
    // 起動に失敗してロールバックしたため、再起動中の表示をやめる
    socket.on('connect', () => {
      void fetchStatus().then((next) => {
        if (cancelled || !next) return;
        applyStatus(next);
        setRestarting(false);
      });
    });

    return () => {
      cancelled = true;
      socket.disconnect();
    };
  }, []);

  const checkNow = useCallback(async () => {
    const res = await fetch(apiUrl('/api/version/check'), { method: 'POST' });
    const json = (await res.json().catch(() => null)) as {
      data?: UpdateStatus;
      error?: string;
    } | null;
    if (!res.ok || !json?.data) {
      throw new Error(json?.error ?? `HTTP ${res.status}`);
    }
    setStatus(json.data);
  }, []);

  const restart = useCallback(async (): Promise<RestartResult> => {
    const res = await fetch(apiUrl('/api/version/restart'), { method: 'POST' });
    const json = (await res.json().catch(() => null)) as {
      data?: { blockers?: RestartBlocker[] };
      error?: string;
    } | null;
    if (res.status === 409) {
      return { ok: false, blockers: json?.data?.blockers ?? [] };
    }
    if (!res.ok) {
      throw new Error(json?.error ?? `HTTP ${res.status}`);
    }
    setRestarting(true);
    return { ok: true };
  }, []);

  return (
    <UpdateStatusContext.Provider value={{ status, restarting, checkNow, restart }}>
      {children}
    </UpdateStatusContext.Provider>
  );
}

/** 未取得なら null */
export function useUpdateStatus(): UpdateStatus | null {
  return useContext(UpdateStatusContext).status;
}

/** 手動で更新を確認する関数 */
export function useCheckForUpdate(): () => Promise<void> {
  return useContext(UpdateStatusContext).checkNow;
}

/** 再起動中かどうかと、再起動で更新を適用する関数 */
export function useRestartToUpdate(): {
  restarting: boolean;
  restart: () => Promise<RestartResult>;
} {
  const { restarting, restart } = useContext(UpdateStatusContext);
  return { restarting, restart };
}
