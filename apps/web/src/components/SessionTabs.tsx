'use client';

import { useRef, useState } from 'react';
import type { Tab } from '@minimalcorp/tsunagi-shared';
import {
  X,
  Loader2,
  CirclePause,
  Terminal,
  AlertCircle,
  WifiOff,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Pencil,
  FileText,
} from 'lucide-react';
import { MarkdownOpenPopover } from '@/components/markdown-viewer/MarkdownOpenPopover';
import { basename, type MarkdownOutline } from '@/components/markdown-viewer/markdown-utils';
import type { AgentTabOption, LocalLlmTabOption, TabStatusEntry } from '@/components/TerminalPanel';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { ClaudeIcon, CodexIcon, LocalLlmTabIcon } from '@/components/icons/BrandIcons';
import { localLlmTabLabel } from '@/lib/local-llm';

interface SessionTabsProps {
  tabs: Tab[];
  activeTabId?: string;
  onTabChange: (tabId: string) => void;
  /** Terminalのみ起動するタブ追加（省略時はボタン非表示） */
  onTabCreateTerminal?: () => void;
  /** Terminalを追加してClaudeを起動するタブ追加 */
  onTabCreateClaude: () => void;
  claudeOption?: AgentTabOption;
  /** Codex を起動するタブ追加（省略時はボタン非表示） */
  codexOption?: AgentTabOption;
  onTabCreateCodex?: () => void;
  /** ローカルLLM（Settings で選んだ使用中のモデル）でClaudeを起動するタブ追加（省略時はボタン非表示） */
  localLlmOption?: LocalLlmTabOption;
  onTabCreateLocalLlm?: () => void;
  onTabDelete: (tabId: string) => void;
  /** タブ名の変更（空文字で名前を外す） */
  onTabRename: (tabId: string, name: string) => void;
  /** タブごとのリアルタイムステータス */
  tabStatusMap?: Map<string, TabStatusEntry>;
  /** Markdown タブ追加（worktree 内の一覧から選ぶ。省略時はボタン非表示） */
  worktreePath?: string;
  onTabCreateMarkdown?: (filePath: string) => void;
  /** Markdown タブの進捗（マウント済みのタブのみ） */
  markdownOutlines?: Map<string, MarkdownOutline | null>;
}

/** タブ名の最大文字数（サーバーの TAB_NAME_MAX_LENGTH と同じ） */
const TAB_NAME_MAX_LENGTH = 50;

/** 既定表示（mode + 連番）に使う mode の表記。旧 ollama / lmstudio は local に揃える */
function modeLabel(mode: Tab['mode']): string {
  return mode === 'ollama' || mode === 'lmstudio' ? 'local' : mode;
}

/** タブのリアルタイムステータスに基づくアイコン（状態名は title で出す） */
function TabStatusIndicator({ entry }: { entry: TabStatusEntry | undefined }) {
  const icon = (label: string, className: string, Icon: typeof CirclePause, spin = false) => (
    <span title={label} className={`flex items-center ${className}`}>
      <Icon className={`w-3 h-3${spin ? ' animate-spin' : ''}`} />
    </span>
  );

  // terminal === null（未マウント）は Claude ステータスのみで表示する
  if (!entry || entry.terminal === 'idle') {
    return icon('idle', 'text-muted-foreground', CirclePause);
  }
  if (entry.terminal === 'connecting') {
    return icon('connecting', 'text-muted-foreground', Loader2, true);
  }
  if (entry.terminal === 'error') {
    return icon('error', 'text-destructive', AlertCircle);
  }
  if (entry.terminal === 'exited' || entry.terminal === 'paused') {
    return icon(entry.terminal, 'text-muted-foreground', WifiOff);
  }

  // terminal === 'connected' | null
  switch (entry.claude) {
    case 'running':
      return icon('running', 'text-primary', Loader2, true);
    case 'waiting':
      return icon('waiting', 'text-warning', MessageSquare);
    case 'success':
      return icon('success', 'text-success', CheckCircle2);
    case 'failure':
    case 'error':
      return icon(entry.claude, 'text-destructive', XCircle);
    default:
      // claude: idle
      return icon('idle', 'text-muted-foreground', CirclePause);
  }
}

