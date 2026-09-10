import { useCallback, useEffect, useState } from 'react';
import { OptionsGrid, PresetRow, ToolShell } from '@/components/tool';
import {
  Button,
  CopyButton,
  Field,
  Icon,
  IconButton,
  NumberInput,
  Section,
  Select,
  Slider,
} from '@/components/ui';
import {
  CONSTRAINTS,
  formatHsl,
  formatRgb,
  makeColor,
  readableInk,
  type ColorSpec,
  type Constraint,
  type HueRange,
} from './logic';

interface Slot {
  id: string;
  color: ColorSpec;
  locked: boolean;
}

const MAX_COLORS = 60;

const HUE_BAR = Array.from({ length: 13 }, (_, i) => `hsl(${i * 30}, 85%, 55%)`).join(', ');

export default function RandomColor() {
  const [constraint, setConstraint] = useState<Constraint>('any');
  const [hueRange, setHueRange] = useState<HueRange>({ from: 180, to: 260 });
  const [count, setCount] = useState(10);
  const [slots, setSlots] = useState<Slot[]>([]);

  // A typed count is not bounded by the input's `max`, so clamp it here.
  const safeCount = Math.max(1, Math.min(MAX_COLORS, Math.round(count) || 1));

  const newSlot = useCallback(
    (): Slot => ({ id: crypto.randomUUID(), color: makeColor(constraint, hueRange), locked: false }),
    [constraint, hueRange],
  );

  // Growing or shrinking the grid must not disturb the swatches already there.
  useEffect(() => {
    setSlots((current) => {
      if (current.length === safeCount) return current;
      if (current.length > safeCount) return current.slice(0, safeCount);
      return [...current, ...Array.from({ length: safeCount - current.length }, newSlot)];
    });
  }, [safeCount, newSlot]);

  const regenerate = useCallback(() => {
    setSlots((current) => {
      if (current.every((slot) => slot.locked)) return current;
      return current.map((slot) =>
        slot.locked ? slot : { ...slot, color: makeColor(constraint, hueRange) },
      );
    });
  }, [constraint, hueRange]);

  // A new constraint or hue range applies to the swatches on screen straight
  // away; locked ones are still kept, exactly as they are on a shuffle.
  useEffect(() => {
    regenerate();
  }, [regenerate]);

  const toggleLock = (id: string) =>
    setSlots((current) => current.map((s) => (s.id === id ? { ...s, locked: !s.locked } : s)));

  const lockedCount = slots.filter((s) => s.locked).length;
  const blurb = CONSTRAINTS.find((c) => c.value === constraint)?.blurb ?? '';

  return (
    <ToolShell
      main={
        <Section
          title={`${slots.length} colour${slots.length === 1 ? '' : 's'}`}
          description={
            lockedCount > 0
              ? `${blurb} · ${lockedCount} locked and kept on the next shuffle`
              : blurb
          }
          actions={
            <>
              <CopyButton value={() => slots.map((s) => s.color.hex).join('\n')} label="Copy hex list" />
              <Button size="sm" variant="ghost" icon="Shuffle" onClick={regenerate}>
                Shuffle
              </Button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {slots.map((slot) => (
              <SwatchCard key={slot.id} slot={slot} onToggleLock={() => toggleLock(slot.id)} />
            ))}
          </div>
        </Section>
      }
      aside={
        <>
          <Section title="Constraint">
            <div className="space-y-3">
              <Select
                value={constraint}
                onChange={(e) => setConstraint(e.target.value as Constraint)}
                options={CONSTRAINTS.map((c) => ({ value: c.value, label: c.label }))}
              />
              {constraint === 'hue' && (
                <div className="space-y-3">
                  <div className="relative h-6 overflow-hidden rounded-lg border border-line">
                    <div className="absolute inset-0" style={{ background: `linear-gradient(to right, ${HUE_BAR})` }} />
                    <span
                      className="absolute top-0 h-full w-[2px] bg-black/70"
                      style={{ left: `${(hueRange.from / 360) * 100}%` }}
                    />
                    <span
                      className="absolute top-0 h-full w-[2px] bg-black/70"
                      style={{ left: `${(hueRange.to / 360) * 100}%` }}
                    />
                  </div>
                  <Field label={`From ${Math.round(hueRange.from)}°`}>
                    <Slider
                      min={0}
                      max={360}
                      value={hueRange.from}
                      onChange={(from) => setHueRange((r) => ({ ...r, from }))}
                    />
                  </Field>
                  <Field
                    label={`To ${Math.round(hueRange.to)}°`}
                    hint={
                      hueRange.to < hueRange.from
                        ? 'The range wraps past red at 0°.'
                        : 'Clockwise around the wheel.'
                    }
                  >
                    <Slider
                      min={0}
                      max={360}
                      value={hueRange.to}
                      onChange={(to) => setHueRange((r) => ({ ...r, to }))}
                    />
                  </Field>
                </div>
              )}
            </div>
          </Section>

          <Section title="How many">
            <OptionsGrid cols={1}>
              <PresetRow
                presets={[5, 10, 20, 30].map((c) => ({ label: String(c), value: c }))}
                active={count}
                onSelect={setCount}
              />
              <Field
                label="Count"
                hint={count > MAX_COLORS ? `Capped at ${MAX_COLORS}.` : `Up to ${MAX_COLORS}.`}
              >
                <NumberInput value={count} min={1} max={MAX_COLORS} onValueChange={setCount} />
              </Field>
            </OptionsGrid>
          </Section>

          <Button variant="primary" size="lg" icon="Shuffle" full onClick={regenerate}>
            Shuffle unlocked
          </Button>
        </>
      }
    />
  );
}

function SwatchCard({ slot, onToggleLock }: { slot: Slot; onToggleLock: () => void }) {
  const ink = readableInk(slot.color.rgb);
  return (
    <div className="overflow-hidden rounded-card border border-line bg-panel">
      <div className="relative h-24" style={{ background: slot.color.hex }}>
        <button
          type="button"
          onClick={onToggleLock}
          aria-label={slot.locked ? 'Unlock this colour' : 'Lock this colour'}
          title={slot.locked ? 'Locked — kept when you shuffle' : 'Lock so shuffling keeps it'}
          className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ color: ink, background: slot.locked ? 'rgba(255,255,255,0.22)' : 'transparent' }}
        >
          <Icon name={slot.locked ? 'Lock' : 'Unlock'} size={14} />
        </button>
        <span className="absolute bottom-2 left-2.5 font-mono text-[13px] font-medium" style={{ color: ink }}>
          {slot.color.hex}
        </span>
      </div>
      <div className="divide-y divide-line">
        <ValueRow value={slot.color.hex} />
        <ValueRow value={formatRgb(slot.color.rgb)} />
        <ValueRow value={formatHsl(slot.color.hsl)} />
      </div>
    </div>
  );
}

function ValueRow({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <div className="flex items-center gap-1 px-2 py-1.5">
      <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink-soft selectable">{value}</span>
      <IconButton
        icon={copied ? 'Check' : 'Copy'}
        label={`Copy ${value}`}
        size="sm"
        className="shrink-0"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
          } catch {
            /* clipboard blocked — nothing useful to do */
          }
        }}
      />
    </div>
  );
}
