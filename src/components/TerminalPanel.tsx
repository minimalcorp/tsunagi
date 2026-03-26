'use client';

import { useState, useCallback, useRef, useImperativeHandle, forwardRef, useEffect } from 'react';
import type { Tab, Task } from '@/lib/types';
import { SessionTabs } from '@/components/SessionTabs';
import {
  TerminalView,
  type Todo,
  type TerminalViewHandle,
  type TerminalStatus,
  type ClaudeStatus,
} from '@/components/TerminalView';
import { Button } from '@/components/ui/button';

export interface TabStatusEntry {
  terminal: TerminalStatus;
  claude: ClaudeStatus;
}

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

/** タブ追加モード */
type TabCreateMode = 'terminal' | 'claude';

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

    // activeTabId が変化したとき（初回マウント後も含む）に mountedTabIds へ追加
    // Fix 1（page.tsx）が不完全な場合の防御的フォールバックとして機能する
    useEffect(() => {
      if (activeTabId) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMountedTabIds((prev) => {
          if (prev.has(activeTabId)) return prev;
          const next = new Set(prev);
          next.add(activeTabId);
          return next;
        });
      }
    }, [activeTabId]);

    // タブごとのリアルタイムステータス（TerminalViewからの通知）
    const [tabStatusMap, setTabStatusMap] = useState<Map<string, TabStatusEntry>>(new Map());

    // タブごとの起動モード（terminal: claudeなし / claude: claude自動起動）
    const [tabModeMap, setTabModeMap] = useState<Map<string, TabCreateMode>>(new Map());

    // 各TerminalViewへのrefマップ
    const terminalRefs = useRef<Map<string, TerminalViewHandle>>(new Map());

    // アクティブタブが変わったら xterm にフォーカスを移す
    // TerminalPanel の effect は子コンポーネントの effects より後に実行されるため、
    // termRef.current が確実に設定済みの状態でフォーカスできる
    useEffect(() => {
      if (!activeTabId) return;
      terminalRefs.current.get(activeTabId)?.focus();
    }, [activeTabId]);

    const handleStatusChange = useCallback(
      (tabId: string, terminal: TerminalStatus, claude: ClaudeStatus) => {
        setTabStatusMap((prev) => {
          const next = new Map(prev);
          next.set(tabId, { terminal, claude });
          return next;
        });
      },
      []
    );

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

    const handleTabCreate = useCallback(
      async (mode: TabCreateMode) => {
        const newTabId = await onTabCreate();
        if (newTabId) {
          setMountedTabIds((prev) => {
            const next = new Set(prev);
            next.add(newTabId);
            return next;
          });
          setTabModeMap((prev) => {
            const next = new Map(prev);
            next.set(newTabId, mode);
            return next;
          });
        }
      },
      [onTabCreate]
    );

    const handleTabCreateTerminal = useCallback(
      () => handleTabCreate('terminal'),
      [handleTabCreate]
    );

    const handleTabCreateClaude = useCallback(() => handleTabCreate('claude'), [handleTabCreate]);

    const handleTabDelete = useCallback(
      (tabId: string) => {
        setMountedTabIds((prev) => {
          const next = new Set(prev);
          next.delete(tabId);
          return next;
        });
        setTabStatusMap((prev) => {
          const next = new Map(prev);
          next.delete(tabId);
          return next;
        });
        setTabModeMap((prev) => {
          const next = new Map(prev);
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
              onTabCreateTerminal={handleTabCreateTerminal}
              onTabCreateClaude={handleTabCreateClaude}
              onTabDelete={handleTabDelete}
              tabStatusMap={tabStatusMap}
            />
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">No tabs yet</p>
              <Button size="lg" onClick={handleTabCreateClaude}>
                + Create First Tab
              </Button>
            </div>
          )}
        </div>

        {/* TerminalViewエリア（visibility:hidden方式で複数を保持） */}
        {/* absolute で全タブを重ねることで、visibility:hidden のタブが空白として残らないようにする */}
        <div className="flex-1 min-h-0 relative">
          {tabs.map((tab) => {
            const isMounted = mountedTabIds.has(tab.tab_id);
            const isActive = tab.tab_id === activeTabId;

            if (!isMounted) return null;

            return (
              <div
                key={tab.tab_id}
                className="absolute inset-0 flex flex-col px-4 pb-4 pt-2"
                style={{
                  visibility: isActive ? 'visible' : 'hidden',
                  pointerEvents: isActive ? 'auto' : 'none',
                }}
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
                  isActive={isActive}
                  cwd={task.worktreePath}
                  worktreePath={task.worktreePath}
                  command={
                    tabModeMap.get(tab.tab_id) !== 'terminal'
                      ? `claude --dangerously-skip-permissions --resume ${tab.tab_id} 2>/dev/null || claude --dangerously-skip-permissions --session-id ${tab.tab_id}`
                      : undefined
                  }
                  className="h-full"
                  onTodosUpdated={onTodosUpdated}
                  onStatusChange={handleStatusChange}
                />
              </div>
            );
          })}

          {tabs.length > 0 && !activeTabId && (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              Select a tab to view terminal
            </div>
          )}
        </div>
      </div>
    );
  }
);
