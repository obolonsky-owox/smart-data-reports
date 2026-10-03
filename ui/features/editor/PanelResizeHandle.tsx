import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

export const PANEL_DEFAULT_WIDTH = 380;
export const PANEL_MIN_WIDTH = 320;
const PANEL_MAX_SHARE = 0.4;
const KEY_STEP = 16;

const maxWidthFor = (viewport: number) => Math.max(PANEL_MIN_WIDTH, Math.floor(viewport * PANEL_MAX_SHARE));
const clamp = (width: number, max: number) => Math.min(Math.max(Math.round(width), PANEL_MIN_WIDTH), max);

/** The column panel's width: React state only (the plugin iframe has no storage), kept within [320px, 40% of the window]. */
export function usePanelWidth() {
  const [max, setMax] = useState(() => maxWidthFor(window.innerWidth));
  const [width, setWidthState] = useState(() => clamp(PANEL_DEFAULT_WIDTH, max));

  useEffect(() => {
    const onResize = () => {
      const next = maxWidthFor(window.innerWidth);
      setMax(next);
      setWidthState((w) => clamp(w, next));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return { width, min: PANEL_MIN_WIDTH, max, setWidth: (next: number) => setWidthState(clamp(next, max)) };
}

interface PanelResizeHandleProps {
  width: number;
  min: number;
  max: number;
  onResize(width: number): void;
}

/** The left edge of a right-hand panel: drag it, or focus it and use ←/→, to change the panel's width. */
export function PanelResizeHandle({ width, min, max, onResize }: PanelResizeHandleProps) {
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    // Keeps the drag from selecting text and keeps the moves coming when the pointer leaves the handle.
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    // The handle is the panel's left edge, so moving it left widens the panel.
    onResize(current.startWidth + current.startX - event.clientX);
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    onResize(width + (event.key === 'ArrowLeft' ? KEY_STEP : -KEY_STEP));
  }

  return (
    <div
      role='separator'
      aria-orientation='vertical'
      aria-label='Resize column panel'
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      className='group/resize flex w-1.5 shrink-0 cursor-col-resize touch-none justify-center outline-none'
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
    >
      <span className='h-full w-px bg-border transition-colors group-hover/resize:bg-primary/40 group-focus-visible/resize:bg-primary/40' />
    </div>
  );
}
