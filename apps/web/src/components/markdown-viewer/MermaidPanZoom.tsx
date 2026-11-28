'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Maximize, ZoomIn, ZoomOut } from 'lucide-react';
import { loadMermaid } from '@/components/MarkdownComponents';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * mermaid 図を viewer 内でパン・ズームできる表示。操作は Figma に揃える。
 *
 * 文書のスクロールを奪わないよう、二本指スワイプによるパンは図にフォーカスしている間だけ有効
 * （クリック / Tab でフォーカス、Esc・外側クリックで解除）。ピンチと ⌘/Ctrl+スクロールは常にズーム。
 */

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const PADDING = 16;
const MIN_HEIGHT = 160;
const MAX_HEIGHT = 480;
const BUTTON_ZOOM = 1.25;

interface View {
  scale: number;
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

type RenderState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; svg: string; size: Size };

const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

/** 点 (cx, cy)（viewport 座標）を固定したまま倍率を変える */
function zoomAt(view: View, nextScale: number, cx: number, cy: number): View {
  const scale = clampScale(nextScale);
  const ratio = scale / view.scale;
  return { scale, x: cx - (cx - view.x) * ratio, y: cy - (cy - view.y) * ratio };
}

function fitView(size: Size, viewport: Size): View {
  const scale = clampScale(
    Math.min(
      1,
      (viewport.width - PADDING * 2) / size.width,
      (viewport.height - PADDING * 2) / size.height
    )
  );
  return {
    scale,
    x: (viewport.width - size.width * scale) / 2,
    y: (viewport.height - size.height * scale) / 2,
  };
}

/** svg 文字列の viewBox から自然サイズを得る */
function parseSvgSize(svg: string): Size {
  const viewBox = /viewBox="[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)"/.exec(svg);
  if (viewBox) return { width: Number(viewBox[1]), height: Number(viewBox[2]) };
  return { width: 600, height: 300 };
}

/** svg を自然サイズ（wrapper の 100%）で描画させる */
function normalizeSvg(svg: string): string {
  return svg.replace(/<svg([^>]*)>/, (_match, attrs: string) => {
    const cleaned = attrs
      .replace(/\swidth="[^"]*"/, '')
      .replace(/\sheight="[^"]*"/, '')
      .replace(/\sstyle="[^"]*"/, '');
    return `<svg${cleaned} width="100%" height="100%">`;
  });
}

interface GestureLikeEvent extends UIEvent {
  scale: number;
  clientX: number;
  clientY: number;
}

