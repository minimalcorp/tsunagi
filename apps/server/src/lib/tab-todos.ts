import type { Todo } from '@minimalcorp/tsunagi-shared';

type TodoStatus = Todo['status'];

const STATUSES: readonly TodoStatus[] = ['pending', 'in_progress', 'completed', 'deleted'];

function isStatus(value: unknown): value is TodoStatus {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : undefined;
}

/** todos を更新しうるツール */
export const TODO_TOOL_NAMES: ReadonlySet<string> = new Set([
  'TodoWrite',
  'TaskCreate',
  'TaskUpdate',
  'TaskGet',
  'TaskList',
]);

/** DB の todos 列（JSON 文字列）を読む。壊れていれば空扱い */
export function parseTodos(raw: string | null | undefined): Todo[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Todo[]) : [];
  } catch {
    return [];
  }
}

/**
 * PostToolUse hook のツール入出力を現在の todos に適用する。
 * 対象外のツール・解釈できない入出力なら null（todos は変更しない）。
 * Claude Code 側の Task はセッションID単位で永続化され --resume 後も残るため、
 * tsunagi 側も DB 上の todos を起点に差分を当てる（サーバー再起動でも進捗を失わない）
 */
export function applyToolToTodos(
  current: Todo[],
  toolName: string | undefined,
  input: Record<string, unknown> | undefined,
  response: Record<string, unknown> | undefined
): Todo[] | null {
  switch (toolName) {
    // TodoWrite: 毎回リスト全体が渡される（CLAUDE_CODE_ENABLE_TASKS=false の環境向け）
    case 'TodoWrite': {
      const todos = input?.todos;
      if (!Array.isArray(todos)) return null;
      return todos.filter(isRecord).map((t) => ({
        content: String(t.content ?? ''),
        ...(typeof t.activeForm === 'string' && { activeForm: t.activeForm }),
        status: isStatus(t.status) ? t.status : 'pending',
      }));
    }

    // TaskCreate: 応答 { task: { id, subject } }。activeForm は入力にだけある
    case 'TaskCreate': {
      const task = response?.task;
      if (!isRecord(task) || typeof task.id !== 'string') return null;
      // Claude Code 内部用の Task は TaskList にも出ないため、表示対象にしない
      if (isRecord(input?.metadata) && input.metadata._internal) return null;
      const created: Todo = {
        id: task.id,
        content: String(task.subject ?? input?.subject ?? ''),
        ...(typeof input?.activeForm === 'string' && { activeForm: input.activeForm }),
        status: 'pending',
        blockedBy: [],
      };
      return [...current.filter((t) => t.id !== task.id), created];
    }

    // TaskUpdate: 入力 { taskId, subject?, activeForm?, status?, addBlockedBy? }、
    // 応答 { success, statusChange?: { from, to } }
    case 'TaskUpdate': {
      const taskId = input?.taskId;
      if (typeof taskId !== 'string' || response?.success === false) return null;
      if (!current.some((t) => t.id === taskId)) return null;
      const statusChange = response?.statusChange;
      const status = isStatus(input?.status)
        ? input.status
        : isRecord(statusChange) && isStatus(statusChange.to)
          ? statusChange.to
          : undefined;
      const addBlockedBy = stringArray(input?.addBlockedBy) ?? [];
      const addBlocks = stringArray(input?.addBlocks) ?? [];
      return current.map((t) => {
        if (t.id === taskId) {
          return {
            ...t,
            ...(typeof input?.subject === 'string' && { content: input.subject }),
            ...(typeof input?.activeForm === 'string' && { activeForm: input.activeForm }),
            ...(status && { status }),
            blockedBy: [...new Set([...(t.blockedBy ?? []), ...addBlockedBy])],
          };
        }
        // addBlocks: 「taskId がこのタスクをブロックする」= 相手側の blockedBy に追加
        if (t.id && addBlocks.includes(t.id)) {
          return { ...t, blockedBy: [...new Set([...(t.blockedBy ?? []), taskId])] };
        }
        return t;
      });
    }

    // TaskGet: 応答 { task: { id, subject, status, blockedBy } | null }
    case 'TaskGet': {
      const task = response?.task;
      if (!isRecord(task) || typeof task.id !== 'string') return null;
      if (!current.some((t) => t.id === task.id)) return null;
      return current.map((t) =>
        t.id === task.id
          ? {
              ...t,
              ...(typeof task.subject === 'string' && { content: task.subject }),
              ...(isStatus(task.status) && { status: task.status }),
              ...(stringArray(task.blockedBy) && { blockedBy: stringArray(task.blockedBy) }),
            }
          : t
      );
    }

    // TaskList: 応答 { tasks: [{ id, subject, status, blockedBy }] } が全件なので置き換える。
    // 一覧にない既存 Task は削除済みとみなす。activeForm は一覧にないため既存値を引き継ぐ
    case 'TaskList': {
      const tasks = response?.tasks;
      if (!Array.isArray(tasks)) return null;
      const byId = new Map(current.filter((t) => t.id).map((t) => [t.id, t]));
      return tasks
        .filter((t): t is Record<string, unknown> => isRecord(t) && typeof t.id === 'string')
        .map((t) => {
          const prev = byId.get(t.id as string);
          return {
            id: t.id as string,
            content: String(t.subject ?? prev?.content ?? ''),
            ...(prev?.activeForm && { activeForm: prev.activeForm }),
            status: isStatus(t.status) ? t.status : (prev?.status ?? 'pending'),
            blockedBy: stringArray(t.blockedBy) ?? prev?.blockedBy ?? [],
          };
        });
    }

    default:
      return null;
  }
}
