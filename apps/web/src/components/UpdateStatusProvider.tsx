'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { UpdateStatus } from '@minimalcorp/tsunagi-shared';
import { apiUrl, getServerUrl } from '@/lib/api-url';

interface UpdateStatusContextValue {
  status: UpdateStatus | null;
  /** npm の最新バージョンを今すぐ確認する。失敗時は Error を投げる */
  checkNow: () => Promise<void>;
}

const UpdateStatusContext = createContext<UpdateStatusContextValue>({
  status: null,
  checkNow: async () => {},
});

/**
 * npm の最新バージョンとの比較結果を全画面に配る。
 * root layout に1つだけ置き、ページ遷移で再取得・再接続しない。
 */
export function UpdateStatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl('/api/version'))
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data?: UpdateStatus } | null) => {
        if (!cancelled && json?.data) setStatus(json.data);
      })
      .catch(() => {});

    // polling 併用: iOS(WebKit) は Basic 認証情報を WS に付与しないため（認証付き公開時の iOS 対策）
    const socket = io(getServerUrl(), { transports: ['polling', 'websocket'] });
    socket.on('version:status', (next: UpdateStatus) => setStatus(next));

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

  return (
    <UpdateStatusContext.Provider value={{ status, checkNow }}>
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
