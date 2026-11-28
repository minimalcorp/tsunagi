'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from '@/lib/api-url';
import { getSharedSocket } from '@/lib/socket';
import { toaster } from '@/lib/toaster';
import { toggleTaskAt } from './markdown-utils';

export interface MarkdownFileData {
  /** サーバーが解決した realpath */
  path: string;
  content: string;
  mtimeMs: number;
}

export type MarkdownFileState =
  | { status: 'loading' }
  | { status: 'error'; httpStatus: number; message: string }
  | { status: 'ready'; data: MarkdownFileData };

async function fetchMarkdown(
  filePath: string
): Promise<{ ok: true; data: MarkdownFileData } | { ok: false; status: number; message: string }> {
  try {
    const res = await fetch(apiUrl(`/api/markdown?path=${encodeURIComponent(filePath)}`), {
      cache: 'no-store',
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, message: body.error ?? res.statusText };
    return { ok: true, data: body.data as MarkdownFileData };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * Markdown ファイルの取得・変更監視・タスクのチェック書き戻し。
 * パスが変わったら呼び出し側で key を変えて作り直す前提（初期状態は常に loading）。
 */
export function useMarkdownFile(filePath: string) {
  const [state, setState] = useState<MarkdownFileState>({ status: 'loading' });
  /** 自分の書き込みで発生した変更通知を無視するための mtime */
  const ownWriteMtime = useRef<number | null>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const load = useCallback(
    async (options: { notifyChange?: boolean } = {}) => {
      const result = await fetchMarkdown(filePath);
      if (!result.ok) {
        setState({ status: 'error', httpStatus: result.status, message: result.message });
        return;
      }
      const previous = stateRef.current;
      if (
        options.notifyChange &&
        previous.status === 'ready' &&
        previous.data.content !== result.data.content
      ) {
        toaster.create({
          type: 'info',
          title: 'ファイルが更新されました',
          description: '外部の変更を反映しました',
          duration: 3000,
        });
      }
      setState({ status: 'ready', data: result.data });
    },
    [filePath]
  );

  // 初回取得
  useEffect(() => {
    let cancelled = false;
    fetchMarkdown(filePath).then((result) => {
      if (cancelled) return;
      setState(
        result.ok
          ? { status: 'ready', data: result.data }
          : { status: 'error', httpStatus: result.status, message: result.message }
      );
    });
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  // 変更監視（再接続時はサーバー側の room が消えるので張り直す）
  const realPath = state.status === 'ready' ? state.data.path : null;
  useEffect(() => {
    if (!realPath) return;
    const socket = getSharedSocket();
    const watch = () => socket.emit('markdown:watch', { path: realPath });
    const onChanged = (event: { path: string; exists: boolean; mtimeMs: number | null }) => {
      if (event.path !== realPath) return;
      if (event.exists && event.mtimeMs !== null && event.mtimeMs === ownWriteMtime.current) return;
      void load({ notifyChange: true });
    };
    if (socket.connected) watch();
    socket.on('connect', watch);
    socket.on('markdown:changed', onChanged);
    return () => {
      socket.off('connect', watch);
      socket.off('markdown:changed', onChanged);
      socket.emit('markdown:unwatch', { path: realPath });
    };
  }, [realPath, load]);

  const toggleTask = useCallback(
    async (offset: number, checked: boolean) => {
      const current = stateRef.current;
      if (current.status !== 'ready') return;
      const optimistic = toggleTaskAt(current.data.content, offset, checked);
      if (optimistic === null) return;
      setState({ status: 'ready', data: { ...current.data, content: optimistic } });

      try {
        const res = await fetch(apiUrl('/api/markdown/toggle'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: current.data.path,
            offset,
            checked,
            mtimeMs: current.data.mtimeMs,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok) {
          const data = body.data as MarkdownFileData;
          ownWriteMtime.current = data.mtimeMs;
          setState({ status: 'ready', data });
          return;
        }
        if (res.status === 409) {
          toaster.create({
            type: 'warning',
            title: 'チェックを保存できませんでした',
            description:
              'ファイルが他で変更されたため最新を読み込みました。もう一度操作してください。',
          });
          await load();
          return;
        }
        throw new Error(body.error ?? res.statusText);
      } catch (error) {
        setState({ status: 'ready', data: current.data });
        toaster.create({
          type: 'error',
          title: 'チェックを保存できませんでした',
          description: error instanceof Error ? error.message : undefined,
        });
      }
    },
    [load]
  );

  const reload = useCallback(() => load(), [load]);

  return { state, reload, toggleTask };
}
