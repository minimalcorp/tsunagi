'use client';

import { useSyncExternalStore } from 'react';
import type { ActivityKind } from '@/lib/agent-status';

const STORAGE_KEY = 'tsunagi:sidebar-tasks';

/** 詳細ページ左のタスク一覧の状態（localStorage に保存し、同じプロファイルの全タブで共有する） */
export interface SidebarTaskListState {
  /** 一覧に表示するタスクID（追加順） */
  shown: string[];
  /**
   * 一覧から外したタスクと、外した時点の状態。
   * 状態が変わるまでは再追加しない（未読のまま外したタスクが即座に戻らないように）
   */
  dismissed: Record<string, ActivityKind | null>;
  /** スワイプ操作のヒントを表示済みか */
  hintSeen: boolean;
}

const EMPTY: SidebarTaskListState = { shown: [], dismissed: {}, hintSeen: false };

const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedState: SidebarTaskListState = EMPTY;

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function getSnapshot(): SidebarTaskListState {
  const raw = readRaw();
  if (raw === cachedRaw) return cachedState;
  cachedRaw = raw;
  try {
    const parsed = raw ? (JSON.parse(raw) as Partial<SidebarTaskListState>) : {};
    cachedState = {
      shown: Array.isArray(parsed.shown) ? parsed.shown : [],
      dismissed: parsed.dismissed ?? {},
      hintSeen: parsed.hintSeen === true,
    };
  } catch {
    cachedState = EMPTY;
  }
  return cachedState;
}

function getServerSnapshot(): SidebarTaskListState {
  return EMPTY;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // 他のタブでの変更（同じタブ内の変更では storage イベントは発火しない）
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** 現在の状態から次の状態を作って保存する（同じ参照を返した場合は保存しない） */
function updateState(updater: (prev: SidebarTaskListState) => SidebarTaskListState) {
  const prev = getSnapshot();
  const next = updater(prev);
  if (next === prev) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 保存できない環境（プライベートモード等）では永続化を諦める
    cachedRaw = null;
    cachedState = next;
  }
  listeners.forEach((listener) => listener());
}

export function useSidebarTaskList() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { state, update: updateState };
}
