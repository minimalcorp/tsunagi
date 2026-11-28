'use client';

import { useSyncExternalStore } from 'react';

/**
 * 単体ページで最近開いた Markdown（ブラウザごとの利便機能のため localStorage に保持）。
 */

const STORAGE_KEY = 'tsunagi:markdown-viewer-recent';
const LIMIT = 20;

export interface RecentFile {
  path: string;
  openedAt: number;
  done: number;
  total: number;
}

const EMPTY: RecentFile[] = [];
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedFiles: RecentFile[] = EMPTY;

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function getSnapshot(): RecentFile[] {
  const raw = readRaw();
  if (raw === cachedRaw) return cachedFiles;
  cachedRaw = raw;
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    cachedFiles = Array.isArray(parsed)
      ? (parsed as RecentFile[]).filter((f) => typeof f?.path === 'string')
      : EMPTY;
  } catch {
    cachedFiles = EMPTY;
  }
  return cachedFiles;
}

function getServerSnapshot(): RecentFile[] {
  return EMPTY;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function write(files: RecentFile[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files.slice(0, LIMIT)));
  } catch {
    // 保存できなくても表示には影響しない
  }
  listeners.forEach((listener) => listener());
}

export function useRecentFiles(): RecentFile[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function recordRecentFile(file: RecentFile) {
  write([file, ...getSnapshot().filter((f) => f.path !== file.path)]);
}

export function removeRecentFile(path: string) {
  write(getSnapshot().filter((f) => f.path !== path));
}

export function clearRecentFiles() {
  write([]);
}

export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const minutes = Math.floor((now - timestamp) / 60000);
  if (minutes < 1) return 'たった今';
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '昨日';
  if (days < 7) return `${days}日前`;
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
