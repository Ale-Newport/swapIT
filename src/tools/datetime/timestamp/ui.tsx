import { useEffect, useMemo, useState } from 'react';
import { ToolShell } from '@/components/tool';
import {
  Alert,
  Badge,
  Button,
  CopyButton,
  Field,
  Icon,
  Input,
  Section,
  Segmented,
} from '@/components/ui';
import {
  INT32_MAX_SECONDS,
  type TsUnit,
  UNITS,
  dayOfYear,
  detectUnit,
  epochNotes,
  fromLocalInput,
  isRepresentable,
  isoWeek,
  msToUnit,
  offsetLabel,
  parseTimestampInput,
  relativePhrase,
  toIsoWithOffset,
  toLocalInput,
  toRfc2822,
  unitLabel,
  unitShort,
  unitToMs,
} from './logic';

type UnitMode = 'auto' | TsUnit;

const LOCAL = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const UTC = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

const CLOCK = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-b-0">
      <span className="w-[92px] shrink-0 text-[12.5px] text-ink-soft">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink selectable">{value}</span>
      {hint && <span className="hidden shrink-0 text-[11.5px] text-ink-faint sm:inline">{hint}</span>}
      <CopyButton value={value} size="sm" variant="ghost" label="" />
    </div>
  );
}

export default function UnixTimestamp() {
  const [instantMs, setInstantMs] = useState(() => Math.floor(Date.now() / 1000) * 1000);
  const [tsText, setTsText] = useState(() => String(Math.floor(Date.now() / 1000)));
  const [unitMode, setUnitMode] = useState<UnitMode>('auto');
  const [tsError, setTsError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [paused]);

  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const parsedValue = parseTimestampInput(tsText);
  const resolvedUnit: TsUnit =
    unitMode === 'auto' ? (parsedValue === null ? 's' : detectUnit(parsedValue)) : unitMode;

  const pushTimestamp = (text: string) => {
    setTsText(text);
    const value = parseTimestampInput(text);
    if (value === null) {
      setTsError(text.trim() ? 'A timestamp is a whole number, optionally negative for dates before 1970.' : null);
      return;
    }
    const unit = unitMode === 'auto' ? detectUnit(value) : unitMode;
    const ms = unitToMs(value, unit);
    if (!isRepresentable(ms)) {
      setTsError('That is outside the range of dates this app can represent (roughly ±273,000 years).');
      return;
    }
    setTsError(null);
    setInstantMs(ms);
  };

  const pushInstant = (ms: number) => {
    if (!isRepresentable(ms)) return;
    const unit = unitMode === 'auto' ? 's' : unitMode;
    // Snap to the precision the timestamp field is showing, so the number and
    // the ISO string below it never disagree about the sub-second part.
    const snapped = unit === 's' ? Math.floor(ms / 1000) * 1000 : Math.round(ms);
    setInstantMs(snapped);
    setTsText(String(msToUnit(snapped, unit)));
    setTsError(null);
  };

  const changeUnit = (next: UnitMode) => {
    setUnitMode(next);
    setTsText(String(msToUnit(instantMs, next === 'auto' ? 's' : next)));
    setTsError(null);
  };

  const date = new Date(instantMs);
  const valid = isRepresentable(instantMs);
  const seconds = Math.floor(instantMs / 1000);
  const notes = valid ? epochNotes(seconds) : [];
  const week = valid ? isoWeek(date) : { year: 0, week: 0 };

  const nowSeconds = Math.floor(nowMs / 1000);
  const nowDate = new Date(nowMs);

  const summary = () =>
    valid
      ? [
          `Timestamp  ${msToUnit(instantMs, 's')} s`,
          `Local      ${LOCAL.format(date)}`,
          `UTC        ${UTC.format(date)}`,
          `ISO 8601   ${toIsoWithOffset(date)}`,
          `RFC 2822   ${toRfc2822(date)}`,
          `Relative   ${relativePhrase(instantMs, nowMs)}`,
        ].join('\n')
      : '';

  return (
    <ToolShell
      main={
        <>
          <Section
            title="Current timestamp"
            description={paused ? 'Paused — the numbers below are frozen' : 'Ticking every second'}
            actions={
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={paused ? 'Play' : 'Pause'}
                  onClick={() => {
                    if (paused) setNowMs(Date.now());
                    setPaused(!paused);
                  }}
                >
                  {paused ? 'Resume' : 'Pause'}
                </Button>
                <Button size="sm" variant="secondary" icon="ArrowDown" onClick={() => pushInstant(nowMs)}>
                  Use it
                </Button>
              </>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-line bg-canvas px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] uppercase tracking-wide text-ink-faint">Seconds</p>
                  <CopyButton value={String(nowSeconds)} size="sm" variant="ghost" label="" />
                </div>
                <p className="font-mono text-[19px] font-semibold tabular-nums text-ink selectable">{nowSeconds}</p>
              </div>
              <div className="rounded-lg border border-line bg-canvas px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] uppercase tracking-wide text-ink-faint">Milliseconds</p>
                  <CopyButton value={String(nowMs)} size="sm" variant="ghost" label="" />
                </div>
                <p className="font-mono text-[19px] font-semibold tabular-nums text-ink selectable">{nowMs}</p>
              </div>
            </div>
            <p className="mt-2 text-[11.5px] text-ink-faint">
              {CLOCK.format(nowDate)} · {timeZone} · UTC{offsetLabel(nowDate).replace(/(\d{2})(\d{2})/, '$1:$2')}
            </p>
          </Section>

          <Section
            title="Convert"
            description="Type in either field — the other follows"
            actions={<CopyButton value={summary} label="Copy summary" size="sm" variant="ghost" disabled={!valid} />}
          >
            <div className="space-y-3">
              <Field
                label="Timestamp"
                error={tsError ?? undefined}
                hint={
                  unitMode === 'auto'
                    ? `Read as ${unitLabel(resolvedUnit).toLowerCase()} from its size`
                    : `Read as ${unitLabel(resolvedUnit).toLowerCase()}`
                }
              >
                <div className="flex items-center gap-1.5">
                  <Input
                    value={tsText}
                    inputMode="numeric"
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="1700000000"
                    onChange={(e) => pushTimestamp(e.target.value)}
                    className="font-mono text-[14px]"
                  />
                  <Button size="sm" variant="secondary" onClick={() => pushInstant(Date.now())}>
                    Now
                  </Button>
                </div>
              </Field>

              <Field label="Unit">
                <Segmented
                  className="w-full"
                  value={unitMode}
                  onChange={changeUnit}
                  options={[
                    { value: 'auto' as UnitMode, label: 'Auto' },
                    ...UNITS.map((unit) => ({ value: unit.id as UnitMode, label: unit.short, title: unit.label })),
                  ]}
                />
              </Field>

              <Field label="Date and time" hint={`Local · ${timeZone} · whole seconds only`}>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="datetime-local"
                    step={1}
                    value={valid ? toLocalInput(date) : ''}
                    onChange={(e) => {
                      const parsed = fromLocalInput(e.target.value);
                      if (parsed) pushInstant(parsed.getTime());
                    }}
                    className="font-mono"
                  />
                  <CopyButton value={() => (valid ? toLocalInput(date) : '')} size="sm" variant="ghost" label="" />
                </div>
              </Field>
            </div>
          </Section>

          {valid && (
            <Section title="That instant, written every way">
              <p className="text-[17px] font-semibold leading-snug text-ink selectable">{LOCAL.format(date)}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge tone="accent">{relativePhrase(instantMs, nowMs)}</Badge>
                <Badge>Day {dayOfYear(date)} of {date.getFullYear()}</Badge>
                <Badge>
                  Week {week.week} of {week.year}
                </Badge>
              </div>
              <div className="mt-3 overflow-hidden rounded-lg border border-line">
                <Row label="Local" value={LOCAL.format(date)} hint={timeZone} />
                <Row label="UTC" value={UTC.format(date)} hint="Z" />
                <Row label="ISO 8601" value={toIsoWithOffset(date)} />
                <Row label="ISO in UTC" value={date.toISOString()} />
                <Row label="RFC 2822" value={toRfc2822(date)} hint="email headers" />
                <Row label="Relative" value={relativePhrase(instantMs, nowMs)} />
              </div>
            </Section>
          )}

          {notes.map((note) => (
            <Alert key={note.title} tone={note.tone} title={note.title}>
              {note.body}
            </Alert>
          ))}
        </>
      }
      aside={
        <>
          <Section title="In every unit">
            {valid ? (
              <div className="overflow-hidden rounded-lg border border-line">
                {UNITS.map((unit) => (
                  <div
                    key={unit.id}
                    className="flex items-center gap-2 border-b border-line px-3 py-2 last:border-b-0"
                  >
                    <span className="w-[26px] shrink-0 font-mono text-[11.5px] text-ink-faint">{unit.short}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] tabular-nums text-ink selectable">
                      {msToUnit(instantMs, unit.id)}
                    </span>
                    <CopyButton value={String(msToUnit(instantMs, unit.id))} size="sm" variant="ghost" label="" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12.5px] text-ink-faint">Enter a timestamp this app can represent.</p>
            )}
          </Section>

          <Section title="Try one">
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: 'Now', ms: () => Date.now() },
                { label: 'Start of today', ms: () => new Date().setHours(0, 0, 0, 0) },
                { label: 'Start of this year', ms: () => new Date(new Date().getFullYear(), 0, 1).getTime() },
                { label: 'Epoch (0)', ms: () => 0 },
                { label: 'One billion', ms: () => 1_000_000_000 * 1000 },
                { label: '2038 limit', ms: () => INT32_MAX_SECONDS * 1000 },
                { label: 'Apollo 11', ms: () => Date.UTC(1969, 6, 20, 20, 17, 40) },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => pushInstant(preset.ms())}
                  className="rounded-lg border border-line bg-panel px-2.5 py-1 text-[12px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </Section>

          <Section title="How the unit is guessed">
            <div className="space-y-1.5 text-[12px] text-ink-soft">
              {[
                ['under 1e11', 'seconds'],
                ['under 1e14', 'milliseconds'],
                ['under 1e17', 'microseconds'],
                ['above that', 'nanoseconds'],
              ].map(([range, unit]) => (
                <div key={range} className="flex items-baseline gap-2">
                  <span className="w-[74px] shrink-0 font-mono text-[12px] text-ink">{range}</span>
                  <span className="min-w-0 flex-1 text-[11.5px] text-ink-faint">{unit}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-[11.5px] leading-[1.6] text-ink-faint">
              <Icon name="Info" size={13} className="mt-[1px] shrink-0" />
              The size of a value is the only clue, so pick the unit yourself when a number is ambiguous — a small
              millisecond value looks exactly like a second value from 1970. Currently reading{' '}
              {unitShort(resolvedUnit)}.
            </p>
          </Section>
        </>
      }
    />
  );
}
