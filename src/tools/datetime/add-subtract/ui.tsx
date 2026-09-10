import { useMemo, useState } from 'react';
import { OptionsGrid, ToolShell } from '@/components/tool';
import {
  Alert,
  Badge,
  Button,
  CopyButton,
  Field,
  Icon,
  Input,
  NumberInput,
  Section,
  Segmented,
  Textarea,
} from '@/components/ui';
import {
  EMPTY_DELTA,
  WORKING_WEEK_DAYS,
  type DeltaParts,
  describeDelta,
  fromLocalInput,
  isEmptyDelta,
  offsetLabel,
  parseHolidayList,
  shiftDate,
  shiftDateBusiness,
  toIsoWithOffset,
  toLocalInput,
  wasClamped,
} from './logic';

type DayMode = 'calendar' | 'business';

const LONG = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const UTC_LONG = new Intl.DateTimeFormat(undefined, {
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

const FIELDS: Array<{
  key: keyof DeltaParts;
  label: string;
  businessLabel?: string;
  businessHint?: string;
}> = [
  { key: 'years', label: 'Years' },
  { key: 'months', label: 'Months' },
  { key: 'weeks', label: 'Weeks', businessHint: `${WORKING_WEEK_DAYS} working days each` },
  { key: 'days', label: 'Days', businessLabel: 'Business days' },
  { key: 'hours', label: 'Hours' },
  { key: 'minutes', label: 'Minutes' },
  { key: 'seconds', label: 'Seconds' },
];

const PRESETS: Array<{ label: string; delta: Partial<DeltaParts>; sign: 1 | -1 }> = [
  { label: '+1 week', delta: { weeks: 1 }, sign: 1 },
  { label: '+30 days', delta: { days: 30 }, sign: 1 },
  { label: '+90 days', delta: { days: 90 }, sign: 1 },
  { label: '+6 months', delta: { months: 6 }, sign: 1 },
  { label: '+1 year', delta: { years: 1 }, sign: 1 },
  { label: '−1 week', delta: { weeks: 1 }, sign: -1 },
  { label: '−1 month', delta: { months: 1 }, sign: -1 },
  { label: '−1 year', delta: { years: 1 }, sign: -1 },
];

function relativeToNow(target: Date): string {
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const diff = target.getTime() - Date.now();
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000_000],
    ['month', 2_592_000_000],
    ['week', 604_800_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
    ['second', 1000],
  ];
  for (const [unit, ms] of units) {
    if (Math.abs(diff) >= ms || unit === 'second') return rtf.format(Math.round(diff / ms), unit);
  }
  return '';
}

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 1);
  return Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - start.getTime()) / 86_400_000) + 1;
}

function ResultRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-b-0">
      <span className="w-[92px] shrink-0 text-[12.5px] text-ink-soft">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink selectable">{value}</span>
      {hint && <span className="shrink-0 text-[11.5px] text-ink-faint">{hint}</span>}
      <CopyButton value={value} size="sm" variant="ghost" label="" />
    </div>
  );
}

