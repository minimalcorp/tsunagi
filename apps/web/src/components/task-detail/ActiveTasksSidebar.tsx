'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Circle,
  ListX,
  Loader2,
  MessageSquare,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { Task } from '@minimalcorp/tsunagi-shared';
import { activityKind, unreadKind, type ActivityKind, type UnreadKind } from '@/lib/agent-status';
import { useLiveTasks } from '@/hooks/useLiveTasks';
import { useSidebarTaskList, type SidebarTaskListState } from '@/hooks/useSidebarTaskList';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/Dialog';
import { DialogClose } from '@/components/ui/dialog-primitives';
import { SwipeToRemove } from './SwipeToRemove';
import { cn } from '@/lib/utils';

/** Active セクションの表示順（要対応が上） */
const ACTIVITY_ORDER: Record<ActivityKind, number> = {
  waiting: 0,
  error: 1,
  success: 2,
  running: 3,
};

/** running / waiting から別の状態に移ってから、一覧から外せるようになるまでの時間（誤操作防止） */
const REMOVE_COOLDOWN_MS = 3000;

type AgentState = 'running' | 'waiting' | 'error' | 'success';

/** 実行ステータスのアイコン。判定・色は TaskCard の AgentStatusIndicator と揃える */
const AGENT_STATE: Record<AgentState, { icon: LucideIcon; className: string; label: string }> = {
  running: { icon: Loader2, className: 'text-primary animate-spin', label: 'Running' },
  waiting: { icon: MessageSquare, className: 'text-warning', label: 'Waiting for your input' },
  error: { icon: XCircle, className: 'text-destructive', label: 'Failed' },
  success: { icon: CheckCircle2, className: 'text-success', label: 'Finished' },
};

const IDLE_STATE = { icon: Circle, className: 'text-muted-foreground', label: 'Idle' };

/** 未読マーカー（行左端のバー）の色とラベル。TaskCard と揃える */
const UNREAD_MARKER: Record<UnreadKind, { className: string; label: string }> = {
  success: { className: 'bg-unread-success', label: 'Finished, not opened yet' },
  error: { className: 'bg-unread-error', label: 'Failed, not opened yet' },
  waiting: { className: 'bg-unread-waiting', label: 'Waiting for your input' },
};

function agentState(tabs: Task['tabs']): AgentState | null {
  if (!tabs || tabs.length === 0) return null;
  if (tabs.some((t) => t.status === 'running')) return 'running';
  if (tabs.some((t) => t.status === 'waiting')) return 'waiting';
  if (tabs.some((t) => t.status === 'error')) return 'error';
  if (tabs.every((t) => t.status === 'success')) return 'success';
  return null;
}

/** 外せない状態（実行中・入力待ち）か */
function isBusy(kind: ActivityKind | null) {
  return kind === 'running' || kind === 'waiting';
}

/**
 * タスクの現在の状態を一覧に反映する。
 * - 実行中・未読になったタスクを追加する（外した時と状態が変わっていなければ追加しない）
 * - 存在しなくなったタスクを取り除く
 * 変化がなければ同じ参照を返す。
 */
function reconcile(state: SidebarTaskListState, tasks: Task[]): SidebarTaskListState {
  const ids = new Set(tasks.map((t) => t.id));
  const shown = state.shown.filter((id) => ids.has(id));
  const dismissed: SidebarTaskListState['dismissed'] = {};

  for (const task of tasks) {
    const kind = activityKind(task);
    if (task.id in state.dismissed && state.dismissed[task.id] === kind) {
      dismissed[task.id] = kind;
      continue;
    }
    if (kind && !shown.includes(task.id)) shown.push(task.id);
  }

  const unchanged =
    shown.length === state.shown.length &&
    shown.every((id, i) => id === state.shown[i]) &&
    Object.keys(dismissed).length === Object.keys(state.dismissed).length;
  return unchanged ? state : { ...state, shown, dismissed };
}

