/**
 * タスク詳細のフォーカス先を 1 か所で管理する。
 * ウィンドウ復帰・再接続・タブ切り替え等で各コンポーネントが勝手に xterm へ戻すと、
 * 入力中の Monaco からフォーカスを奪うため、戻り先はここで決める。
 */
export type PaneFocusTarget = 'terminal' | 'editor';
export type FocusTarget = PaneFocusTarget | 'modal';

let paneTarget: PaneFocusTarget = 'terminal';
let modalOpen = false;
const focusers = new Map<FocusTarget, () => void>();

/** 今フォーカスを持つべき場所。モーダル表示中はモーダルを優先する */
export function getFocusTarget(): FocusTarget {
  return modalOpen ? 'modal' : paneTarget;
}

/** モーダル表示中の変更は無視する（閉じたらモーダルを開く前の場所へ戻すため） */
export function setPaneFocusTarget(target: PaneFocusTarget): void {
  if (!modalOpen) paneTarget = target;
}

export function setFocusModalOpen(open: boolean): void {
  modalOpen = open;
}

/** フォーカス手段を登録する。戻り値で解除する */
export function registerFocusTarget(target: FocusTarget, focus: () => void): () => void {
  focusers.set(target, focus);
  return () => {
    if (focusers.get(target) === focus) focusers.delete(target);
  };
}

export function restoreFocus(): void {
  focusers.get(getFocusTarget())?.();
}
