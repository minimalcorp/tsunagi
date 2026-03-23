'use client';

import { useState, useCallback, useRef, useImperativeHandle, forwardRef } from 'react';
import type { Tab, Task } from '@/lib/types';
import { SessionTabs } from '@/components/SessionTabs';
import { TerminalView, type Todo, type TerminalViewHandle } from '@/components/TerminalView';

interface TerminalPanelProps {
  task: Task;
  tabs: Tab[];
  activeTabId?: string;
  onTabChange: (tabId: string) => void;
  onTabCreate: () => Promise<string | undefined>;
  onTabDelete: (tabId: string) => void;
  /** Todoリスト更新時のコールバック（KanbanカードのProgress Bar用） */
  onTodosUpdated?: (tabId: string, todos: Todo[]) => void;
}

/** TerminalPanelの外部からアクセス可能なハンドル */
export interface TerminalPanelHandle {
  /** 指定タブのPTYにテキストを書き込む */
  sendInput: (tabId: string, data: string) => void;
}

/**
 * 複数のTerminalViewをdisplay:none方式で管理するパネル。
 * タブ切り替え時もsocket.io接続・xterm.jsインスタンスを保持し、
 * バックグラウンドでもPTY出力を受信し続ける。
 */
export const TerminalPanel = forwardRef<TerminalPanelHandle, TerminalPanelProps>(
  function TerminalPanel(
    { task, tabs, activeTabId, onTabChange, onTabCreate, onTabDelete, onTodosUpdated },
    ref
  ) {
    // 一度でも表示されたタブのみTerminalViewをマウントする（遅延初期化）
    const [mountedTabIds, setMountedTabIds] = useState<Set<string>>(
      () => new Set(activeTabId ? [activeTabId] : [])
    );

    // 各TerminalViewへのrefマップ
    const terminalRefs = useRef<Map<string, TerminalViewHandle>>(new Map());

    useImperativeHandle(ref, () => ({
      sendInput: (tabId: string, data: string) => {
        const handle = terminalRefs.current.get(tabId);
        handle?.sendInput(data);
      },
    }));

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

    const handleTabCreate = useCallback(async () => {
      const newTabId = await onTabCreate();
      // 新規タブを即座にマウント済みとしてマーク（onTabChangeを経由しないため手動追加）
      if (newTabId) {
        setMountedTabIds((prev) => {
          const next = new Set(prev);
          next.add(newTabId);
          return next;
        });
      }
    }, [onTabCreate]);

    const handleTabDelete = useCallback(
      (tabId: string) => {
        setMountedTabIds((prev) => {
          const next = new Set(prev);
          next.delete(tabId);
          return next;
        });
        terminalRefs.current.delete(tabId);
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

            if (!isMounted) return null;

            return (
              <div
                key={tab.tab_id}
                style={{ display: isActive ? 'flex' : 'none' }}
                className="h-full flex-col"
              >
                <TerminalView
                  ref={(handle) => {
                    if (handle) {
                      terminalRefs.current.set(tab.tab_id, handle);
                    } else {
                      terminalRefs.current.delete(tab.tab_id);
                    }
                  }}
                  tabId={tab.tab_id}
                  cwd={task.worktreePath}
                  worktreePath={task.worktreePath}
                  command={`claude --resume ${tab.tab_id} 2>/dev/null || claude --session-id ${tab.tab_id}`}
                  className="h-full"
                  onTodosUpdated={onTodosUpdated}
                />
              </div>
            );
          })}

          {tabs.length > 0 && !activeTabId && (
            <div className="h-full flex items-center justify-center text-theme-muted text-sm">
              Select a tab to view terminal
            </div>
          )}
        </div>
      </div>
    );
  }
);