function subscribeHover(onChange: () => void) {
  const mql = window.matchMedia('(hover: hover)');
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

interface ActiveTasksSidebarProps {
  /** 表示中のタスクID */
  currentTaskId: string;
}

/**
 * タスク詳細ページ左端のタスク一覧。
 * 実行中・未読になったタスクを追加し、ユーザーが外すまで残す（一覧は localStorage で全タブ共有）。
 * 状態の追従は全タスクを対象にし（useLiveTasks）、表示だけを絞り込む。
 */
export function ActiveTasksSidebar({ currentTaskId }: ActiveTasksSidebarProps) {
  const router = useRouter();
  const { tasks, isLoading } = useLiveTasks();
  const { state: storedState, update } = useSidebarTaskList();

  // 取得前は全タスクが存在しない扱いになって一覧が消えるため、取得後にだけ反映する
  const state = useMemo(
    () => (isLoading ? storedState : reconcile(storedState, tasks)),
    [isLoading, storedState, tasks]
  );
  useEffect(() => {
    if (state !== storedState) update((prev) => reconcile(prev, tasks));
  }, [state, storedState, tasks, update]);

  // running / waiting から抜けた時刻（performance.now 基準。このタブで観測したもののみ）。
  // 外せるようになるまでの猶予に使い、操作時のイベントの timeStamp と比べる
  const prevKindsRef = useRef(new Map<string, ActivityKind | null>());
  const settledAtRef = useRef(new Map<string, number>());
  useEffect(() => {
    for (const task of tasks) {
      const kind = activityKind(task);
      if (isBusy(prevKindsRef.current.get(task.id) ?? null) && !isBusy(kind)) {
        settledAtRef.current.set(task.id, performance.now());
      }
      prevKindsRef.current.set(task.id, kind);
    }
  }, [tasks]);

  const { active, done } = useMemo(() => {
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const active: { task: Task; kind: ActivityKind }[] = [];
    const done: Task[] = [];
    for (const id of state.shown) {
      const task = byId.get(id);
      if (!task) continue;
      const kind = activityKind(task);
      // 表示中のタスクは確認済みとみなす（完了→既読化までの一瞬の未読表示を出さない）
      if (!kind || (task.id === currentTaskId && (kind === 'success' || kind === 'error'))) {
        done.push(task);
      } else {
        active.push({ task, kind });
      }
    }
    const byOrder = (a: Task, b: Task) =>
      a.order - b.order || a.createdAt.localeCompare(b.createdAt);
    active.sort(
      (a, b) => ACTIVITY_ORDER[a.kind] - ACTIVITY_ORDER[b.kind] || byOrder(a.task, b.task)
    );
    done.sort(byOrder);
    return { active, done };
  }, [tasks, state.shown, currentTaskId]);

  const rows = useMemo(() => [...active.map(({ task }) => task), ...done], [active, done]);
  const removableRows = rows.filter((task) => !isBusy(activityKind(task)));

  const [openId, setOpenId] = useState<string | null>(null);
  const [clearTargets, setClearTargets] = useState<string[] | null>(null);

  // スワイプ操作のヒント: ホバーできる端末では最初にホバーした行、タッチ端末では最初に表示された行で一度だけ
  const canHover = useSyncExternalStore(
    subscribeHover,
    () => window.matchMedia('(hover: hover)').matches,
    () => true
  );
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hintId = state.hintSeen
    ? null
    : canHover
      ? removableRows.some((t) => t.id === hoveredId)
        ? hoveredId
        : null
      : (removableRows[0]?.id ?? null);

  /** 外せるか（猶予時間があるため、操作時のイベントの timeStamp で判定する） */
  const canRemoveAt = (task: Task, now: number) =>
    !isBusy(activityKind(task)) &&
    now - (settledAtRef.current.get(task.id) ?? 0) >= REMOVE_COOLDOWN_MS;

  const removeTasks = (ids: string[]) => {
    const byId = new Map(tasks.map((t) => [t.id, t]));
    update((prev) => {
      const dismissed = { ...prev.dismissed };
      for (const id of ids) {
        const task = byId.get(id);
        if (task) dismissed[id] = activityKind(task);
      }
      return { ...prev, shown: prev.shown.filter((id) => !ids.includes(id)), dismissed };
    });
  };

  /** 一括で外す確認ダイアログを開く（対象は開いた時点で外せるタスク） */
  const openClearDialog = (e: React.MouseEvent) => {
    const ids = rows.filter((t) => canRemoveAt(t, e.timeStamp)).map((t) => t.id);
    if (ids.length > 0) setClearTargets(ids);
  };

  const renderRow = (task: Task) => {
    const isCurrent = task.id === currentTaskId;
    const busy = isBusy(activityKind(task));
    const agent = agentState(task.tabs);
    const { icon: Icon, className, label } = agent ? AGENT_STATE[agent] : IDLE_STATE;
    let marker = unreadKind(task);
    if (isCurrent && marker !== 'waiting') marker = null;

    return (
      <li key={task.id}>
        <SwipeToRemove
          canSwipe={(timeStamp) => canRemoveAt(task, timeStamp)}
          open={openId === task.id && !busy}
          onOpenChange={(open) =>
            setOpenId((prev) => (open ? task.id : prev === task.id ? null : prev))
          }
          onRemove={() => removeTasks([task.id])}
          hint={hintId === task.id}
          onHintEnd={() => update((prev) => ({ ...prev, hintSeen: true }))}
          onMouseEnter={() => !state.hintSeen && !busy && setHoveredId((prev) => prev ?? task.id)}
        >
          {marker && (
            <span
              role="img"
              aria-label={UNREAD_MARKER[marker].label}
              title={UNREAD_MARKER[marker].label}
              className={cn(
                'absolute left-0 top-1.5 bottom-1.5 z-10 w-[3px] rounded-r-[3px]',
                UNREAD_MARKER[marker].className
              )}
            />
          )}
          <button
            type="button"
            onClick={() => router.replace(`/tasks/${task.id}`)}
            aria-current={isCurrent ? 'page' : undefined}
            className={cn(
              'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent',
              isCurrent && 'bg-accent'
            )}
          >
            <span role="img" aria-label={label} title={label} className="mt-0.5 shrink-0">
              <Icon className={cn('size-3.5', className)} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-foreground" title={task.title}>
                {task.title}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {task.owner}/{task.repo}
              </span>
            </span>
          </button>
        </SwipeToRemove>
      </li>
    );
  };

  const renderSection = (title: string, sectionTasks: Task[]) =>
    sectionTasks.length > 0 && (
      <section>
        <h2 className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">
          {title} <span className="tabular-nums">{sectionTasks.length}</span>
        </h2>
        <ul className="space-y-0.5">{sectionTasks.map(renderRow)}</ul>
      </section>
    );

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-background dark:bg-card">
      {/* 詳細ページのヘッダー（p-4 + h-8 の行 + border）と高さを揃える */}
      <div className="flex h-8 shrink-0 box-content items-center gap-2 border-b border-border bg-card p-4">
        <span className="text-sm font-medium text-foreground">Tasks</span>
        <Badge variant="secondary">{rows.length}</Badge>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto text-muted-foreground hover:text-foreground"
          aria-label="Clear list"
          title="Clear list"
          disabled={removableRows.length === 0}
          onClick={openClearDialog}
        >
          <ListX />
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="p-4 text-center text-xs text-muted-foreground">No tasks</p>
      ) : (
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {renderSection(
            'Active',
            active.map(({ task }) => task)
          )}
          {renderSection('Done', done)}
        </div>
      )}

      <Dialog
        open={clearTargets !== null}
        onOpenChange={(details) => !details.open && setClearTargets(null)}
        title="Clear list"
        maxWidth="md"
        showCloseButton={false}
      >
        <div className="space-y-4">
          <p className="text-foreground">
            Remove {clearTargets?.length} task{clearTargets?.length === 1 ? '' : 's'} from this
            list?
          </p>
          <p className="text-sm text-muted-foreground">
            Running or waiting tasks stay. The tasks themselves are not deleted.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose render={<Button variant="outline" className="cursor-pointer" />}>
              Cancel
            </DialogClose>
            <Button
              variant="destructive"
              className="cursor-pointer"
              onClick={() => {
                if (clearTargets) removeTasks(clearTargets);
                setClearTargets(null);
              }}
            >
              Clear
            </Button>
          </div>
        </div>
      </Dialog>
    </aside>
  );
}