export default function AddSubtractTime() {
  const [startText, setStartText] = useState(() => toLocalInput(new Date()));
  const [sign, setSign] = useState<1 | -1>(1);
  const [delta, setDelta] = useState<DeltaParts>(EMPTY_DELTA);
  const [dayMode, setDayMode] = useState<DayMode>('calendar');
  const [holidayText, setHolidayText] = useState('');

  const businessMode = dayMode === 'business';
  const start = useMemo(() => fromLocalInput(startText), [startText]);
  const holidays = useMemo(() => parseHolidayList(holidayText), [holidayText]);
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  const { result, error } = useMemo(() => {
    if (!start) return { result: null as Date | null, error: null as string | null };
    try {
      const value = businessMode
        ? shiftDateBusiness(start, delta, sign, holidays.dates)
        : shiftDate(start, delta, sign);
      if (Number.isNaN(value.getTime())) {
        return { result: null, error: 'That lands outside the range of dates this app can represent.' };
      }
      return { result: value, error: null };
    } catch (err) {
      return { result: null, error: err instanceof Error ? err.message : String(err) };
    }
  }, [start, delta, sign, businessMode, holidays.dates]);

  const setField = (key: keyof DeltaParts, value: number) =>
    setDelta((current) => ({ ...current, [key]: Math.trunc(value) }));

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    setSign(preset.sign);
    setDelta({ ...EMPTY_DELTA, ...preset.delta });
  };

  const untouched = isEmptyDelta(delta);
  const clamped = start && result ? wasClamped(start, result, delta) : false;

  const summary = () => {
    if (!start || !result) return '';
    return [
      `Start   ${LONG.format(start)}`,
      `Change  ${describeDelta(delta, sign, businessMode)}`,
      `Result  ${LONG.format(result)}`,
      `UTC     ${UTC_LONG.format(result)}`,
      `ISO     ${toIsoWithOffset(result)}`,
    ].join('\n');
  };

  return (
    <ToolShell
      main={
        <>
          <Section title="Start from" description={`Local time · ${timeZone}`}>
            <Field label="Date and time" hint={start ? LONG.format(start) : undefined} error={start ? undefined : 'Pick a valid date and time'}>
              <div className="flex items-center gap-1.5">
                <Input
                  type="datetime-local"
                  step={1}
                  value={startText}
                  onChange={(e) => setStartText(e.target.value)}
                  className="font-mono"
                />
                <Button size="sm" variant="secondary" onClick={() => setStartText(toLocalInput(new Date()))}>
                  Now
                </Button>
              </div>
            </Field>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[
                { label: 'Now', date: () => new Date() },
                { label: 'Start of today', date: () => new Date(new Date().setHours(0, 0, 0, 0)) },
                {
                  label: 'Start of this month',
                  date: () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
                },
                { label: 'Start of this year', date: () => new Date(new Date().getFullYear(), 0, 1) },
              ].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => setStartText(toLocalInput(option.date()))}
                  className="rounded-lg border border-line bg-panel px-2.5 py-1 text-[12px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </Section>

          <Section
            title="Amount"
            description="Negative values are allowed in any field"
            actions={
              <>
                <Segmented
                  size="sm"
                  value={sign === 1 ? 'add' : 'subtract'}
                  onChange={(value) => setSign(value === 'add' ? 1 : -1)}
                  options={[
                    { value: 'add', label: 'Add' },
                    { value: 'subtract', label: 'Subtract' },
                  ]}
                />
                <Button size="sm" variant="ghost" icon="X" disabled={untouched} onClick={() => setDelta(EMPTY_DELTA)}>
                  Clear
                </Button>
              </>
            }
          >
            <OptionsGrid cols={3}>
              {FIELDS.map((field) => (
                <Field
                  key={field.key}
                  label={businessMode && field.businessLabel ? field.businessLabel : field.label}
                  hint={businessMode ? field.businessHint : undefined}
                >
                  <NumberInput
                    value={delta[field.key]}
                    onValueChange={(value) => setField(field.key, value)}
                    step={1}
                  />
                </Field>
              ))}
            </OptionsGrid>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="rounded-lg border border-line bg-panel px-2.5 py-1 text-[12px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </Section>

          {error && (
            <Alert tone="danger" title="That did not work">
              {error}
            </Alert>
          )}

          {!start ? (
            <Alert tone="warn" title="A start date is needed">
              Fill in a date and a time above to see the result.
            </Alert>
          ) : (
            result && (
              <Section
                title="Result"
                description={
                  untouched ? 'Enter an amount above to move this date' : describeDelta(delta, sign, businessMode)
                }
                actions={<CopyButton value={summary} label="Copy summary" size="sm" variant="ghost" />}
              >
                <p className="text-[17px] font-semibold leading-snug text-ink selectable">{LONG.format(result)}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge tone="accent">{relativeToNow(result)}</Badge>
                  <Badge>Day {dayOfYear(result)} of the year</Badge>
                  {untouched && <Badge tone="warn">Nothing added yet</Badge>}
                  {clamped && <Badge tone="warn">Clamped to the end of the month</Badge>}
                </div>

                <div className="mt-3 overflow-hidden rounded-lg border border-line">
                  <ResultRow label="Local" value={LONG.format(result)} hint={`UTC${offsetLabel(result)}`} />
                  <ResultRow label="UTC" value={UTC_LONG.format(result)} hint="Z" />
                  <ResultRow label="ISO 8601" value={toIsoWithOffset(result)} />
                  <ResultRow label="ISO in UTC" value={result.toISOString()} />
                  <ResultRow label="Unix seconds" value={String(Math.floor(result.getTime() / 1000))} />
                </div>

                {clamped && (
                  <Alert tone="info" className="mt-3" title="The day of the month moved">
                    The starting day does not exist in the target month, so it was pulled back to the last day that
                    does — 31 January plus one month is 28 or 29 February, never 2 or 3 March.
                  </Alert>
                )}
              </Section>
            )
          )}
        </>
      }
      aside={
        <>
          <Section title="Day counting">
            <Segmented
              className="w-full"
              value={dayMode}
              onChange={setDayMode}
              options={[
                { value: 'calendar', label: 'Calendar days' },
                { value: 'business', label: 'Business days' },
              ]}
            />
            <p className="mt-2 text-[11.5px] leading-[1.6] text-ink-faint">
              {businessMode
                ? `The week and day amounts are counted in working days — a week is ${WORKING_WEEK_DAYS} of them — and Saturdays, Sundays and any listed holiday are stepped over. Years and months still move by the calendar.`
                : 'Every unit moves by the calendar. Switch to business days to skip weekends and holidays.'}
            </p>
          </Section>

          {businessMode && (
            <Section
              title="Holidays"
              description="Skipped along with weekends"
              actions={
                holidayText ? (
                  <Button size="sm" variant="ghost" icon="X" onClick={() => setHolidayText('')}>
                    Clear
                  </Button>
                ) : undefined
              }
            >
              <Textarea
                value={holidayText}
                onChange={(e) => setHolidayText(e.target.value)}
                rows={5}
                placeholder={'2026-01-01 New Year\n2026-12-25 Christmas'}
              />
              <p className="mt-2 text-[11.5px] leading-[1.6] text-ink-faint">
                One date per line, year first. Anything after the date is treated as its name.
              </p>
              {holidays.dates.length > 0 && (
                <p className="mt-2 text-[11.5px] text-success">
                  {holidays.dates.length} date{holidays.dates.length === 1 ? '' : 's'} read
                </p>
              )}
              {holidays.invalid.length > 0 && (
                <Alert tone="danger" className="mt-2" title="Some lines were not dates">
                  {holidays.invalid.slice(0, 4).join(', ')}
                  {holidays.invalid.length > 4 ? ` and ${holidays.invalid.length - 4} more` : ''}
                </Alert>
              )}
            </Section>
          )}

          <Section title="Month ends">
            <p className="flex items-start gap-1.5 text-[12px] leading-[1.65] text-ink-soft">
              <Icon name="Info" size={13} className="mt-[2px] shrink-0" />
              Years and months are applied first and clamp to the last day of the target month. 31 January plus one
              month is 28 February (29 in a leap year), and 29 February plus one year is 28 February. Days, hours,
              minutes and seconds are applied afterwards, in that order.
            </p>
          </Section>
        </>
      }
    />
  );
}
