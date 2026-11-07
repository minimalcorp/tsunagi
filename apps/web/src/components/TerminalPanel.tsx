'use client';

import {
  useState,
  useCallback,
  useRef,
  useImperativeHandle,
  forwardRef,
  useEffect,
  useMemo,
} from 'react';
import type { LocalLlmProvider, Tab, Task } from '@minimalcorp/tsunagi-shared';
import { SessionTabs } from '@/components/SessionTabs';
import { EditorPane } from '@/components/task-detail/EditorPane';
import { TaskViewModeToggle } from '@/components/task-detail/TaskViewModeToggle';
import { useTaskViewMode } from '@/hooks/useTaskViewMode';
import { registerFocusTarget, restoreFocus, setPaneFocusTarget } from '@/lib/focus-target';
import { cn } from '@/lib/utils';
import { useTabStatusEvents } from '@/hooks/useTabStatusEvents';
import {
  TerminalView,
  type Todo,
  type TerminalViewHandle,
  type TerminalStatus,
  type AgentStatus,
} from '@/components/TerminalView';
import { Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClaudeIcon, CodexIcon, LocalLlmTabIcon } from '@/components/icons/BrandIcons';
import { localLlmTabLabel } from '@/lib/local-llm';
import {
  useLmStudioSettings,
  useLocalLlmSettings,
  useOllamaSettings,
} from '@/hooks/useLocalLlmSettings';
import { useAgentAvailability } from '@/hooks/useAgentAvailability';
import { agentDisabledReason } from '@/lib/agent-availability';

export interface TabStatusEntry {
  /** TerminalView 未マウント（一度も表示していないタブ）の場合は null */
  terminal: TerminalStatus | null;
  claude: AgentStatus;
}

interface TerminalPanelProps {
  task: Task;
  tabs: Tab[];
  activeTabId?: string;
  onTabChange: (tabId: string) => void;
  onTabCreate: (mode: TabCreateMode) => Promise<string | undefined>;
  onTabDelete: (tabId: string) => void;
  /** Todoリスト更新時のコールバック（タスクカードの Progress Bar 用） */
  onTodosUpdated?: (tabId: string, todos: Todo[]) => void;
  /** Claudeステータス変化時のコールバック（詳細を開いたまま完了したときの既読化用） */
  onAgentStatusChange?: (tabId: string, claude: AgentStatus) => void;
}

/** タブ追加モード */
export type TabCreateMode = Tab['mode'];

/** ローカルLLMタブの作成ボタン（Ollama / LM Studio のどちらかが有効なときだけ出す） */
export interface LocalLlmTabOption {
  /** 使用中のモデルのプロバイダー（アイコン用）。未設定なら null */
  provider: LocalLlmProvider | null;
  /** 使用中のモデル */
  model: string;
  /** 使えない理由（Claude Code の CLI が使えない、モデルが未設定）。あれば無効化して title に出す */
  disabledReason?: string;
}

