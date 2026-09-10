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
} from '@/components/ui';
import {
  type IsoComponent,
  type IsoDuration,
  type IsoFormatOptions,
  type IsoResult,
  ZERO_DURATION,
  applyDuration,
  describeDuration,
  durationSeconds,
  formatIso,
  formatIsoDuration,
  formatOrdinalDate,
  formatWeekDate,
  fromLocalInput,
  isoWeekOf,
  ordinalOf,
  parseIso,
  toLocalInput,
  weeksInIsoYear,
} from './logic';

type WriteMode = 'datetime' | 'duration' | 'interval';
type IntervalShape = 'end' | 'duration';

type DurationField = Exclude<keyof IsoDuration, 'negative'>;

const DURATION_FIELDS: Array<{ key: DurationField; label: string }> = [
  { key: 'years', label: 'Years' },
  { key: 'months', label: 'Months' },
  { key: 'weeks', label: 'Weeks' },
  { key: 'days', label: 'Days' },
  { key: 'hours', label: 'Hours' },
  { key: 'minutes', label: 'Minutes' },
  { key: 'seconds', label: 'Seconds' },
];

const DURATION_PRESETS: Array<{ label: string; value: Partial<IsoDuration> }> = [
  { label: 'PT30M', value: { minutes: 30 } },
  { label: 'PT1H30M', value: { hours: 1, minutes: 30 } },
  { label: 'P1D', value: { days: 1 } },
  { label: 'P2W', value: { weeks: 2 } },
  { label: 'P1M', value: { months: 1 } },
  { label: 'P1Y2M3DT4H5M6S', value: { years: 1, months: 2, days: 3, hours: 4, minutes: 5, seconds: 6 } },
];

const SAMPLES = [
  '2024-04-15T09:30:00Z',
  '2024-04-15T09:30:00+02:00',
  '20240415T093000Z',
  '2024-W03-1',
  '2024-045',
  'P1Y2M3DT4H5M6S',
  'PT45M',
  '2024-04-15/P5D',
  'R5/2024-04-15T00:00:00Z/P1D',
];

/** An exact duration in days and below — the only units a span of seconds fixes. */
function exactDuration(totalSeconds: number): IsoDuration {
  let rest = Math.max(0, Math.round(totalSeconds));
  const days = Math.floor(rest / 86_400);
  rest -= days * 86_400;
  const hours = Math.floor(rest / 3600);
  rest -= hours * 3600;
  const minutes = Math.floor(rest / 60);
  rest -= minutes * 60;
  return { ...ZERO_DURATION, days, hours, minutes, seconds: rest };
}

