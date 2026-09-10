import { useMemo, useState } from 'react';
import { OptionsGrid, ToolShell } from '@/components/tool';
import {
  Alert,
  Badge,
  Button,
  CopyButton,
  Field,
  Icon,
  IconButton,
  Input,
  Section,
  Stat,
  Switch,
  Textarea,
} from '@/components/ui';
import {
  addDays,
  businessDayReport,
  calendarDayCount,
  calendarDiff,
  diffTotals,
  formatCalendarDiff,
  fromLocalInput,
  parseHolidayList,
  startOfDay,
  toLocalInput,
} from './logic';

const LONG = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const num = (value: number): string => value.toLocaleString();

function todayStart(): Date {
  return startOfDay(new Date());
}

/** Presets that make the tool immediately useful without typing a date. */
function presets(): Array<{ label: string; start: Date; end: Date }> {
  const now = new Date();
  const today = todayStart();
  const year = now.getFullYear();
  return [
    { label: 'Now → now', start: now, end: now },
    { label: 'This year', start: new Date(year, 0, 1), end: new Date(year, 11, 31) },
    { label: 'This month', start: new Date(year, now.getMonth(), 1), end: new Date(year, now.getMonth() + 1, 0) },
    { label: 'Next 30 days', start: today, end: addDays(today, 30) },
    { label: 'Last 30 days', start: addDays(today, -30), end: today },
    { label: 'Until new year', start: today, end: new Date(year + 1, 0, 1) },
  ];
}