/** タブ名のインライン編集。Enter・フォーカスアウトで確定、Esc で取消 */
function TabNameInput({
  initialName,
  onCommit,
  onCancel,
}: {
  initialName: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialName);
  // Enter で確定した直後のフォーカスアウトで二重に確定しないようにする
  const doneRef = useRef(false);
  const finish = (commit: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (commit) onCommit(value);
    else onCancel();
  };

  return (
    <input
      autoFocus
      value={value}
      maxLength={TAB_NAME_MAX_LENGTH}
      aria-label="Tab name"
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
      }}
      onBlur={() => finish(true)}
      className="h-6 w-40 rounded-md border border-input bg-transparent px-2 text-xs text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
    />
  );
}

/** Markdown タブの進捗と未読ドット（エージェントが開いた手順書） */
function MarkdownTabMeta({
  tab,
  outline,
}: {
  tab: Tab;
  outline: MarkdownOutline | null | undefined;
}) {
  return (
    <>
      {outline && outline.total > 0 && (
        <span className="text-xs tabular-nums text-muted-foreground">
          {outline.done}/{outline.total}
        </span>
      )}
      {tab.unread && (
        <span className="size-1.5 rounded-full bg-primary" aria-label="未読" title="未読" />
      )}
    </>
  );
}

export function SessionTabs({
  tabs,
  activeTabId,
  onTabChange,
  onTabCreateTerminal,
  onTabCreateClaude,
  claudeOption,
  codexOption,
  onTabCreateCodex,
  localLlmOption,
  onTabCreateLocalLlm,
  onTabDelete,
  onTabRename,
  tabStatusMap,
  worktreePath,
  onTabCreateMarkdown,
  markdownOutlines,
}: SessionTabsProps) {
  const [deleteTarget, setDeleteTarget] = useState<{ tabId: string; isRunning: boolean } | null>(
    null
  );

  const [editingTabId, setEditingTabId] = useState<string | null>(null);

  // 名前の無いタブの既定表示（claude 1, terminal 1, ...）。mode ごとに作成順で連番を振る
  const defaultNames = new Map<string, string>();
  const modeCounts = new Map<string, number>();
  for (const tab of tabs) {
    const label = modeLabel(tab.mode);
    const count = (modeCounts.get(label) ?? 0) + 1;
    modeCounts.set(label, count);
    defaultNames.set(tab.tab_id, `${label} ${count}`);
  }
  // Markdown タブは表示中のファイル名を既定表示にする
  const displayName = (tab: Tab) =>
    tab.name ??
    tab.autoName ??
    (tab.mode === 'markdown' && tab.filePath ? basename(tab.filePath) : undefined) ??
    defaultNames.get(tab.tab_id) ??
    '';

  return (
    <>
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(details) => {
          if (!details.open) setDeleteTarget(null);
        }}
        title="Delete Tab"
        message={
          deleteTarget?.isRunning
            ? 'This tab is running. Are you sure you want to delete it?'
            : 'Delete this tab?'
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (deleteTarget) onTabDelete(deleteTarget.tabId);
        }}
        variant="danger"
      />
      <div className="flex items-center gap-2 overflow-x-auto border-b border-border pb-1">
        {tabs.map((tab) => {
          const isActive = activeTabId === tab.tab_id;
          const entry = tabStatusMap?.get(tab.tab_id);
          const isRunning =
            (entry?.claude === 'running' || entry?.claude === 'waiting') &&
            (entry?.terminal === 'connected' || entry?.terminal === null);

          const isEditing = editingTabId === tab.tab_id;
          const name = displayName(tab);

          return (
            <ContextMenu key={tab.tab_id}>
              <ContextMenuTrigger
                onClick={() => onTabChange(tab.tab_id)}
                onDoubleClick={() => setEditingTabId(tab.tab_id)}
                className={`
              relative flex items-center gap-2 px-4 pt-1 pb-2 h-10 flex-shrink-0 transition-colors cursor-pointer
              ${
                isActive
                  ? 'text-primary'
                  : isRunning
                    ? 'text-primary-light'
                    : 'text-muted-foreground hover:text-foreground'
              }
            `}
              >
                <div className="font-medium flex items-center gap-2">
                  {tab.mode === 'markdown' ? (
                    <span title={tab.filePath ?? 'Markdown'} className="flex items-center">
                      <FileText className="w-3 h-3" />
                    </span>
                  ) : tab.mode === 'terminal' ? (
                    <span title="Terminal" className="flex items-center">
                      <Terminal className="w-3 h-3" />
                    </span>
                  ) : (
                    <>
                      {tab.mode === 'codex' && (
                        <span title="Codex">
                          <CodexIcon className="w-3 h-3" />
                        </span>
                      )}
                      {(tab.mode === 'local' ||
                        tab.mode === 'ollama' ||
                        tab.mode === 'lmstudio') && (
                        <span title={localLlmTabLabel(localLlmOption?.provider ?? null)}>
                          <LocalLlmTabIcon
                            provider={localLlmOption?.provider ?? null}
                            className="w-3 h-3"
                          />
                        </span>
                      )}
                      <TabStatusIndicator entry={entry} />
                    </>
                  )}
                  {isEditing ? (
                    <TabNameInput
                      initialName={tab.name ?? name}
                      onCommit={(value) => {
                        setEditingTabId(null);
                        const trimmed = value.trim();
                        // 空は名前を外す。表示中の名前のままなら保存しない（自動の名前を固定しない）
                        if (trimmed === '') {
                          if (tab.name) onTabRename(tab.tab_id, '');
                        } else if (trimmed !== name) {
                          onTabRename(tab.tab_id, trimmed);
                        }
                      }}
                      onCancel={() => setEditingTabId(null)}
                    />
                  ) : (
                    <span className="max-w-40 truncate text-xs" title={name}>
                      {name}
                    </span>
                  )}
                  {tab.mode === 'markdown' && (
                    <MarkdownTabMeta tab={tab} outline={markdownOutlines?.get(tab.tab_id)} />
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget({ tabId: tab.tab_id, isRunning });
                  }}
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  <X className="w-4 h-4" />
                </Button>
                {/* アクティブタブのインジケーター（タブ要素内に配置し幅をCSSで追従させる。-bottom-1 は親の pb-1 分） */}
                {isActive && <span className="absolute inset-x-0 -bottom-1 h-0.5 bg-primary" />}
              </ContextMenuTrigger>
              {/* 閉じた後にタブへフォーカスを戻すと、開いたばかりの名前の入力欄が blur して確定してしまう */}
              <ContextMenuContent finalFocus={false}>
                <ContextMenuItem onClick={() => setEditingTabId(tab.tab_id)}>
                  <Pencil />
                  Rename
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}

        {/* divider + アクションボタン群 */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
          <div className="w-px self-stretch bg-theme" />
          {worktreePath && onTabCreateMarkdown && (
            <MarkdownOpenPopover worktreePath={worktreePath} onOpen={onTabCreateMarkdown} />
          )}
          {onTabCreateTerminal && (
            <Button size="icon" onClick={onTabCreateTerminal} title="Open terminal">
              <Terminal className="w-4 h-4" />
            </Button>
          )}
          <span title={claudeOption?.disabledReason ?? 'Claude Code'}>
            <Button
              size="icon"
              onClick={onTabCreateClaude}
              disabled={Boolean(claudeOption?.disabledReason)}
            >
              <ClaudeIcon className="w-4 h-4" />
            </Button>
          </span>
          {codexOption && (
            <span title={codexOption.disabledReason ?? 'Codex'}>
              <Button
                size="icon"
                onClick={onTabCreateCodex}
                disabled={Boolean(codexOption.disabledReason)}
              >
                <CodexIcon className="w-4 h-4" />
              </Button>
            </span>
          )}
          {localLlmOption && (
            // disabled の Button は pointer-events:none で title が出ないため span に付ける
            <span
              title={
                localLlmOption.disabledReason ??
                `${localLlmTabLabel(localLlmOption.provider)}: ${localLlmOption.model}`
              }
            >
              <Button
                size="icon"
                onClick={onTabCreateLocalLlm}
                disabled={Boolean(localLlmOption.disabledReason)}
              >
                <LocalLlmTabIcon provider={localLlmOption.provider} className="w-4 h-4" />
              </Button>
            </span>
          )}
        </div>
      </div>
    </>
  );
}
