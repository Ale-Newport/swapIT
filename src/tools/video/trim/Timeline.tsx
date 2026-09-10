import clsx from 'clsx';
import { useRef, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { formatTimecode } from '@/core/format';
import { MIN_CLIP, clamp, moveHandle, type Range } from './logic';

type Handle = 'start' | 'end' | 'scrub';

/**
 * The trim track: a draggable start handle, end handle and playhead over a
 * proportional representation of the clip.
 */
export function Timeline({
  duration,
  range,
  scrub,
  onRangeChange,
  onScrubChange,
}: {
  duration: number;
  range: Range;
  scrub: number;
  onRangeChange: (range: Range) => void;
  onScrubChange: (time: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<Handle | null>(null);

  const pct = (time: number) => (duration > 0 ? clamp((time / duration) * 100, 0, 100) : 0);

  const timeAt = (clientX: number) => {
    const el = trackRef.current;
    if (!el || duration <= 0) return 0;
    const rect = el.getBoundingClientRect();
    return clamp(((clientX - rect.left) / Math.max(1, rect.width)) * duration, 0, duration);
  };

  const apply = (which: Handle, time: number) => {
    if (which === 'scrub') {
      onScrubChange(clamp(time, 0, duration));
      return;
    }
    const next = moveHandle(range, which, time, duration);
    onRangeChange(next);
    // Show the frame the handle is sitting on while it is being dragged.
    onScrubChange(which === 'start' ? next.start : next.end);
  };

  const dragProps = (which: Handle) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (duration <= 0) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragging.current = which;
      apply(which, timeAt(e.clientX));
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      if (dragging.current !== which) return;
      apply(which, timeAt(e.clientX));
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      if (dragging.current !== which) return;
      dragging.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
    },
    onPointerCancel: () => {
      dragging.current = null;
    },
  });

  const keyProps = (which: Handle, value: number) => ({
    tabIndex: 0,
    role: 'slider',
    'aria-valuemin': 0,
    'aria-valuemax': Math.round(duration * 100) / 100,
    'aria-valuenow': Math.round(value * 100) / 100,
    'aria-valuetext': formatTimecode(value, true),
    'aria-label': which === 'start' ? 'Clip start' : which === 'end' ? 'Clip end' : 'Preview position',
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => {
      const step = e.shiftKey ? 1 : 0.1;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        apply(which, value - step);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        apply(which, value + step);
      } else if (e.key === 'Home') {
        e.preventDefault();
        apply(which, 0);
      } else if (e.key === 'End') {
        e.preventDefault();
        apply(which, duration);
      }
    },
  });

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="select-none">
      <div
        ref={trackRef}
        {...dragProps('scrub')}
        className="relative h-16 cursor-pointer touch-none rounded-lg border border-line bg-canvas"
      >
        {/* Everything outside the clip is dimmed. */}
        <div className="absolute inset-y-0 left-0 rounded-l-lg bg-ink/8" style={{ width: `${pct(range.start)}%` }} />
        <div className="absolute inset-y-0 right-0 rounded-r-lg bg-ink/8" style={{ width: `${100 - pct(range.end)}%` }} />
        <div
          className="absolute inset-y-0 border-y-2 border-accent bg-accent-soft"
          style={{ left: `${pct(range.start)}%`, width: `${Math.max(0, pct(range.end) - pct(range.start))}%` }}
        />

        {(['start', 'end'] as const).map((which) => {
          const value = which === 'start' ? range.start : range.end;
          return (
            <div
              key={which}
              {...dragProps(which)}
              {...keyProps(which, value)}
              style={{ left: `${pct(value)}%` }}
              className={clsx(
                'absolute inset-y-0 -ml-[7px] flex w-[14px] cursor-ew-resize touch-none items-center justify-center',
                'outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
              )}
            >
              <span className="h-full w-[3px] rounded-full bg-accent" />
              <span className="absolute h-6 w-[14px] rounded-[4px] border border-accent bg-panel shadow-[0_1px_3px_rgba(0,0,0,0.18)]" />
              <span className="absolute h-2.5 w-[1px] bg-accent" />
            </div>
          );
        })}

        {/* Playhead */}
        <div
          {...dragProps('scrub')}
          {...keyProps('scrub', scrub)}
          style={{ left: `${pct(scrub)}%` }}
          className="absolute inset-y-0 -ml-[6px] w-[12px] cursor-col-resize touch-none outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
        >
          <span className="absolute inset-y-0 left-[5px] w-[2px] bg-ink" />
          <span className="absolute -top-[3px] left-[1px] h-2.5 w-2.5 rotate-45 rounded-[2px] bg-ink" />
        </div>
      </div>

      <div className="relative mt-1 h-4">
        {ticks.map((t) => (
          <span
            key={t}
            className={clsx(
              'absolute top-0 text-[10.5px] tabular-nums text-ink-faint',
              t === 0 ? 'left-0' : t === 1 ? 'right-0' : '-translate-x-1/2',
            )}
            style={t === 0 || t === 1 ? undefined : { left: `${t * 100}%` }}
          >
            {formatTimecode(duration * t)}
          </span>
        ))}
      </div>

      <p className="mt-1 text-[11.5px] text-ink-faint">
        Drag the blue handles to set the clip, the dark playhead to look around. Arrow keys nudge by 0.1 s, ⇧ by a second —
        the shortest clip is {MIN_CLIP.toFixed(2)} s.
      </p>
    </div>
  );
}