function DateTimeField({
  label,
  value,
  onChange,
  parsed,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  parsed: Date | null;
}) {
  return (
    <Field
      label={label}
      hint={parsed ? LONG.format(parsed) : 'Not a valid date and time yet'}
      error={parsed ? undefined : 'Pick a date and time'}
    >
      <div className="flex items-center gap-1.5">
        <Input
          type="datetime-local"
          step={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono"
        />
        <Button size="sm" variant="secondary" onClick={() => onChange(toLocalInput(new Date()))}>
          Now
        </Button>
      </div>
    </Field>
  );
}

export default function DateDifference() {
  const [startText, setStartText] = useState(() => toLocalInput(todayStart()));
  const [endText, setEndText] = useState(() => toLocalInput(new Date(new Date().getFullYear() + 1, 0, 1)));
  const [includeEnd, setIncludeEnd] = useState(false);
  const [holidayText, setHolidayText] = useState('');

  const start = useMemo(() => fromLocalInput(startText), [startText]);
  const end = useMemo(() => fromLocalInput(endText), [endText]);
  const holidays = useMemo(() => parseHolidayList(holidayText), [holidayText]);
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  const diff = start && end ? calendarDiff(start, end) : null;
  const totals = start && end ? diffTotals(start, end) : null;
  const dayCount = start && end ? calendarDayCount(start, end, includeEnd) : 0;
  const business = start && end ? businessDayReport(start, end, holidays.dates, includeEnd) : null;

  const weekRemainder = totals ? totals.days - totals.weeks * 7 : 0;

  const summary = () => {
    if (!start || !end || !diff || !totals || !business) return '';
    return [
      `From  ${LONG.format(start)} ${start.toLocaleTimeString()}`,
      `To    ${LONG.format(end)} ${end.toLocaleTimeString()}`,
      '',
      `Difference   ${formatCalendarDiff(diff)}`,
      `Total weeks  ${num(totals.weeks)}`,
      `Total days   ${num(totals.days)}`,
      `Total hours  ${num(totals.hours)}`,
      `Total mins   ${num(totals.minutes)}`,
      `Total secs   ${num(totals.seconds)}`,
      '',
      `Dates counted  ${num(dayCount)}${includeEnd ? ' (end date included)' : ' (end date excluded)'}`,
      `Weekend days   ${num(business.weekendDays)}`,
      `Holidays       ${num(business.holidayDays)}`,
      `Business days  ${num(business.businessDays)}`,
    ].join('\n');
  };

  return (
    <ToolShell
      main={
        <>
          <Section
            title="The two dates"
            description={`Read in local time · ${timeZone}`}
            actions={
              <IconButton
                icon="ArrowRightLeft"
                label="Swap start and end"
                size="sm"
                onClick={() => {
                  setStartText(endText);
                  setEndText(startText);
                }}
              />
            }
          >
            <OptionsGrid cols={2}>
              <DateTimeField label="Start" value={startText} onChange={setStartText} parsed={start} />
              <DateTimeField label="End" value={endText} onChange={setEndText} parsed={end} />
            </OptionsGrid>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {presets().map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setStartText(toLocalInput(preset.start));
                    setEndText(toLocalInput(preset.end));
                  }}
                  className="rounded-lg border border-line bg-panel px-2.5 py-1 text-[12px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </Section>

          {!start || !end ? (
            <Alert tone="warn" title="Two complete dates are needed">
              Fill in both fields — a date and a time each — and the difference appears here.
            </Alert>
          ) : (
            <>
              <Section
                title="Difference"
                description="Counted the way a calendar counts, so February is 28 or 29 days"
                actions={<CopyButton value={summary} label="Copy summary" size="sm" variant="ghost" />}
              >
                {diff?.negative && (
                  <Alert tone="warn" className="mb-3" title="The start is after the end">
                    The figures below are the size of the gap. Use the swap button to put them in order.
                  </Alert>
                )}
                <p className="text-[17px] font-semibold leading-snug text-ink selectable">
                  {diff ? formatCalendarDiff(diff) : ''}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
                  {diff &&
                    (
                      [
                        ['Years', diff.years],
                        ['Months', diff.months],
                        ['Days', diff.days],
                        ['Hours', diff.hours],
                        ['Minutes', diff.minutes],
                        ['Seconds', diff.seconds],
                      ] as Array<[string, number]>
                    ).map(([label, value]) => (
                      <div key={label} className="rounded-lg border border-line bg-canvas px-2.5 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</p>
                        <p className="mt-0.5 text-[15px] font-semibold text-ink selectable">{value}</p>
                      </div>
                    ))}
                </div>
              </Section>

              <Section title="Totals" description="The same gap expressed in one unit at a time">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {totals && (
                    <>
                      <Stat
                        label="Total weeks"
                        value={num(totals.weeks)}
                        hint={weekRemainder ? `and ${num(weekRemainder)} day${weekRemainder === 1 ? '' : 's'}` : 'exactly'}
                      />
                      <Stat label="Total days" value={num(totals.days)} hint={`${num(totals.months)} whole months`} />
                      <Stat label="Total hours" value={num(totals.hours)} />
                      <Stat label="Total minutes" value={num(totals.minutes)} />
                      <Stat label="Total seconds" value={num(totals.seconds)} />
                      <Stat label="Total milliseconds" value={num(totals.milliseconds)} />
                    </>
                  )}
                </div>
                <p className="mt-3 flex items-start gap-1.5 text-[11.5px] leading-[1.6] text-ink-faint">
                  <Icon name="Info" size={13} className="mt-[1px] shrink-0" />
                  Totals are exact elapsed time between the two instants, so a daylight-saving change shows up as an
                  hour more or less than the calendar suggests.
                </p>
              </Section>

              <Section
                title="Working days"
                description="Saturdays and Sundays are never counted"
                actions={
                  business && business.businessDays > 0 ? (
                    <Badge tone="success">{num(business.businessDays)} business days</Badge>
                  ) : undefined
                }
              >
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {business && (
                    <>
                      <Stat
                        label="Dates counted"
                        value={num(business.totalDays)}
                        hint={includeEnd ? 'end date included' : 'end date excluded'}
                      />
                      <Stat label="Weekend days" value={num(business.weekendDays)} />
                      <Stat
                        label="Holidays"
                        value={num(business.holidayDays)}
                        hint={holidays.dates.length ? `${holidays.dates.length} in the list` : 'none listed'}
                      />
                      <Stat label="Business days" value={num(business.businessDays)} />
                    </>
                  )}
                </div>
                {business && business.observed.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {business.observed.map((key) => (
                      <Badge key={key} tone="accent">
                        {key}
                      </Badge>
                    ))}
                  </div>
                )}
              </Section>
            </>
          )}
        </>
      }
      aside={
        <>
          <Section title="Counting">
            <Field
              inline
              label="Include the end date"
              hint="1 to 3 March is 2 days without it, 3 days with it"
            >
              <Switch checked={includeEnd} onCheckedChange={setIncludeEnd} label="Include the end date" />
            </Field>
          </Section>

          <Section
            title="Holidays"
            description="Skipped on top of weekends"
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
              rows={6}
              placeholder={'2026-01-01 New Year\n2026-12-25 Christmas'}
            />
            <p className="mt-2 text-[11.5px] leading-[1.6] text-ink-faint">
              One date per line, year first: 2026-12-25, 2026/12/25 or 2026.12.25. Anything after the date is treated
              as its name. A holiday on a Saturday or Sunday is not counted twice.
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

          <Section title="How the breakdown works">
            <p className="text-[12px] leading-[1.65] text-ink-soft">
              Whole months are counted first, then whole days, then the leftover time. That is why 31 January to 28
              February is exactly one month, and 31 January to 1 March is one month and one day.
            </p>
          </Section>
        </>
      }
    />
  );
}
