'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Tab } from '@/lib/types';
import { SessionTabs } from '@/components/SessionTabs';
import {
  TerminalView,
  type TerminalViewHandle,
  type TerminalStatus,
  type ClaudeStatus,
} from '@/components/TerminalView';
import { Button } from '@/components/ui/button';
import type { TabStatusEntry } from '@/components/TerminalPanel';

/** Tab creation mode */
type TabCreateMode = 'terminal' | 'claude';

export function PlannerPanel() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | undefined>();
  const [mountedTabIds, setMountedTabIds] = useState<Set<string>>(new Set());
  const [tabStatusMap, setTabStatusMap] = useState<Map<string, TabStatusEntry>>(new Map());
  const [tabModeMap, setTabModeMap] = useState<Map<string, TabCreateMode>>(new Map());
  const [isLoaded, setIsLoaded] = useState(false);
  const [plannerCwd, setPlannerCwd] = useState<string | undefined>();
  const terminalRefs = useRef<Map<string, TerminalViewHandle>>(new Map());

  // Load config and tabs from API on mount
  useEffect(() => {
    const load = async () => {
      try {
        const [configRes, tabsRes] = await Promise.all([
          fetch('/api/planner/config').then((r) => r.json()),
          fetch('/api/planner/tabs').then((r) => r.json()),
        ]);

        if (configRes.data?.cwd) {
          setPlannerCwd(configRes.data.cwd);
        }

        if (tabsRes.data?.tabs) {
          setTabs(tabsRes.data.tabs);
          if (tabsRes.data.tabs.length > 0) {
            const firstTabId = tabsRes.data.tabs[0].tab_id;
            setActiveTabId(firstTabId);
            setMountedTabIds(new Set([firstTabId]));
          }
        }
      } catch (error) {
        console.error('Failed to load planner config/tabs:', error);
      } finally {
        setIsLoaded(true);
      }
    };
    load();
  }, []);

  // Focus active terminal on tab switch
  useEffect(() => {
    if (!activeTabId) return;
    terminalRefs.current.get(activeTabId)?.focus();
  }, [activeTabId]);

  const createTab = useCallback(
    async (mode: TabCreateMode) => {
      const tabId = crypto.randomUUID();
      const now = new Date().toISOString();
      const newTab: Tab = {
        tab_id: tabId,
        order: tabs.length,
        status: 'idle',
        startedAt: now,
        updatedAt: now,
      };

      // Persist to API
      try {
        await fetch('/api/planner/tabs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tabId }),
        });
      } catch (error) {
        console.error('Failed to persist planner tab:', error);
      }

      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(tabId);
      setMountedTabIds((prev) => {
        const next = new Set(prev);
        next.add(tabId);
        return next;
      });
      setTabModeMap((prev) => {
        const next = new Map(prev);
        next.set(tabId, mode);
        return next;
      });
    },
    [tabs.length]
  );

  const handleTabCreateTerminal = useCallback(() => createTab('terminal'), [createTab]);
  const handleTabCreateClaude = useCallback(() => createTab('claude'), [createTab]);

  const handleTabChange = useCallback((tabId: string) => {
    setMountedTabIds((prev) => {
      if (prev.has(tabId)) return prev;
      const next = new Set(prev);
      next.add(tabId);
      return next;
    });
    setActiveTabId(tabId);
  }, []);

  const handleTabDelete = useCallback(
    async (tabId: string) => {
      // Delete from API
      try {
        await fetch(`/api/planner/tabs?tabId=${tabId}`, { method: 'DELETE' });
      } catch (error) {
        console.error('Failed to delete planner tab:', error);
      }

      setTabs((prev) => {
        const next = prev.filter((t) => t.tab_id !== tabId);
        if (activeTabId === tabId) {
          const newActive = next.length > 0 ? next[next.length - 1].tab_id : undefined;
          setTimeout(() => setActiveTabId(newActive), 0);
        }
        return next;
      });
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
    },
    [activeTabId]
  );

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

  if (!isLoaded) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Tab navigation */}
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
            <p className="text-muted-foreground mb-4">No planner sessions</p>
            <Button size="lg" onClick={handleTabCreateClaude}>
              + Create Planner Session
            </Button>
          </div>
        )}
      </div>

      {/* Terminal views (stacked with visibility toggle) */}
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
                cwd={plannerCwd}
                command={
                  tabModeMap.get(tab.tab_id) !== 'terminal'
                    ? `claude --dangerously-skip-permissions --resume ${tab.tab_id} 2>/dev/null || claude --dangerously-skip-permissions --session-id ${tab.tab_id}`
                    : undefined
                }
                className="h-full"
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
