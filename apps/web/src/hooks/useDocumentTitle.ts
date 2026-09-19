'use client';
import { useEffect } from 'react';

const BASE = '繋';

/**
 * ドキュメントタイトルを `繋 | suffix` 形式で設定する。
 * unreadCount を渡すと `(3) 繋 | suffix` のように未読数を先頭に付ける。
 */
export function useDocumentTitle(suffix?: string | null, unreadCount = 0) {
  useEffect(() => {
    const base = unreadCount > 0 ? `(${unreadCount}) ${BASE}` : BASE;
    const next = suffix ? `${base} | ${suffix}` : base;
    const prev = document.title;
    document.title = next;
    return () => {
      document.title = prev;
    };
  }, [suffix, unreadCount]);
}
