/**
 * 最後に詳細を開いたタスクの記録。
 * トップページに戻った時にそのカードまでボードをスクロールするために使う。
 * フィルタと同じく sessionStorage（タブ単位）に保持する。
 */
const STORAGE_KEY = 'tsunagi:last-viewed-task';

export function rememberLastViewedTask(taskId: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, taskId);
  } catch {
    // ignore
  }
}

/** 記録を読む（消さない）。SSR 中は null */
export function peekLastViewedTask(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** 一度スクロールしたら消す（トップページを再読み込みした時に再度飛ばないようにする） */
export function clearLastViewedTask(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
