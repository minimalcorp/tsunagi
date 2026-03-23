'use client';

import { useState, useCallback } from 'react';
import type { Tab, Task } from '@/lib/types';
import { SessionTabs } from '@/components/SessionTabs';
import { TerminalView, type Todo } from '@/components/TerminalView';

interface TerminalPanelProps {
  task: Task;
  tabs: Tab[];
  activeTabId?: string;
  onTabChange: (tabId: string) => void;
  onTabCreate: () => void;
  onTabDelete: (tabId: string) => void;
  /** Todoリスト更新時のコールバック（KanbanカードのProgress Bar用） */
  onTodosUpdated?: (tabId: string, todos: Todo[]) => void;
}

/**
 * 複数のTerminalViewをdisplay:none方式で管理するパネル。
 * タブ切り替え時もsocket.io接続・xterm.jsインスタンスを保持し、
 * バックグラウンドでもPTY出力を受信し続ける。
 */
export function TerminalPanel({
  task,
  tabs,
  activeTabId,
  onTabChange,
  onTabCreate,
  onTabDelete,
  onTodosUpdated,
}: TerminalPanelProps) {
  // 一度でも表示されたタブのみTerminalViewをマウントする（遅延初期化）
  const [mountedTabIds, setMountedTabIds] = useState<Set<string>>(
    () => new Set(activeTabId ? [activeTabId] : [])
  );

  const handleTabChange = useCallback(
    (tabId: string) => {
      // マウント済みでない場合は追加
      setMountedTabIds((prev) => {
        if (prev.has(tabId)) return prev;
        const next = new Set(prev);
        next.add(tabId);
        return next;
      });
      onTabChange(tabId);
    },
    [onTabChange]
  );

  // タブが増えた時はマウント済みセットに追加
  const handleTabCreate = useCallback(async () => {
    await onTabCreate();
  }, [onTabCreate]);

  // タブ削除時はマウント済みセットから削除
  const handleTabDelete = useCallback(
    (tabId: string) => {
      setMountedTabIds((prev) => {
        const next = new Set(prev);
        next.delete(tabId);
        return next;
      });
      onTabDelete(tabId);
    },
    [onTabDelete]
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* タブナビゲーション */}
      <div className="px-4 pt-4 flex-shrink-0">
        {tabs.length > 0 ? (
          <SessionTabs
            tabs={tabs}
            activeTabId={activeTabId}
            onTabChange={handleTabChange}
            onTabCreate={handleTabCreate}
            onTabDelete={handleTabDelete}
          />
        ) : (
          <div className="text-center py-8">
            <p className="text-theme-muted mb-4">No tabs yet</p>
            <button
              onClick={handleTabCreate}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 cursor-pointer"
            >
              + Create First Tab
            </button>
          </div>
        )}
      </div>

      {/* TerminalViewエリア（display:none方式で複数を保持） */}
      <div className="flex-1 min-h-0 px-4 pb-4 pt-2">
        {tabs.map((tab) => {
          const isMounted = mountedTabIds.has(tab.tab_id);
          const isActive = tab.tab_id === activeTabId;

          // 一度もアクティブになっていないタブはマウントしない
          if (!isMounted) return null;

          return (
            <div
              key={tab.tab_id}
              style={{ display: isActive ? 'flex' : 'none' }}
              className="h-full flex-col"
            >
              <TerminalView
                tabId={tab.tab_id}
                cwd={task.worktreeStatus === 'created' ? undefined : undefined}
                worktreePath={undefined}
                className="h-full"
                onTodosUpdated={onTodosUpdated}
              />
            </div>
          );
        })}

        {/* タブがなく、まだ何も表示されていない場合のプレースホルダー */}
        {tabs.length > 0 && !activeTabId && (
          <div className="h-full flex items-center justify-center text-theme-muted text-sm">
            Select a tab to view terminal
          </div>
        )}
      </div>
    </div>
  );
}
