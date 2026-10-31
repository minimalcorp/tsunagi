/**
 * トップページのボードのスクロール位置。
 * 戻ってきた時・再読み込みした時に前回の位置で表示するため、フィルタと同じく sessionStorage（タブ単位）に保持する。
 */
export interface BoardScroll {
  /** ボードの横スクロール位置 */
  left: number;
  /** repoKey -> 列内リストの縦スクロール位置 */
  columns: Record<string, number>;
}

const STORAGE_KEY = 'tsunagi:board-scroll';

export function loadBoardScroll(): BoardScroll | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    return saved ? (JSON.parse(saved) as BoardScroll) : null;
  } catch {
    return null;
  }
}

export function saveBoardScroll(scroll: BoardScroll): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(scroll));
  } catch {
    // ignore
  }
}
