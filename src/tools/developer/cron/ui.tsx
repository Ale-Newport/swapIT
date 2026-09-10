import { useEffect, useMemo, useState } from 'react';
import { ToolShell } from '@/components/tool';
import { Alert, Badge, Button, CopyButton, Field, Icon, Input, Section, Select } from '@/components/ui';
import {
  DAY_LABELS,
  MONTH_LABELS,
  SEARCH_YEARS,
  type ParsedCron,
  describeCron,
  fieldSummary,
  nextRuns,
  parseCron,
} from './logic';

const PRESETS: Array<{ label: string; expression: string }> = [
  { label: 'Every minute', expression: '* * * * *' },
  { label: 'Every 5 min', expression: '*/5 * * * *' },
  { label: 'Hourly', expression: '@hourly' },
  { label: 'Daily 02:30', expression: '30 2 * * *' },
  { label: 'Weekdays 09:00', expression: '0 9 * * 1-5' },
  { label: 'Weekly', expression: '@weekly' },
  { label: 'Monthly', expression: '@monthly' },
  { label: 'Yearly', expression: '@yearly' },
];

const MINUTE_OPTIONS = [
  { value: '*', label: 'Every minute' },
  { value: '*/5', label: 'Every 5 minutes' },
  { value: '*/10', label: 'Every 10 minutes' },
  { value: '*/15', label: 'Every 15 minutes' },
  { value: '*/30', label: 'Every 30 minutes' },
  ...Array.from({ length: 60 }, (_, i) => ({ value: String(i), label: `At minute ${i}` })),
];

const HOUR_OPTIONS = [
  { value: '*', label: 'Every hour' },
  { value: '*/2', label: 'Every 2 hours' },
  { value: '*/3', label: 'Every 3 hours' },
  { value: '*/6', label: 'Every 6 hours' },
  { value: '*/12', label: 'Every 12 hours' },
  { value: '9-17', label: 'Between 09 and 17' },
  ...Array.from({ length: 24 }, (_, i) => ({ value: String(i), label: `At ${String(i).padStart(2, '0')}:00` })),
];

const DOM_OPTIONS = [
  { value: '*', label: 'Every day of the month' },
  { value: '*/2', label: 'Every 2nd day' },
  { value: '1,15', label: 'On the 1st and 15th' },
  ...Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: `On day ${i + 1}` })),
];

const MONTH_OPTIONS = [
  { value: '*', label: 'Every month' },
  { value: '*/3', label: 'Every 3rd month' },
  ...MONTH_LABELS.map((label, i) => ({ value: String(i + 1), label: `In ${label}` })),
];

const DOW_OPTIONS = [
  { value: '*', label: 'Any day of the week' },
  { value: '1-5', label: 'Monday to Friday' },
  { value: '0,6', label: 'Weekends' },
  ...DAY_LABELS.map((label, i) => ({ value: String(i), label: `On ${label}` })),
];

const dateFormat = (withSeconds: boolean): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
    hour12: false,
  });

function relativeLabel(target: Date, now: Date): string {
  const diff = target.getTime() - now.getTime();
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000_000],
    ['month', 2_592_000_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
    ['second', 1000],
  ];
  for (const [unit, ms] of units) {
    if (Math.abs(diff) >= ms || unit === 'second') {
      return rtf.format(Math.round(diff / ms), unit);
    }
  }
  return '';
}

/** Adds the current value as its own option when the builder has no match for it. */
function withCustom(options: Array<{ value: string; label: string }>, value: string) {
  return options.some((o) => o.value === value) ? options : [{ value, label: `Custom: ${value}` }, ...options];
}