export function MermaidPanZoom({ code }: { code: string }) {
  const { effectiveTheme } = useTheme();
  const renderId = `mermaid-${useId().replace(/:/g, '-')}`;
  const [render, setRender] = useState<RenderState>({ status: 'loading' });
  const [viewportWidth, setViewportWidth] = useState(0);
  const [view, setView] = useState<View | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastGestureScale = useRef(1);

  // mermaid で svg 文字列を生成（DOM へは React が描画する）
  useEffect(() => {
    let cancelled = false;
    const themed = `%%{init: {"theme": "${effectiveTheme === 'dark' ? 'dark' : 'default'}"}}%%\n${code}`;
    loadMermaid()
      .then((mermaid) => mermaid.render(renderId, themed))
      .then(({ svg }) => {
        if (cancelled) return;
        setRender({ status: 'ready', svg: normalizeSvg(svg), size: parseSvgSize(svg) });
        setView(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setRender({
          status: 'error',
          message: error instanceof Error ? error.message : 'Mermaid rendering failed',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [code, effectiveTheme, renderId]);

  // viewport 幅の追従
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setViewportWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [render.status]);

  const size = render.status === 'ready' ? render.size : null;
  const viewportHeight = size
    ? Math.round(
        Math.min(
          MAX_HEIGHT,
          Math.max(
            MIN_HEIGHT,
            size.height * Math.min(1, (viewportWidth - PADDING * 2) / size.width) + PADDING * 2
          )
        )
      )
    : MIN_HEIGHT;
  const viewportSize: Size = { width: viewportWidth, height: viewportHeight };
  // 未操作（view === null）の間は常に全体表示
  const currentView = size && viewportWidth > 0 ? (view ?? fitView(size, viewportSize)) : null;

  const update = useCallback(
    (fn: (v: View) => View) => {
      if (!size || viewportWidth <= 0) return;
      setView((prev) =>
        fn(prev ?? fitView(size, { width: viewportWidth, height: viewportHeight }))
      );
    },
    [size, viewportWidth, viewportHeight]
  );

  const zoomCenter = (factor: number) =>
    update((v) => zoomAt(v, v.scale * factor, viewportWidth / 2, viewportHeight / 2));
  const resetFit = () => setView(null);
  const resetActual = () => update((v) => zoomAt(v, 1, viewportWidth / 2, viewportHeight / 2));

  // wheel / Safari gesture は preventDefault が必要なため passive: false で直接登録する
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const local = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      return { cx: clientX - rect.left, cy: clientY - rect.top };
    };
    const onWheel = (event: WheelEvent) => {
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientHeight : 1;
      const dx = event.deltaX * unit;
      const dy = event.deltaY * unit;
      if (event.ctrlKey || event.metaKey) {
        // トラックパッドのピンチは ctrlKey 付き wheel として届く
        event.preventDefault();
        const { cx, cy } = local(event.clientX, event.clientY);
        const factor = Math.exp(-Math.max(-50, Math.min(50, dy)) * 0.01);
        update((v) => zoomAt(v, v.scale * factor, cx, cy));
        return;
      }
      if (document.activeElement !== el) return;
      event.preventDefault();
      if (event.shiftKey && dx === 0) update((v) => ({ ...v, x: v.x - dy }));
      else update((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
    };
    // Safari のピンチは GestureEvent（scale はジェスチャー開始からの累積倍率）
    const onGestureStart = (event: Event) => {
      event.preventDefault();
      lastGestureScale.current = 1;
    };
    const onGestureChange = (event: Event) => {
      event.preventDefault();
      const gesture = event as GestureLikeEvent;
      const factor = gesture.scale / lastGestureScale.current;
      lastGestureScale.current = gesture.scale;
      const { cx, cy } = local(gesture.clientX, gesture.clientY);
      update((v) => zoomAt(v, v.scale * factor, cx, cy));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', onGestureStart);
    el.addEventListener('gesturechange', onGestureChange);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', onGestureStart);
      el.removeEventListener('gesturechange', onGestureChange);
    };
  }, [update]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    if (event.button === 1) event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setIsDragging(true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const points = [...pointers.current.entries()];
    if (points.length >= 2) {
      // タッチ 2 本: ピンチ（距離比）+ 中点の移動でパン
      const other = points.find(([id]) => id !== event.pointerId)?.[1];
      if (other) {
        const rect = event.currentTarget.getBoundingClientRect();
        const before = Math.hypot(previous.x - other.x, previous.y - other.y);
        const after = Math.hypot(event.clientX - other.x, event.clientY - other.y);
        const cx = (event.clientX + other.x) / 2 - rect.left;
        const cy = (event.clientY + other.y) / 2 - rect.top;
        const dx = (event.clientX - previous.x) / 2;
        const dy = (event.clientY - previous.y) / 2;
        update((v) => {
          const zoomed = before > 0 ? zoomAt(v, v.scale * (after / before), cx, cy) : v;
          return { ...zoomed, x: zoomed.x + dx, y: zoomed.y + dy };
        });
      }
    } else {
      const dx = event.clientX - previous.x;
      const dy = event.clientY - previous.y;
      update((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) setIsDragging(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const mod = event.metaKey || event.ctrlKey;
    if (event.key === 'Escape') {
      event.currentTarget.blur();
    } else if (event.shiftKey && event.code === 'Digit1') {
      resetFit();
    } else if (event.shiftKey && event.code === 'Digit0') {
      resetActual();
    } else if (mod && (event.key === '=' || event.key === '+')) {
      zoomCenter(BUTTON_ZOOM);
    } else if (mod && event.key === '-') {
      zoomCenter(1 / BUTTON_ZOOM);
    } else if (event.key === ' ') {
      // フォーカス中の Space でページがスクロールしないように（スペース+ドラッグ）
    } else {
      return;
    }
    event.preventDefault();
  };

  if (render.status === 'error') {
    return (
      <div className="my-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
        <p className="mb-1 font-medium">Mermaid Error</p>
        <pre className="whitespace-pre-wrap">{render.message}</pre>
      </div>
    );
  }

  return (
    <figure className="not-prose relative my-4 overflow-hidden rounded-md border border-border bg-card">
      {render.status === 'ready' && (
        <div
          role="toolbar"
          aria-label="図の操作"
          className="absolute top-2 right-2 z-10 flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5 shadow-xs"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="縮小"
            title="縮小 (⌘-)"
            onClick={() => zoomCenter(1 / BUTTON_ZOOM)}
          >
            <ZoomOut />
          </Button>
          <button
            type="button"
            className="h-8 min-w-12 rounded-md px-1 text-xs tabular-nums text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="100% (⇧0)"
            onClick={resetActual}
          >
            {Math.round((currentView?.scale ?? 1) * 100)}%
          </button>
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="拡大"
            title="拡大 (⌘+)"
            onClick={() => zoomCenter(BUTTON_ZOOM)}
          >
            <ZoomIn />
          </Button>
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="全体表示"
            title="全体表示 (⇧1)"
            onClick={resetFit}
          >
            <Maximize />
          </Button>
        </div>
      )}
      <div
        ref={viewportRef}
        tabIndex={0}
        role="img"
        aria-label="mermaid 図（クリックで操作、ドラッグで移動、ピンチで拡大縮小）"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onDoubleClick={resetFit}
        onKeyDown={onKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        style={{ height: viewportHeight }}
        className={cn(
          'relative touch-none overflow-hidden outline-none select-none',
          'bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-size-[16px_16px]',
          'transition-shadow duration-[130ms] ease-[cubic-bezier(0.4,0,0.2,1)]',
          isFocused && 'shadow-[inset_0_0_0_2px_var(--primary)]',
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        )}
      >
        {render.status === 'loading' && (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Rendering diagram...
          </div>
        )}
        {render.status === 'ready' && currentView && (
          <div
            className="absolute top-0 left-0 origin-top-left"
            style={{
              width: render.size.width,
              height: render.size.height,
              transform: `translate(${currentView.x}px, ${currentView.y}px) scale(${currentView.scale})`,
            }}
            // mermaid が生成した svg（securityLevel は MarkdownComponents の設定に従う）
            dangerouslySetInnerHTML={{ __html: render.svg }}
          />
        )}
      </div>
      <figcaption className="flex items-center justify-between gap-2 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
        <span>
          {isFocused
            ? '二本指 / ドラッグで移動 · ピンチ / ⌘+スクロールで拡大縮小 · ⇧1 全体 · ⇧0 100% · Esc で解除'
            : 'クリックで操作開始 · ピンチ / ⌘+スクロールで拡大縮小 · ドラッグで移動'}
        </span>
        <span className="font-mono">mermaid</span>
      </figcaption>
    </figure>
  );
}
