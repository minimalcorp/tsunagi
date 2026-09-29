'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { UpdateStatus } from '@minimalcorp/tsunagi-shared';
import { apiUrl, getServerUrl } from '@/lib/api-url';

const UpdateStatusContext = createContext<UpdateStatus | null>(null);

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

  return <UpdateStatusContext.Provider value={status}>{children}</UpdateStatusContext.Provider>;
}

/** 未取得なら null */
export function useUpdateStatus(): UpdateStatus | null {
  return useContext(UpdateStatusContext);
}