const FULL = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function ComponentTable({ components }: { components: IsoComponent[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      {components.map((component, index) => (
        <div
          key={`${component.label}-${index}`}
          className="flex items-baseline gap-3 border-b border-line px-3 py-2 last:border-b-0"
        >
          <span className="w-[104px] shrink-0 text-[12.5px] text-ink-soft">{component.label}</span>
          <span className="min-w-[92px] shrink-0 font-mono text-[12.5px] text-ink selectable">{component.value}</span>
          <span className="min-w-0 flex-1 text-[11.5px] leading-[1.5] text-ink-faint">{component.note ?? ''}</span>
        </div>
      ))}
    </div>
  );
}

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

function ParsedView({ result }: { result: IsoResult }) {
  if (result.kind === 'datetime') {
    const { date } = result;
    const week = isoWeekOf(date);
    const ordinal = ordinalOf(date);
    return (
      <>
        <p className="text-[17px] font-semibold leading-snug text-ink selectable">{FULL.format(date)}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge tone="accent">{result.form}</Badge>
          <Badge>
            {week.year}-W{String(week.week).padStart(2, '0')}-{week.weekday}
          </Badge>
          <Badge>Day {ordinal.day}</Badge>
        </div>
        <p className="mt-3 text-[11px] uppercase tracking-wide text-ink-faint">What each part means</p>
        <div className="mt-1.5">
          <ComponentTable components={result.components} />
        </div>
        <p className="mt-3 text-[11px] uppercase tracking-wide text-ink-faint">The instant it names</p>
        <div className="mt-1.5 overflow-hidden rounded-lg border border-line">
          <OutputRow label="Local" value={FULL.format(date)} />
          <OutputRow label="UTC" value={date.toISOString()} />
          <OutputRow label="Unix seconds" value={String(Math.floor(date.getTime() / 1000))} />
          <OutputRow label="Week date" value={formatWeekDate(date)} hint={`${weeksInIsoYear(week.year)} weeks that year`} />
          <OutputRow label="Ordinal date" value={formatOrdinalDate(date)} />
        </div>
      </>
    );
  }

  if (result.kind === 'duration') {
    const total = durationSeconds(result.duration);
    const fromNow = (() => {
      try {
        return applyDuration(new Date(), result.duration, 1);
      } catch {
        return null;
      }
    })();
    return (
      <>
        <p className="text-[17px] font-semibold leading-snug text-ink selectable">
          {describeDuration(result.duration)}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge tone="accent">{result.form}</Badge>
          <Badge>{formatIsoDuration(result.duration)}</Badge>
          {total.approximate && <Badge tone="warn">Length varies</Badge>}
        </div>
        <p className="mt-3 text-[11px] uppercase tracking-wide text-ink-faint">What each part means</p>
        <div className="mt-1.5">
          <ComponentTable components={result.components} />
        </div>
        <div className="mt-3 overflow-hidden rounded-lg border border-line">
          <OutputRow label="Normalised" value={formatIsoDuration(result.duration)} />
          <OutputRow
            label="Seconds"
            value={String(Math.round(total.seconds))}
            hint={total.approximate ? 'approximate' : 'exact'}
          />
          {fromNow && <OutputRow label="From now" value={FULL.format(fromNow)} />}
        </div>
      </>
    );
  }

  const { start, end } = result;
  const lengthSeconds = start && end ? Math.round((end.getTime() - start.getTime()) / 1000) : null;
  return (
    <>
      <p className="text-[17px] font-semibold leading-snug text-ink selectable">
        {start ? FULL.format(start) : '—'} → {end ? FULL.format(end) : '—'}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Badge tone="accent">{result.form}</Badge>
        {result.duration && <Badge>{formatIsoDuration(result.duration)}</Badge>}
        {result.repeats !== null && (
          <Badge tone="warn">{result.repeats === -1 ? 'Repeats indefinitely' : `Repeats ${result.repeats}×`}</Badge>
        )}
      </div>
      <p className="mt-3 text-[11px] uppercase tracking-wide text-ink-faint">What each part means</p>
      <div className="mt-1.5">
        <ComponentTable components={result.components} />
      </div>
      <div className="mt-3 overflow-hidden rounded-lg border border-line">
        {start && <OutputRow label="Start" value={start.toISOString()} />}
        {end && <OutputRow label="End" value={end.toISOString()} />}
        {lengthSeconds !== null && (
          <OutputRow label="Length" value={`${lengthSeconds.toLocaleString()} s`} hint="exact elapsed time" />
        )}
      </div>
    </>
  );
}

export default function Iso8601Converter() {
  const [text, setText] = useState('2024-04-15T09:30:00Z');
  const [pickedText, setPickedText] = useState(() => toLocalInput(new Date()));
  const [endText, setEndText] = useState(() => toLocalInput(new Date(Date.now() + 86_400_000)));
  const [zone, setZone] = useState<IsoFormatOptions['zone']>('utc');
  const [precision, setPrecision] = useState<IsoFormatOptions['precision']>('seconds');
  const [basic, setBasic] = useState(false);
  const [writeMode, setWriteMode] = useState<WriteMode>('datetime');
  const [duration, setDuration] = useState<IsoDuration>({ ...ZERO_DURATION, days: 1 });
  const [intervalShape, setIntervalShape] = useState<IntervalShape>('end');
  const [repeats, setRepeats] = useState(0);

  const { parsed, error } = useMemo(() => {
    try {
      return { parsed: parseIso(text), error: null as string | null };
    } catch (err) {
      return { parsed: null as IsoResult | null, error: err instanceof Error ? err.message : String(err) };
    }
  }, [text]);

  const picked = useMemo(() => fromLocalInput(pickedText), [pickedText]);
  const pickedEnd = useMemo(() => fromLocalInput(endText), [endText]);
  const options: IsoFormatOptions = { zone, precision, basic };

  const durationText = formatIsoDuration(duration);
  const durationTotal = durationSeconds(duration);
  const durationFromNow = useMemo(() => {
    try {
      return applyDuration(new Date(), duration, 1);
    } catch {
      return null;
    }
  }, [duration]);

  /** The end of the written interval, whether it was picked or worked out. */
  const intervalEnd = useMemo(() => {
    if (!picked) return null;
    if (intervalShape === 'end') return pickedEnd;
    try {
      return applyDuration(picked, duration, 1);
    } catch {
      return null;
    }
  }, [picked, pickedEnd, duration, intervalShape]);

  const intervalText = (() => {
    if (!picked) return '';
    const prefix = repeats > 0 ? `R${repeats}/` : '';
    const start = formatIso(picked, options);
    if (intervalShape === 'duration') return `${prefix}${start}/${durationText}`;
    return pickedEnd ? `${prefix}${start}/${formatIso(pickedEnd, options)}` : '';
  })();

  const intervalSeconds =
    picked && intervalEnd ? Math.round((intervalEnd.getTime() - picked.getTime()) / 1000) : null;

  const written =
    writeMode === 'datetime'
      ? picked
        ? formatIso(picked, options)
        : ''
      : writeMode === 'duration'
        ? durationText
        : intervalText;

  const setDurationField = (key: DurationField, value: number) =>
    setDuration((current) => ({ ...current, [key]: Math.max(0, Math.trunc(value)) }));

  return (
    <ToolShell
      main={
        <>
          <Section
            title="Read an ISO 8601 string"
            description="Dates, week dates, ordinal dates, durations and intervals"
            actions={
              <Button
                size="sm"
                variant="ghost"
                icon="ClipboardPaste"
                onClick={async () => {
                  try {
                    setText(await navigator.clipboard.readText());
                  } catch {
                    /* clipboard unavailable */
                  }
                }}
              >
                Paste
              </Button>
            }
          >
            <Input
              value={text}
              spellCheck={false}
              autoComplete="off"
              placeholder="2024-04-15T09:30:00Z"
              onChange={(event) => setText(event.target.value)}
              className="font-mono text-[14px]"
            />
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {SAMPLES.map((sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => setText(sample)}
                  className="rounded-lg border border-line bg-panel px-2.5 py-1 font-mono text-[11.5px] text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
                >
                  {sample}
                </button>
              ))}
            </div>

            {error ? (
              <Alert tone="danger" className="mt-3" title="That is not a string ISO 8601 defines">
                {error}
              </Alert>
            ) : (
              parsed && <div className="mt-3">{<ParsedView result={parsed} />}</div>
            )}
          </Section>

          <Section
            title="Write an ISO 8601 string"
            description={
              writeMode === 'datetime'
                ? 'Pick a moment, choose the shape on the right'
                : writeMode === 'duration'
                  ? 'An amount of time: P for the date parts, T for the time parts'
                  : 'Two values joined by a slash, repeating if you want'
            }
            actions={
              <>
                <Segmented
                  size="sm"
                  value={writeMode}
                  onChange={setWriteMode}
                  options={[
                    { value: 'datetime' as WriteMode, label: 'Moment' },
                    { value: 'duration' as WriteMode, label: 'Duration' },
                    { value: 'interval' as WriteMode, label: 'Interval' },
                  ]}
                />
                {writeMode !== 'duration' && (
                  <Button size="sm" variant="secondary" onClick={() => setPickedText(toLocalInput(new Date()))}>
                    Now
                  </Button>
                )}
              </>
            }
          >
            {writeMode !== 'duration' && (
              <Field
                label={writeMode === 'interval' ? 'Start' : 'Date and time'}
                hint="Read in local time"
                error={picked ? undefined : 'Pick a valid date and time'}
              >
                <Input
                  type="datetime-local"
                  step={1}
                  value={pickedText}
                  onChange={(event) => setPickedText(event.target.value)}
                  className="font-mono"
                />
              </Field>
            )}

            {writeMode === 'interval' && (
              <div className="mt-3 space-y-3">
                <Field label="What follows the slash">
                  <Segmented
                    className="w-full"
                    value={intervalShape}
                    onChange={setIntervalShape}
                    options={[
                      { value: 'end' as IntervalShape, label: 'An end time' },
                      { value: 'duration' as IntervalShape, label: 'A duration' },
                    ]}
                  />
                </Field>
                {intervalShape === 'end' && (
                  <Field
                    label="End"
                    hint="Read in local time"
                    error={pickedEnd ? undefined : 'Pick a valid date and time'}
                  >
                    <Input
                      type="datetime-local"
                      step={1}
                      value={endText}
                      onChange={(event) => setEndText(event.target.value)}
                      className="font-mono"
                    />
                  </Field>
                )}
                <Field
                  label="Repeats"
                  hint={
                    repeats > 0
                      ? `R${repeats} runs the interval ${repeats} more time${repeats === 1 ? '' : 's'} after the first`
                      : 'Zero writes a plain interval, with no R prefix'
                  }
                >
                  <NumberInput
                    value={repeats}
                    min={0}
                    max={999}
                    onValueChange={(value) => setRepeats(Math.max(0, Math.min(999, Math.trunc(value))))}
                  />
                </Field>
              </div>
            )}

            {(writeMode === 'duration' || (writeMode === 'interval' && intervalShape === 'duration')) && (
              <div className={writeMode === 'duration' ? undefined : 'mt-3'}>
                <OptionsGrid cols={3}>
                  {DURATION_FIELDS.map((field) => (
                    <Field key={field.key} label={field.label}>
                      <NumberInput
                        value={duration[field.key]}
                        min={0}
                        step={1}
                        onValueChange={(value) => setDurationField(field.key, value)}
                      />
                    </Field>
                  ))}
                </OptionsGrid>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {DURATION_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setDuration({ ...ZERO_DURATION, ...preset.value })}
                      className="rounded-lg border border-line bg-panel px-2.5 py-1 font-mono text-[11.5px] text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {written ? (
              <>
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2.5">
                  <p className="min-w-0 flex-1 truncate font-mono text-[15px] font-semibold text-ink selectable">
                    {written}
                  </p>
                  <CopyButton value={written} size="sm" variant="secondary" />
                </div>

                {writeMode === 'datetime' && picked && (
                  <div className="mt-3 overflow-hidden rounded-lg border border-line">
                    <OutputRow
                      label="UTC"
                      value={formatIso(picked, { ...options, zone: 'utc' })}
                      hint="ends in Z"
                    />
                    <OutputRow
                      label="With offset"
                      value={formatIso(picked, { ...options, zone: 'offset' })}
                      hint="local time, stated"
                    />
                    <OutputRow label="Week date" value={formatWeekDate(picked, basic)} />
                    <OutputRow label="Ordinal date" value={formatOrdinalDate(picked, basic)} />
                    <OutputRow label="Unix seconds" value={String(Math.floor(picked.getTime() / 1000))} />
                  </div>
                )}

                {writeMode === 'duration' && (
                  <div className="mt-3 overflow-hidden rounded-lg border border-line">
                    <OutputRow label="In words" value={describeDuration(duration)} />
                    <OutputRow
                      label="Seconds"
                      value={String(Math.round(durationTotal.seconds))}
                      hint={durationTotal.approximate ? 'approximate' : 'exact'}
                    />
                    {durationFromNow && (
                      <OutputRow label="From now" value={formatIso(durationFromNow, options)} hint="added to now" />
                    )}
                  </div>
                )}

                {writeMode === 'interval' && picked && (
                  <div className="mt-3 overflow-hidden rounded-lg border border-line">
                    <OutputRow label="Start" value={formatIso(picked, options)} />
                    {intervalEnd && (
                      <OutputRow
                        label="End"
                        value={formatIso(intervalEnd, options)}
                        hint={intervalShape === 'duration' ? 'from the duration' : undefined}
                      />
                    )}
                    {intervalShape === 'end' && intervalSeconds !== null && intervalSeconds >= 0 && (
                      <OutputRow
                        label="As a duration"
                        value={`${repeats > 0 ? `R${repeats}/` : ''}${formatIso(picked, options)}/${formatIsoDuration(
                          exactDuration(intervalSeconds),
                        )}`}
                        hint="the same period, written the other way"
                      />
                    )}
                    {intervalSeconds !== null && (
                      <OutputRow label="Length" value={`${intervalSeconds.toLocaleString()} s`} hint="exact" />
                    )}
                  </div>
                )}

                {writeMode === 'interval' && intervalSeconds !== null && intervalSeconds < 0 && (
                  <Alert tone="warn" className="mt-3" title="The end comes before the start">
                    ISO 8601 intervals run forwards, so readers will treat this one as empty. Swap the two moments.
                  </Alert>
                )}

                {writeMode === 'duration' && durationTotal.approximate && (
                  <Alert tone="info" className="mt-3" title="This duration has no fixed length">
                    Years and months vary, so the total in seconds is an estimate — the exact length depends on the date
                    the duration is measured from.
                  </Alert>
                )}
              </>
            ) : (
              <Alert tone="warn" className="mt-3" title="Nothing to write yet">
                {writeMode === 'interval'
                  ? 'Both sides of the slash need a valid value.'
                  : 'Pick a valid date and time.'}
              </Alert>
            )}
          </Section>
        </>
      }
      aside={
        <>
          <Section title="Output shape">
            <div className="space-y-3">
              <Field label="Time zone" hint={zone === 'none' ? 'A string with no zone means local time wherever it is read' : undefined}>
                <Segmented
                  className="w-full"
                  value={zone}
                  onChange={setZone}
                  options={[
                    { value: 'utc' as IsoFormatOptions['zone'], label: 'UTC (Z)' },
                    { value: 'offset' as IsoFormatOptions['zone'], label: 'Offset' },
                    { value: 'none' as IsoFormatOptions['zone'], label: 'None' },
                  ]}
                />
              </Field>
              <Field label="Precision">
                <Segmented
                  className="w-full"
                  value={precision}
                  onChange={setPrecision}
                  options={[
                    { value: 'minutes' as IsoFormatOptions['precision'], label: 'Minutes' },
                    { value: 'seconds' as IsoFormatOptions['precision'], label: 'Seconds' },
                    { value: 'milliseconds' as IsoFormatOptions['precision'], label: 'Millis' },
                  ]}
                />
              </Field>
              <Field label="Format" hint={basic ? 'Basic drops the separators' : 'Extended keeps the dashes and colons'}>
                <Segmented
                  className="w-full"
                  value={basic ? 'basic' : 'extended'}
                  onChange={(value) => setBasic(value === 'basic')}
                  options={[
                    { value: 'extended', label: 'Extended' },
                    { value: 'basic', label: 'Basic' },
                  ]}
                />
              </Field>
            </div>
            {writeMode === 'duration' && (
              <p className="mt-3 text-[11.5px] leading-[1.6] text-ink-faint">
                A duration carries no zone and no separators of its own, so these settings shape only the moments —
                here, the date the duration lands on.
              </p>
            )}
          </Section>

          <Section title="The shapes ISO 8601 defines">
            <div className="space-y-1.5 text-[12px] text-ink-soft">
              {[
                ['2024-04-15', 'calendar date'],
                ['20240415', 'the same, basic format'],
                ['2024-W03-1', 'week date: year, week, weekday 1–7'],
                ['2024-045', 'ordinal date: year and day of year'],
                ['T09:30:15', 'time of day'],
                ['Z', 'UTC'],
                ['+02:00', 'offset from UTC'],
                ['P1Y2M3D', 'a duration in date units'],
                ['PT4H5M6S', 'a duration in time units'],
                ['start/end', 'an interval'],
                ['R5/start/P1D', 'a repeating interval'],
              ].map(([symbol, meaning]) => (
                <div key={symbol} className="flex items-baseline gap-2">
                  <span className="w-[92px] shrink-0 font-mono text-[11.5px] text-ink">{symbol}</span>
                  <span className="min-w-0 flex-1 text-[11.5px] text-ink-faint">{meaning}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-[11.5px] leading-[1.6] text-ink-faint">
              <Icon name="Info" size={13} className="mt-[1px] shrink-0" />
              M means months before the T and minutes after it. Weeks cannot be mixed with other date units in a strict
              reading, and a duration in years or months has no fixed length, so its total in seconds is an estimate.
            </p>
          </Section>
        </>
      }
    />
  );
}
