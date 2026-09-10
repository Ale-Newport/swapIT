import clsx from 'clsx';
import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { HANDLES, drawRect, moveRect, resizeRect, type HandleId, type Rect } from './logic';

type Mode = { kind: 'move' | 'draw' } | { kind: 'resize'; handle: HandleId };

const HANDLE_STYLE: Record<HandleId, string> = {
  nw: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
  n: 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize',
  ne: 'left-full top-0 -translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
  e: 'left-full top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
  se: 'left-full top-full -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
  s: 'left-1/2 top-full -translate-x-1/2 -translate-y-1/2 cursor-ns-resize',
  sw: 'left-0 top-full -translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
  w: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
};

/**
 * The crop rectangle drawn over a real frame of the video. Everything is stored
 * in source pixels; only the rendering is proportional.
 */
export function CropCanvas({
  src,
  rect,
  vw,
  vh,
  ratio,
  onChange,
  alt,
}: {
  src: string;
  rect: Rect;
  vw: number;
  vh: number;
  ratio: number | null;
  onChange: (rect: Rect) => void;
  alt: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    mode: Mode;
    clientX: number;
    clientY: number;
    base: Rect;
    anchorX: number;
    anchorY: number;
    scaleX: number;
    scaleY: number;
    moved: boolean;
  } | null>(null);

  const begin = (e: ReactPointerEvent<HTMLElement>, mode: Mode) => {
    const root = rootRef.current;
    if (!root || vw <= 0 || vh <= 0) return;
    e.preventDefault();
    e.stopPropagation();
    const box = root.getBoundingClientRect();
    const scaleX = vw / Math.max(1, box.width);
    const scaleY = vh / Math.max(1, box.height);
    drag.current = {
      mode,
      clientX: e.clientX,
      clientY: e.clientY,
      base: rect,
      anchorX: (e.clientX - box.left) * scaleX,
      anchorY: (e.clientY - box.top) * scaleY,
      scaleX,
      scaleY,
      moved: false,
    };
    root.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    // A click that never travels leaves the crop alone instead of collapsing it.
    if (!state.moved) {
      if (Math.hypot(e.clientX - state.clientX, e.clientY - state.clientY) < 4) return;
      state.moved = true;
    }
    const dx = (e.clientX - state.clientX) * state.scaleX;
    const dy = (e.clientY - state.clientY) * state.scaleY;
    if (state.mode.kind === 'move') {
      onChange(moveRect(state.base, dx, dy, vw, vh));
    } else if (state.mode.kind === 'resize') {
      onChange(resizeRect(state.base, state.mode.handle, dx, dy, vw, vh, ratio));
    } else {
      onChange(drawRect(state.anchorX, state.anchorY, state.anchorX + dx, state.anchorY + dy, ratio, vw, vh));
    }
  };

  const end = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    if (rootRef.current?.hasPointerCapture(e.pointerId)) rootRef.current.releasePointerCapture(e.pointerId);
  };

  const pct = (value: number, total: number) => `${Math.max(0, Math.min(100, (value / Math.max(1, total)) * 100))}%`;

  return (
    <div className="flex justify-center">
      <div
        ref={rootRef}
        onPointerDown={(e) => begin(e, { kind: 'draw' })}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        className="relative inline-block max-w-full touch-none select-none overflow-hidden rounded-lg border border-line bg-canvas"
      >
        <img src={src} alt={alt} draggable={false} className="block max-h-[420px] max-w-full select-none" />

        {/* An enormous shadow around the crop dims everything outside it. */}
        <div
          className="pointer-events-none absolute bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
          style={{ left: pct(rect.x, vw), top: pct(rect.y, vh), width: pct(rect.w, vw), height: pct(rect.h, vh) }}
        />

        <div
          onPointerDown={(e) => begin(e, { kind: 'move' })}
          style={{ left: pct(rect.x, vw), top: pct(rect.y, vh), width: pct(rect.w, vw), height: pct(rect.h, vh) }}
          className="absolute cursor-move border-2 border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
        >
          {/* Rule-of-thirds guides */}
          <div className="pointer-events-none absolute inset-0">
            <span className="absolute left-1/3 top-0 h-full w-px bg-white/35" />
            <span className="absolute left-2/3 top-0 h-full w-px bg-white/35" />
            <span className="absolute left-0 top-1/3 h-px w-full bg-white/35" />
            <span className="absolute left-0 top-2/3 h-px w-full bg-white/35" />
          </div>

          {HANDLES.map((handle) => (
            <div
              key={handle}
              onPointerDown={(e) => begin(e, { kind: 'resize', handle })}
              aria-label={`Resize ${handle}`}
              className={clsx(
                'absolute h-3 w-3 rounded-[3px] border border-ink/40 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.3)]',
                HANDLE_STYLE[handle],
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
