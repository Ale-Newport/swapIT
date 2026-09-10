import { useMemo, useState } from 'react';
import { ToolShell } from '@/components/tool';
import {
  Alert,
  Badge,
  CopyButton,
  Field,
  Icon,
  Input,
  NumberInput,
  Section,
  Segmented,
  Select,
  Stat,
} from '@/components/ui';
import {
  type DurationUnit,
  UNIT_LABELS,
  breakdown,
  equivalents,
  formatClock,
  formatCompact,
  formatLong,
  parseHumanDuration,
  toIsoDuration,
  toSeconds,
} from './logic';

type Mode = 'number' | 'text';

const UNIT_OPTIONS = (Object.keys(UNIT_LABELS) as DurationUnit[]).map((unit) => ({
  value: unit,
  label: UNIT_LABELS[unit],
}));

const NUMBER_PRESETS: Array<{ label: string; value: number; unit: DurationUnit }> = [
  { label: '90 s', value: 90, unit: 's' },
  { label: '5400 s', value: 5400, unit: 's' },
  { label: '86 400 s', value: 86_400, unit: 's' },
  { label: '925 974 s', value: 925_974, unit: 's' },
  { label: '1500 ms', value: 1500, unit: 'ms' },
  { label: '48 h', value: 48, unit: 'h' },
];

const TEXT_PRESETS = ['2h 30m', '01:30:00', '1d 4h', '500ms', '3 weeks', '25:01:01'];

function OutputRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-b-0">
      <span className="w-[104px] shrink-0 text-[12.5px] text-ink-soft">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink selectable">{value}</span>
      {hint && <span className="hidden shrink-0 text-[11.5px] text-ink-faint sm:inline">{hint}</span>}
      <CopyButton value={value} size="sm" variant="ghost" label="" />
    </div>
  );
}

