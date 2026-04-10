'use client';
import { useEffect } from 'react';

const BASE = '繋';

export function useDocumentTitle(suffix?: string | null) {
  useEffect(() => {
    const next = suffix ? `${BASE} | ${suffix}` : BASE;
    const prev = document.title;
    document.title = next;
    return () => {
      document.title = prev;
    };
  }, [suffix]);
}
