import clsx from 'clsx';
import { Fragment, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Button, Icon, IconButton, Switch } from '@/components/ui';
import { useSettings } from '@/core/settings';
import { actionsFor } from './catalog/samples';
import {
  LAYOUT_TYPES,
  RING_CAPACITY,
  arrange,
  listActions,
  placement,
  sanitizeLayouts,
  splitByState,
  toLayout,
  type LayoutKey,
  type Placement,
} from './layouts';
import type { RadialItem } from './model';
import { RingPreview } from './RingPreview';

/** What the three groups of the list are called, and what they mean. */
const ZONES: Record<Placement | 'off', { title: string; note: string }> = {
  ring: { title: 'On the ring', note: 'The first five you switch on — what you see the moment the ring opens.' },
  more: { title: 'Inside More ›', note: 'One petal further in. Never a page, never a scroll.' },
  typing: { title: 'Only by typing', note: `A ring holds ${RING_CAPACITY} actions. Switch something off to bring these in, or just type to reach them.` },
  off: { title: 'Switched off', note: 'Not on the ring. Typing on the ring still finds them.' },
};

/**
 * Choose what the ring offers for each kind of file: switch actions on or off, and drag them
 * into the order you want. Changes apply the next time the ring opens.
 */
export function LayoutEditor({ theme, accent, opacity }: { theme: 'light' | 'dark'; accent: string; opacity: number }) {
  const { settings, update } = useSettings();
  const [key, setKey] = useState<LayoutKey>('image');
  const layouts = useMemo(() => sanitizeLayouts(settings.radialLayouts), [settings.radialLayouts]);
  const kind = useMemo(() => actionsFor(key), [key]);
  const saved = layouts[key];
  const stored = useMemo(() => splitByState(listActions(kind.candidates, kind.shipped, saved)), [kind, saved]);

  // While a row is being dragged the list moves on screen only; it is saved when you let go.
  const [draft, setDraft] = useState<{ on: RadialItem[]; off: RadialItem[] } | null>(null);
  const { on, off } = draft ?? stored;
  const [dragging, setDragging] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLElement>());

  const commit = (nextOn: RadialItem[], nextOff: RadialItem[]) => {
    setDraft(null);
    void update({ radialLayouts: { ...layouts, [key]: toLayout(nextOn, nextOff) } });
  };

  const toggle = (item: RadialItem, nowOn: boolean) =>
    nowOn
      ? commit([...on, item], off.filter((i) => i.id !== item.id))
      : commit(on.filter((i) => i.id !== item.id), [item, ...off]);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= on.length || from === to) return;
    const next = [...on];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    commit(next, off);
  };

  const reset = () => {
    const rest = { ...layouts };
    delete rest[key];
    void update({ radialLayouts: rest });
  };

  // ---- dragging by the grip. Pointer events on the window, not HTML5 drag and drop (which the
  // webview's own file-drop handling gets in the way of) and not pointer capture (which a row
  // loses when React moves it).
  const startDrag = (e: ReactPointerEvent<HTMLElement>, item: RadialItem) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const state = { on: [...on], off, moved: false };
    setDragging(item.id);

    const onMove = (ev: PointerEvent) => {
      // The dragged row belongs before the first row whose middle is below the pointer.
      let target = state.on.length - 1;
      for (let i = 0; i < state.on.length; i++) {
        const box = rows.current.get(state.on[i].id)?.getBoundingClientRect();
        if (box && ev.clientY < box.top + box.height / 2) {
          target = i;
          break;
        }
      }
      const from = state.on.findIndex((i) => i.id === item.id);
      if (from === target) return;
      const next = [...state.on];
      const [moved] = next.splice(from, 1);
      next.splice(target, 0, moved);
      state.on = next;
      state.moved = true;
      setDraft({ on: next, off: state.off });
      requestAnimationFrame(() => rows.current.get(item.id)?.scrollIntoView({ block: 'nearest' }));
    };
    const finish = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      setDragging(null);
      if (state.moved) commit(state.on, state.off);
      else setDraft(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

  const ring = on.length > 0 ? arrange(on) : kind.standard;
  const customised = Boolean(saved);
  const trimmed = !customised && kind.shipped.size > RING_CAPACITY;

  const row = (item: RadialItem, index: number, state: 'on' | 'off') => (
    <li
      key={item.id}
      ref={(el) => {
        if (el) rows.current.set(item.id, el);
        else rows.current.delete(item.id);
      }}
      data-dragging={dragging === item.id}
      className={clsx(
        'flex items-center gap-2.5 border-b border-line px-2.5 py-1.5 last:border-b-0',
        dragging === item.id && 'relative z-10 bg-accent-soft shadow-md',
        state === 'off' && 'opacity-60',
      )}
    >
      {state === 'on' ? (
        <span
          role="button"
          tabIndex={-1}
          aria-label={`Drag ${item.title} to reorder`}
          title="Drag to reorder"
          onPointerDown={(e) => startDrag(e, item)}
          className="flex h-7 w-5 shrink-0 cursor-grab touch-none items-center justify-center text-ink-faint hover:text-ink active:cursor-grabbing"
        >
          <Icon name="GripVertical" size={14} />
        </span>
      ) : (
        <span className="w-5 shrink-0" />
      )}
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-canvas text-[10px] font-semibold text-ink-soft">
        {item.glyph ? item.glyph.slice(0, 4) : <Icon name={item.icon} size={14} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] text-ink">{item.title}</p>
        {item.hint && <p className="truncate text-[11px] text-ink-faint">{item.hint}</p>}
      </div>
      {state === 'on' && (
        <div className="flex shrink-0 items-center">
          <IconButton icon="ChevronUp" label="Move up" size="sm" disabled={index === 0} onClick={() => move(index, index - 1)} />
          <IconButton icon="ChevronDown" label="Move down" size="sm" disabled={index === on.length - 1} onClick={() => move(index, index + 1)} />
        </div>
      )}
      <span className="shrink-0">
        <Switch checked={state === 'on'} onCheckedChange={(v) => toggle(item, v)} label={`${item.title} on or off`} />
      </span>
    </li>
  );

  const zoneOf = (index: number): Placement => placement(index, on.length);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Kind of file">
        {LAYOUT_TYPES.map((t) => (
          <button
            key={t.key}
            type="button"
            role="radio"
            aria-checked={key === t.key}
            title={t.hint}
            onClick={() => {
              setDraft(null);
              setKey(t.key);
            }}
            className={clsx(
              'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] transition-colors',
              key === t.key ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-panel text-ink-soft hover:border-line-strong hover:text-ink',
            )}
          >
            <Icon name={t.icon} size={13} />
            {t.label}
            {layouts[t.key] && <span className="h-1.5 w-1.5 rounded-full bg-accent" title="Customised" />}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_288px] items-start gap-4">
        <div className="min-w-0 space-y-2">
          {trimmed && (
            <p className="rounded-lg bg-canvas px-3 py-2 text-[11.5px] leading-[1.5] text-ink-faint">
              This is the standard ring. Change anything and it becomes yours — it holds {RING_CAPACITY} actions, so the ones
              used least start switched off (typing still finds them).
            </p>
          )}

          {on.length === 0 && (
            <p className="rounded-lg bg-canvas px-3 py-2 text-[11.5px] leading-[1.5] text-ink-faint">
              Everything is switched off, so the standard ring is used. Switch something on to make it yours.
            </p>
          )}

          <ul className="overflow-hidden rounded-lg border border-line bg-panel">
            {on.map((item, index) => {
              const zone = zoneOf(index);
              const first = index === 0 || zoneOf(index - 1) !== zone;
              return (
                <Fragment key={item.id}>
                  {first && <ZoneHeader zone={zone} />}
                  {row(item, index, 'on')}
                </Fragment>
              );
            })}
            {off.length > 0 && (
              <>
                <ZoneHeader zone="off" />
                {off.map((item, index) => row(item, index, 'off'))}
              </>
            )}
          </ul>

          <div className="flex items-center justify-between gap-3">
            <p className="text-[11.5px] text-ink-faint">
              {on.length} on · {off.length} off. Changes apply the next time the ring opens.
            </p>
            <Button size="sm" variant="ghost" icon="RotateCcw" disabled={!customised} onClick={reset}>
              Back to the standard ring
            </Button>
          </div>
        </div>

        <div className="sticky top-3 space-y-1.5">
          <div className="overflow-hidden rounded-card border border-line">
            <RingPreview theme={theme} accent={accent} opacity={opacity} scale={0.68} items={ring} rounded={false} />
          </div>
          <p className="px-1 text-center text-[11px] text-ink-faint">What the ring shows first for {LAYOUT_TYPES.find((t) => t.key === key)?.label.toLowerCase()}</p>
        </div>
      </div>
    </div>
  );
}

function ZoneHeader({ zone }: { zone: Placement | 'off' }) {
  const info = ZONES[zone];
  return (
    <li className="border-b border-line bg-canvas px-3 py-1.5" aria-hidden="true">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-soft">{info.title}</p>
      <p className="text-[11px] leading-[1.45] text-ink-faint">{info.note}</p>
    </li>
  );
}