export default function HumanReadableDuration() {
  const [mode, setMode] = useState<Mode>('number');
  const [amount, setAmount] = useState(925_974);
  const [unit, setUnit] = useState<DurationUnit>('s');
  const [text, setText] = useState('2h 30m');

  const fromText = useMemo(() => {
    if (mode !== 'text') return { seconds: null as number | null, error: null as string | null };
    try {
      return { seconds: parseHumanDuration(text), error: null as string | null };
    } catch (err) {
      return { seconds: null, error: err instanceof Error ? err.message : String(err) };
    }
  }, [mode, text]);

  const seconds = mode === 'number' ? toSeconds(amount, unit) : fromText.seconds;
  const parts = seconds === null ? null : breakdown(seconds);
  const hasFraction = seconds !== null && !Number.isInteger(seconds);

  const summary = () =>
    seconds === null
      ? ''
      : [
          `Long     ${formatLong(seconds)}`,
          `Compact  ${formatCompact(seconds)}`,
          `Clock    ${formatClock(seconds, hasFraction)}`,
          `ISO 8601 ${toIsoDuration(seconds)}`,
          `Seconds  ${seconds}`,
        ].join('\n');

  return (
    <ToolShell
      main={
        <>
          <Section
            title="Duration"
            description={mode === 'number' ? 'A number and the unit it is in' : 'Written however you would say it'}
            actions={
              <Segmented
                size="sm"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'number' as Mode, label: 'Number → words' },
                  { value: 'text' as Mode, label: 'Words → number' },
                ]}
              />
            }
          >
            {mode === 'number' ? (
              <>
                <div className="flex items-end gap-2">
                  <Field label="Amount" className="flex-1">
                    <NumberInput value={amount} onValueChange={setAmount} step={1} className="font-mono text-[14px]" />
                  </Field>
                  <Field label="Unit" className="w-40">
                    <Select
                      value={unit}
                      onChange={(event) => setUnit(event.target.value as DurationUnit)}
                      options={UNIT_OPTIONS}
                    />
                  </Field>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {NUMBER_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setAmount(preset.value);
                        setUnit(preset.unit);
                      }}
                      className="rounded-lg border border-line bg-panel px-2.5 py-1 text-[12px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <Field
                  label="Written duration"
                  hint="2h 30m · 01:30:00 · 1 day 4 hours · 500ms · a plain number means seconds"
                  error={fromText.error ?? undefined}
                >
                  <Input
                    value={text}
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="2h 30m"
                    onChange={(event) => setText(event.target.value)}
                    className="font-mono text-[14px]"
                  />
                </Field>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {TEXT_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setText(preset)}
                      className="rounded-lg border border-line bg-panel px-2.5 py-1 font-mono text-[11.5px] text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </>
            )}
          </Section>

          {seconds === null ? (
            <Alert tone="warn" title="Nothing to convert yet">
              {fromText.error ?? 'Enter a duration above.'}
            </Alert>
          ) : (
            <>
              <Section
                title="In words"
                actions={<CopyButton value={summary} label="Copy all" size="sm" variant="ghost" />}
              >
                <p className="text-[17px] font-semibold leading-snug text-ink selectable">
                  {formatLong(seconds)}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge tone="accent">{formatCompact(seconds)}</Badge>
                  <Badge>{formatClock(seconds, hasFraction)}</Badge>
                  {seconds < 0 && <Badge tone="warn">Negative</Badge>}
                </div>

                <div className="mt-3 overflow-hidden rounded-lg border border-line">
                  <OutputRow label="Long form" value={formatLong(seconds)} />
                  <OutputRow label="Compact" value={formatCompact(seconds)} />
                  <OutputRow
                    label="Clock"
                    value={formatClock(seconds, hasFraction)}
                    hint={Math.abs(seconds) >= 86_400 ? 'hours keep counting past 24' : undefined}
                  />
                  <OutputRow label="ISO 8601" value={toIsoDuration(seconds)} hint="days and below" />
                  <OutputRow label="Seconds" value={String(seconds)} />
                </div>
              </Section>

              <Section title="Broken down">
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                  {parts &&
                    (
                      [
                        ['Years', parts.years],
                        ['Days', parts.days],
                        ['Hours', parts.hours],
                        ['Minutes', parts.minutes],
                        ['Seconds', parts.seconds],
                        ['Millis', parts.milliseconds],
                      ] as Array<[string, number]>
                    ).map(([label, value]) => (
                      <div key={label} className="rounded-lg border border-line bg-canvas px-2.5 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</p>
                        <p className="mt-0.5 text-[15px] font-semibold tabular-nums text-ink selectable">{value}</p>
                      </div>
                    ))}
                </div>
                <p className="mt-3 flex items-start gap-1.5 text-[11.5px] leading-[1.6] text-ink-faint">
                  <Icon name="Info" size={13} className="mt-[1px] shrink-0" />
                  A year here is a flat 365 days and a month is never used, because neither has a fixed length. For
                  calendar-accurate arithmetic use the Date Difference tool.
                </p>
              </Section>
            </>
          )}
        </>
      }
      aside={
        <>
          <Section title="The same duration in every unit">
            {seconds === null ? (
              <p className="text-[12.5px] text-ink-faint">Enter a duration to see the conversions.</p>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {equivalents(seconds).map((row) => (
                  <Stat key={row.label} label={row.label} value={row.value} />
                ))}
              </div>
            )}
          </Section>

          <Section title="What the reader accepts">
            <div className="space-y-1.5 text-[12px] text-ink-soft">
              {[
                ['2h 30m', 'compact units, spaces optional'],
                ['2 hours 30 minutes', 'full words, "and" is ignored'],
                ['01:30:00', 'clock form, hours may exceed 24'],
                ['1:30', 'minutes and seconds'],
                ['500ms', 'milliseconds'],
                ['5400', 'a plain number means seconds'],
                ['-2h 30m', 'a leading minus negates the whole thing'],
              ].map(([symbol, meaning]) => (
                <div key={symbol} className="flex items-baseline gap-2">
                  <span className="w-[92px] shrink-0 font-mono text-[11.5px] text-ink">{symbol}</span>
                  <span className="min-w-0 flex-1 text-[11.5px] text-ink-faint">{meaning}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11.5px] leading-[1.6] text-ink-faint">
              Units are ms, s, m, h, d, w and y — m means minutes, ms means milliseconds.
            </p>
          </Section>
        </>
      }
    />
  );
}
