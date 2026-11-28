import type { Server as SocketIOServer } from 'socket.io';
import type { Tab } from '@minimalcorp/tsunagi-shared';
import * as taskRepo from '../repositories/task.js';
import { resolveMarkdownFile } from '../markdown-file.js';

export interface OpenMarkdownTabResult {
  tab: Tab;
  /** 既存タブを再利用した場合 true */
  reused: boolean;
}

/**
 * タスクに Markdown Viewer タブを開く。同じファイル（realpath）のタブがあれば再利用する。
 * パスが不正な場合は LocalFileError を投げる。
 */
export async function openMarkdownTab(
  taskId: string,
  rawPath: unknown,
  options: { unread?: boolean; io?: SocketIOServer } = {}
): Promise<OpenMarkdownTabResult | null> {
  const { realPath } = await resolveMarkdownFile(rawPath);
  const task = await taskRepo.getTask(taskId);
  if (!task) return null;

  const existing = task.tabs?.find((tab) => tab.mode === 'markdown' && tab.filePath === realPath);
  let tab: Tab | null;
  let reused = false;
  if (existing) {
    reused = true;
    tab = options.unread
      ? await taskRepo.updateTab(taskId, existing.tab_id, { unread: true })
      : existing;
  } else {
    tab = await taskRepo.createTab(taskId, 'markdown', {
      filePath: realPath,
      unread: options.unread ?? false,
    });
  }
  if (!tab) return null;

  if (options.io) {
    const updated = await taskRepo.getTask(taskId);
    if (updated) options.io.emit('task:tabs-changed', { task: updated });
  }
  return { tab, reused };
}
