'use client';

import { useCallback, useSyncExternalStore } from 'react';

export type TaskViewMode = 'terminal' | 'split' | 'editor';

const VIEW_MODE_KEY = 'tsunagi:task-view-mode';
const SUBMIT_ON_SEND_KEY = 'tsunagi:editor-submit-on-send';
/** これ未満の幅では左右分割を選べない */
const SPLIT_MEDIA_QUERY = '(min-width: 1024px)';

const listeners = new Set<() => void>();

function subscribeStorage(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 保存できなくても、今の画面の操作は妨げない
  }
  listeners.forEach((listener) => listener());
}

function subscribeSplitQuery(listener: () => void) {
  const mql = window.matchMedia(SPLIT_MEDIA_QUERY);
  mql.addEventListener('change', listener);
  return () => mql.removeEventListener('change', listener);
}

function readStoredMode(): TaskViewMode {
  const stored = read(VIEW_MODE_KEY);
  return stored === 'split' || stored === 'editor' ? stored : 'terminal';
}

/** タスク詳細の表示モード。選択は保存し、分割を選べない幅ではターミナルのみで表示する */
export function useTaskViewMode() {
  const storedMode = useSyncExternalStore(
    subscribeStorage,
    readStoredMode,
    () => 'terminal' as const
  );
  const canSplit = useSyncExternalStore(
    subscribeSplitQuery,
    () => window.matchMedia(SPLIT_MEDIA_QUERY).matches,
    () => true
  );
  const setMode = useCallback((mode: TaskViewMode) => write(VIEW_MODE_KEY, mode), []);

  return {
    mode: storedMode === 'split' && !canSplit ? ('terminal' as const) : storedMode,
    canSplit,
    setMode,
  };
}

/** 送信後に Enter で確定するかのフラグ。初期値は OFF */
export function useSubmitOnSend() {
  const submitOnSend = useSyncExternalStore(
    subscribeStorage,
    () => read(SUBMIT_ON_SEND_KEY) === 'true',
    () => false
  );
  const setSubmitOnSend = useCallback(
    (value: boolean) => write(SUBMIT_ON_SEND_KEY, String(value)),
    []
  );
  return { submitOnSend, setSubmitOnSend };
}
