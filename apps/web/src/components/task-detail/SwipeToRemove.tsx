'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** 少しスワイプして止めた時に出る削除アクションの幅 */
const ACTION_WIDTH = 64;
/** 行幅に対してこの割合を超えてスワイプしたら、そのまま外す */
const FULL_SWIPE_RATIO = 0.6;
/** 横スワイプと判定するまでの移動量（これ未満はタップ扱い） */
const DRAG_THRESHOLD = 8;

interface SwipeToRemoveProps {
  children: ReactNode;
  /** スワイプを受け付けるか。操作開始時に、そのイベントの timeStamp を渡して判定する */
  canSwipe: (timeStamp: number) => boolean;
  /** 削除アクションを出したまま止まっているか */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemove: () => void;
  /** 操作ヒント（少しだけ左に動かして戻す）を再生するか */
  hint?: boolean;
  onHintEnd?: () => void;
  /** マウスでホバーした時 */
  onMouseEnter?: () => void;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  /** 操作開始時の位置（開いていれば -ACTION_WIDTH） */
  base: number;
  dragging: boolean;
  /** 外せない行。横に動かしても行は動かさず、click だけ抑止する */
  locked: boolean;
}

/**
 * iOS メール風の、右から左へのスワイプで行を外す操作。
 * タッチ・マウスとも Pointer Events で扱う。
 */
export function SwipeToRemove({
  children,
  canSwipe,
  open,
  onOpenChange,
  onRemove,
  hint = false,
  onHintEnd,
  onMouseEnter,
}: SwipeToRemoveProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  /** ドラッグ中の位置（null = ドラッグしていない） */
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);

  const offset = dragOffset ?? (open ? -ACTION_WIDTH : 0);
  // 操作中・開いている間はヒントを出さない（transform をアニメーションが上書きしてしまうため）
  const showHint = hint && dragOffset === null && !open && !removing;

  // 開いている間は、行の外を触ったら閉じる
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onOpenChange(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, onOpenChange]);

  /** 行を左へ送り出してから外す */
  const remove = (from: number) => {
    const content = contentRef.current;
    if (!content) return onRemove();
    setRemoving(true);
    content
      .animate([{ transform: `translateX(${from}px)` }, { transform: 'translateX(-100%)' }], {
        duration: 200,
        easing: 'ease-out',
        fill: 'forwards',
      })
      .finished.then(onRemove, onRemove);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // ドラッグ後に click が発火しなかった場合に、次のタップを握りつぶさないようにする
    suppressClickRef.current = false;
    if (removing || e.button !== 0) return;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      base: open ? -ACTION_WIDTH : 0,
      dragging: false,
      locked: !canSwipe(e.timeStamp),
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.dragging) {
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      // 縦方向の動きはスクロールに任せる
      if (Math.abs(dy) >= Math.abs(dx)) {
        dragRef.current = null;
        return;
      }
      drag.dragging = true;
      if (drag.locked) return;
      // ヒントの再生中にスワイプしたら、操作方法は伝わったのでヒントを終える
      if (hint) onHintEnd?.();
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (drag.locked) return;
    setDragOffset(Math.min(0, Math.max(-e.currentTarget.offsetWidth, drag.base + dx)));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.pointerId !== e.pointerId || !drag.dragging) return;

    // ドラッグの後に発火する click で詳細へ遷移しないようにする
    suppressClickRef.current = true;
    if (drag.locked) return;
    const distance = -Math.min(0, drag.base + e.clientX - drag.startX);
    setDragOffset(null);
    if (distance > e.currentTarget.offsetWidth * FULL_SWIPE_RATIO) {
      remove(-distance);
    } else {
      onOpenChange(distance > ACTION_WIDTH / 2);
    }
  };

  const handlePointerCancel = () => {
    dragRef.current = null;
    setDragOffset(null);
  };

  const handleClickCapture = (e: React.MouseEvent) => {
    // ドラッグ直後の click。pointerup で開いた状態は既に反映されているため、閉じる処理より先に判定する
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // 開いている時に行をタップしたら、遷移せずに閉じる（iOS と同じ）。削除アクションはそのまま通す
    if (open && !(e.target as Element).closest('[data-swipe-action]')) {
      e.preventDefault();
      e.stopPropagation();
      onOpenChange(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className="relative touch-pan-y select-none overflow-hidden rounded-md"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerEnter={(e) => e.pointerType === 'mouse' && onMouseEnter?.()}
      onClickCapture={handleClickCapture}
    >
      {(offset !== 0 || showHint || removing) && (
        <div className="absolute inset-0 flex justify-end bg-destructive">
          <button
            type="button"
            data-swipe-action
            tabIndex={open ? 0 : -1}
            aria-label="Remove from list"
            title="Remove from list"
            onClick={() => remove(offset)}
            style={{ width: removing ? '100%' : Math.max(ACTION_WIDTH, -offset) }}
            className={cn(
              'flex items-center pl-5 text-white',
              dragOffset === null && 'transition-[width] duration-200 ease-out'
            )}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      )}
      <div
        ref={contentRef}
        style={{ transform: showHint ? undefined : `translateX(${offset}px)` }}
        className={cn(
          'relative bg-background dark:bg-card',
          dragOffset === null && 'transition-transform duration-200 ease-out',
          showHint && 'animate-swipe-hint'
        )}
        onAnimationEnd={(e) => e.target === e.currentTarget && onHintEnd?.()}
      >
        {children}
      </div>
    </div>
  );
}