/** エージェントのタブ作成ボタンの状態。disabledReason があれば無効化して title に出す */
export interface AgentTabOption {
  disabledReason?: string;
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
    {
      task,
      tabs,
      activeTabId,
      onTabChange,
      onTabCreate,
      onTabDelete,
      onTodosUpdated,
      onAgentStatusChange,
    },
    ref
  ) {
    const { mode: viewMode, canSplit, setMode: setViewMode } = useTaskViewMode();

    // アクティブな TerminalView がツールバーの内容を描画する先
    const [toolbarSlot, setToolbarSlot] = useState<HTMLDivElement | null>(null);

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

    // タブごとのリアルタイムステータス（TerminalViewからの通知）。
    // 初期値はDBの tab.status からシードする（ページ再訪時に success 等を維持するため）。
    const [tabStatusMap, setTabStatusMap] = useState<Map<string, TabStatusEntry>>(
      () =>
        new Map(
          tabs.map((tab) => [tab.tab_id, { terminal: null, claude: tab.status as AgentStatus }])
        )
    );

    // tabs が再フェッチされた場合も未追跡タブをシードする。
    // 既にリアルタイム値を持つタブは上書きしない（Socket.IO由来の最新状態を優先する）。
    useEffect(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTabStatusMap((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const tab of tabs) {
          if (!next.has(tab.tab_id)) {
            next.set(tab.tab_id, { terminal: null, claude: tab.status as AgentStatus });
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, [tabs]);

    // 未マウントのタブは TerminalView からの通知が来ないため、status-changed を購読して反映する
    // （mode='subscribe' のため PTY の起動・接続は行わない）。マウント済みのタブは TerminalView が通知する。
    const mountedTabIdsRef = useRef(mountedTabIds);
    useEffect(() => {
      mountedTabIdsRef.current = mountedTabIds;
    }, [mountedTabIds]);
    const tabIds = useMemo(() => tabs.map((tab) => tab.tab_id), [tabs]);
    useTabStatusEvents(tabIds, (tabId, status) => {
      if (mountedTabIdsRef.current.has(tabId)) return;
      setTabStatusMap((prev) => {
        const entry = prev.get(tabId);
        if (!entry || entry.terminal !== null || entry.claude === status) return prev;
        const next = new Map(prev);
        next.set(tabId, { terminal: null, claude: status });
        return next;
      });
      onAgentStatusChange?.(tabId, status);
    });

    // 各TerminalViewへのrefマップ
    const terminalRefs = useRef<Map<string, TerminalViewHandle>>(new Map());

    useEffect(
      () =>
        registerFocusTarget('terminal', () => {
          if (activeTabId) terminalRefs.current.get(activeTabId)?.focus();
        }),
      [activeTabId]
    );

    // タスク詳細を離れたら戻り先を既定に戻す（ログイン用ターミナル等はターミナルが受ける）
    useEffect(() => () => setPaneFocusTarget('terminal'), []);

    // 表示モードやアクティブタブが変わったら、フォーカスを持つべき場所へ移す。
    // 片方しか表示しないモードはその表示先へ、左右分割は直前の場所へ戻す。
    // TerminalPanel の effect は子コンポーネントの effects より後に実行されるため、
    // termRef.current が確実に設定済みの状態でフォーカスできる
    useEffect(() => {
      if (viewMode !== 'split') setPaneFocusTarget(viewMode);
      restoreFocus();
    }, [viewMode, activeTabId]);

    const handleStatusChange = useCallback(
      (tabId: string, terminal: TerminalStatus, claude: AgentStatus) => {
        setTabStatusMap((prev) => {
          const next = new Map(prev);
          next.set(tabId, { terminal, claude });
          return next;
        });
        onAgentStatusChange?.(tabId, claude);
      },
      [onAgentStatusChange]
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
        const newTabId = await onTabCreate(mode);
        if (newTabId) {
          setMountedTabIds((prev) => {
            const next = new Set(prev);
            next.add(newTabId);
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

    const handleTabCreateCodex = useCallback(() => handleTabCreate('codex'), [handleTabCreate]);

    const handleTabCreateLocalLlm = useCallback(() => handleTabCreate('local'), [handleTabCreate]);

    // エージェントのボタンは常に出し（使えることを知らせる）、CLI が使えなければ無効化する
    const agents = useAgentAvailability();
    const claudeOption: AgentTabOption = {
      disabledReason: agentDisabledReason(
        'Claude Code',
        agents?.find((a) => a.agent === 'claude')
      ),
    };
    const codexOption: AgentTabOption = {
      disabledReason: agentDisabledReason(
        'Codex',
        agents?.find((a) => a.agent === 'codex')
      ),
    };

    // 実験的機能のローカルLLMは、プロバイダーが有効なときだけタブの作成ボタンを出す
    const { settings: ollamaSettings } = useOllamaSettings();
    const { settings: lmStudioSettings } = useLmStudioSettings();
    const { settings: localLlmSettings } = useLocalLlmSettings();
    // ローカルLLMのタブは Claude Code を起動するため、claude の CLI が必要
    const localLlmModel = localLlmSettings?.active?.model ?? '';
    const localLlmOption: LocalLlmTabOption | undefined =
      ollamaSettings?.enabled || lmStudioSettings?.enabled
        ? {
            provider: localLlmSettings?.active?.provider ?? null,
            model: localLlmModel,
            disabledReason:
              claudeOption.disabledReason ??
              (localLlmModel ? undefined : 'ローカルLLMのモデルが未設定です（Settings で設定）'),
          }
        : undefined;

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
        terminalRefs.current.delete(tabId);
        onTabDelete(tabId);
      },
      [onTabDelete]
    );

    const handleSend = (text: string, submit: boolean) => {
      if (!activeTabId) return false;
      return terminalRefs.current.get(activeTabId)?.sendText(text, submit) ?? false;
    };

    const isEditorOnly = viewMode === 'editor';
    // タブごとの下書きは EditorPane が Monaco のモデルとして持つ（リロードでは保持しない）
    const draftIds = useMemo(() => tabs.map((tab) => tab.tab_id), [tabs]);

    return (
      <div className="flex flex-col flex-1 min-h-0">
        {/* タブナビゲーション */}
        <div className="px-4 pt-4 flex-shrink-0">
          <SessionTabs
            tabs={tabs}
            activeTabId={activeTabId}
            onTabChange={handleTabChange}
            onTabCreateTerminal={handleTabCreateTerminal}
            onTabCreateClaude={handleTabCreateClaude}
            claudeOption={claudeOption}
            codexOption={codexOption}
            onTabCreateCodex={handleTabCreateCodex}
            localLlmOption={localLlmOption}
            onTabCreateLocalLlm={handleTabCreateLocalLlm}
            onTabDelete={handleTabDelete}
            tabStatusMap={tabStatusMap}
          />
        </div>

        <div className="flex-1 min-h-0 mx-4 mb-4 mt-2 flex flex-col overflow-hidden rounded-lg border border-border bg-card dark:rounded-none dark:border-0">
          {/* ターミナルとエディタ共通のツールバー */}
          <div className="flex items-center gap-2 px-2 py-1 border-b border-border flex-shrink-0">
            <div ref={setToolbarSlot} className="flex flex-1 min-w-0 items-center gap-2" />
            <TaskViewModeToggle mode={viewMode} canSplit={canSplit} onChange={setViewMode} />
          </div>

          {/* TerminalViewエリア（visibility:hidden方式で複数を保持） */}
          {/* absolute で全タブを重ねることで、visibility:hidden のタブが空白として残らないようにする */}
          {/* エディタのみのモードでもターミナルは保持する。全幅を保って隠すことで、切り替えのたびに
            PTY をリサイズして Claude の画面を描き直させない */}
          <div className="flex-1 min-h-0 relative flex">
            <div
              className={cn(
                'min-w-0',
                isEditorOnly ? 'absolute inset-0' : 'relative flex-1 basis-0'
              )}
            >
              {tabs.map((tab) => {
                const isMounted = mountedTabIds.has(tab.tab_id);
                const isActive = tab.tab_id === activeTabId;

                if (!isMounted) return null;

                return (
                  <div
                    key={tab.tab_id}
                    className="absolute inset-0 flex flex-col"
                    style={{
                      visibility: isActive && !isEditorOnly ? 'visible' : 'hidden',
                      pointerEvents: isActive && !isEditorOnly ? 'auto' : 'none',
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
                      launchAgent={tab.mode !== 'terminal'}
                      mode={tab.mode}
                      className="h-full overflow-hidden"
                      initialTodos={tab.todos}
                      initialAgentStatus={tab.status as AgentStatus}
                      onTodosUpdated={onTodosUpdated}
                      onStatusChange={handleStatusChange}
                      toolbarContainer={toolbarSlot}
                    />
                  </div>
                );
              })}

              {tabs.length === 0 && (
                <div
                  className={cn(
                    'h-full flex flex-col items-center justify-center gap-4 px-4',
                    isEditorOnly && 'invisible'
                  )}
                >
                  <p className="text-sm text-muted-foreground">起動するタブを選んでください</p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <span title={claudeOption.disabledReason}>
                      <Button
                        onClick={handleTabCreateClaude}
                        disabled={Boolean(claudeOption.disabledReason)}
                      >
                        <ClaudeIcon className="w-4 h-4" />
                        Claude Code
                      </Button>
                    </span>
                    {codexOption && (
                      <span title={codexOption.disabledReason}>
                        <Button
                          variant="outline"
                          onClick={handleTabCreateCodex}
                          disabled={Boolean(codexOption.disabledReason)}
                        >
                          <CodexIcon className="w-4 h-4" />
                          Codex
                        </Button>
                      </span>
                    )}
                    {localLlmOption && (
                      <span
                        title={
                          localLlmOption.disabledReason ??
                          `${localLlmTabLabel(localLlmOption.provider)}: ${localLlmOption.model}`
                        }
                      >
                        <Button
                          variant="outline"
                          onClick={() => void handleTabCreateLocalLlm()}
                          disabled={Boolean(localLlmOption.disabledReason)}
                        >
                          <LocalLlmTabIcon provider={localLlmOption.provider} className="w-4 h-4" />
                          {localLlmTabLabel(localLlmOption.provider)}
                        </Button>
                      </span>
                    )}
                    <Button variant="outline" onClick={handleTabCreateTerminal}>
                      <Terminal className="w-4 h-4" />
                      Terminal
                    </Button>
                  </div>
                </div>
              )}

              {tabs.length > 0 && !activeTabId && (
                <div
                  className={cn(
                    'h-full flex items-center justify-center text-muted-foreground text-sm',
                    isEditorOnly && 'invisible'
                  )}
                >
                  Select a tab to view terminal
                </div>
              )}
            </div>

            {viewMode !== 'terminal' && (
              <div
                className={cn(
                  'flex-1 basis-0 min-w-0 relative',
                  !isEditorOnly && 'border-l border-border'
                )}
              >
                <div className="absolute inset-0 flex flex-col">
                  <EditorPane
                    draftId={activeTabId ?? null}
                    draftIds={draftIds}
                    canSend={
                      activeTabId ? tabStatusMap.get(activeTabId)?.terminal === 'connected' : false
                    }
                    onSend={handleSend}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);