export default function CronHelper() {
  const [expression, setExpression] = useState('30 2 * * *');
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const { parsed, error } = useMemo(() => {
    try {
      return { parsed: parseCron(expression) as ParsedCron | null, error: null as string | null };
    } catch (err) {
      return { parsed: null, error: err instanceof Error ? err.message : String(err) };
    }
  }, [expression]);

  const runs = useMemo(() => (parsed ? nextRuns(parsed, now, 10) : []), [parsed, now]);
  const formatter = useMemo(() => dateFormat(parsed?.seconds != null), [parsed]);
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  const fields = parsed ? parsed.expression.split(' ') : ['*', '*', '*', '*', '*'];
  const hasSeconds = fields.length === 6;
  const base = hasSeconds ? fields.slice(1) : fields;
  const secondsPrefix = hasSeconds ? `${fields[0]} ` : '';

  const setPart = (index: number, value: string) => {
    const next = [...base];
    next[index] = value;
    setExpression(secondsPrefix + next.join(' '));
  };

  const rows: Array<{ label: string; field: NonNullable<ParsedCron['seconds']> | null }> = parsed
    ? [
        { label: 'Seconds', field: parsed.seconds },
        { label: 'Minute', field: parsed.minute },
        { label: 'Hour', field: parsed.hour },
        { label: 'Day of month', field: parsed.dayOfMonth },
        { label: 'Month', field: parsed.month },
        { label: 'Day of week', field: parsed.dayOfWeek },
      ]
    : [];

  return (
    <ToolShell
      main={
        <>
          <Section
            title="Cron expression"
            description="Five fields, or six when the first one is seconds"
            actions={<CopyButton value={() => expression} size="sm" variant="ghost" />}
          >
            <Input
              value={expression}
              spellCheck={false}
              autoComplete="off"
              placeholder="30 2 * * *"
              onChange={(e) => setExpression(e.target.value)}
              className="font-mono text-[14px]"
            />
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  title={p.expression}
                  onClick={() => setExpression(p.expression)}
                  className="rounded-lg border border-line bg-panel px-2.5 py-1 text-[12px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
                >
                  {p.label}
                </button>
              ))}
            </div>

            {error ? (
              <Alert tone="danger" className="mt-3" title="That expression will not run">
                {error}
              </Alert>
            ) : (
              parsed && (
                <div className="mt-3 rounded-lg border border-line bg-canvas px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-ink-faint">In plain English</p>
                  <p className="mt-0.5 text-[13.5px] font-medium text-ink selectable">{describeCron(parsed)}</p>
                  {parsed.shorthand && (
                    <p className="mt-1 text-[11.5px] text-ink-faint">
                      {parsed.shorthand} expands to <span className="font-mono">{parsed.expression}</span>
                    </p>
                  )}
                </div>
              )
            )}
          </Section>

          <Section
            title="Next 10 runs"
            description={`Local time · ${timeZone}`}
            actions={
              <Button size="sm" variant="ghost" icon="RefreshCw" onClick={() => setNow(new Date())}>
                Now
              </Button>
            }
          >
            {!parsed ? (
              <p className="text-[12.5px] text-ink-faint">Fix the expression to see when it would run.</p>
            ) : runs.length === 0 ? (
              <Alert tone="warn" title="This schedule never runs">
                No matching time exists in the next {SEARCH_YEARS} years. A combination like day 30 in February can be
                written but can never happen.
              </Alert>
            ) : (
              <div className="overflow-hidden rounded-lg border border-line">
                {runs.map((run, index) => (
                  <div
                    key={run.getTime()}
                    className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-b-0"
                  >
                    <span className="w-5 shrink-0 text-right font-mono text-[11px] text-ink-faint">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink selectable">
                      {formatter.format(run)}
                    </span>
                    <span className="shrink-0 text-[11.5px] text-ink-faint">{relativeLabel(run, now)}</span>
                  </div>
                ))}
              </div>
            )}
            {runs.length > 0 && (
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-[11.5px] text-ink-faint">
                  Counted from {formatter.format(now)}. Daylight-saving changes are applied as your system reports them.
                </p>
                <CopyButton
                  value={() => runs.map((r) => formatter.format(r)).join('\n')}
                  label="Copy list"
                  size="sm"
                  variant="ghost"
                />
              </div>
            )}
          </Section>

          {parsed && (
            <Section title="Fields">
              <div className="overflow-hidden rounded-lg border border-line">
                {rows
                  .filter((row) => row.field !== null)
                  .map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-b-0"
                    >
                      <span className="w-[110px] shrink-0 text-[12.5px] text-ink-soft">{row.label}</span>
                      <span className="w-[70px] shrink-0 font-mono text-[12.5px] text-ink">{row.field?.raw}</span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-faint">
                        {row.field ? fieldSummary(row.field) : ''}
                      </span>
                      <Badge>{row.field?.values.length}</Badge>
                    </div>
                  ))}
              </div>
            </Section>
          )}
        </>
      }
      aside={
        <>
          <Section title="Builder" description="Pick the parts — the expression follows">
            <div className="space-y-3">
              <Field label="Minute">
                <Select
                  value={base[0]}
                  onChange={(e) => setPart(0, e.target.value)}
                  options={withCustom(MINUTE_OPTIONS, base[0])}
                />
              </Field>
              <Field label="Hour">
                <Select
                  value={base[1]}
                  onChange={(e) => setPart(1, e.target.value)}
                  options={withCustom(HOUR_OPTIONS, base[1])}
                />
              </Field>
              <Field label="Day of month">
                <Select
                  value={base[2]}
                  onChange={(e) => setPart(2, e.target.value)}
                  options={withCustom(DOM_OPTIONS, base[2])}
                />
              </Field>
              <Field label="Month">
                <Select
                  value={base[3]}
                  onChange={(e) => setPart(3, e.target.value)}
                  options={withCustom(MONTH_OPTIONS, base[3])}
                />
              </Field>
              <Field
                label="Day of week"
                hint={
                  base[2] !== '*' && base[4] !== '*'
                    ? 'With both day fields set, cron runs when either matches'
                    : undefined
                }
              >
                <Select
                  value={base[4]}
                  onChange={(e) => setPart(4, e.target.value)}
                  options={withCustom(DOW_OPTIONS, base[4])}
                />
              </Field>
            </div>
          </Section>

          <Section title="Syntax">
            <div className="space-y-1.5 text-[12px] text-ink-soft">
              {[
                ['*', 'every value'],
                ['5', 'exactly 5'],
                ['1-5', 'the range 1 to 5'],
                ['1,3,5', 'this list of values'],
                ['*/15', 'every 15th value'],
                ['9-17/2', 'every 2nd value from 9 to 17'],
                ['JAN, MON', 'three-letter names'],
                ['?', 'same as * in a day field'],
              ].map(([symbol, meaning]) => (
                <div key={symbol} className="flex items-baseline gap-2">
                  <span className="w-[74px] shrink-0 font-mono text-[12px] text-ink">{symbol}</span>
                  <span className="min-w-0 flex-1 text-[11.5px] text-ink-faint">{meaning}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-[11.5px] leading-[1.6] text-ink-faint">
              <Icon name="Info" size={13} className="mt-[1px] shrink-0" />
              Field order is minute, hour, day-of-month, month, day-of-week. Add a sixth field at the front for seconds.
              The extended symbols L, W and # are not supported.
            </p>
          </Section>
        </>
      }
    />
  );
}
