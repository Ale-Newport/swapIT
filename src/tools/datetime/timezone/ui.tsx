import clsx from 'clsx';
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
  Select,
} from '@/components/ui';
import {
  type WallParts,
  type WallResolution,
  allZones,
  dayShift,
  formatOffset,
  hourBand,
  isDaylightSaving,
  isValidZone,
  localInputToParts,
  localZone,
  partsToLocalInput,
  resolveWallTime,
  searchZones,
  wallToInstant,
  zoneAbbreviation,
  zoneCity,
  zoneOffsetMinutes,
  zoneParts,
  zoneRegion,
} from './logic';

const QUICK_ZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
].filter(isValidZone);

function dateFormatter(zone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: zone,
  });
}

function clockOf(parts: WallParts): string {
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

/** "an hour", "30 minutes", "a day" — how far a spring-forward moved the clock. */
function skipLabel(minutes: number): string {
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? 'a day' : `${days} days`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? 'an hour' : `${hours} hours`;
  }
  return `${minutes} minutes`;
}

function ZoneCard({
  zone,
  instantMs,
  sourceZone,
  onRemove,
}: {
  zone: string;
  instantMs: number;
  sourceZone: string;
  onRemove?: () => void;
}) {
  const parts = zoneParts(instantMs, zone);
  const offset = zoneOffsetMinutes(instantMs, zone);
  const shift = dayShift(instantMs, sourceZone, zone);
  const isSource = zone === sourceZone;

  return (
    <div
      className={clsx(
        'rounded-card border bg-panel px-3.5 py-3',
        isSource ? 'border-ink' : 'border-line',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-ink">{zoneCity(zone)}</p>
          <p className="truncate text-[11px] text-ink-faint">{zoneRegion(zone) || zone}</p>
        </div>
        {isSource ? (
          <Badge tone="accent">Source</Badge>
        ) : (
          onRemove && <IconButton icon="X" label={`Remove ${zoneCity(zone)}`} size="sm" onClick={onRemove} />
        )}
      </div>

      <p className="mt-2 font-mono text-[24px] font-semibold leading-none tabular-nums text-ink selectable">
        {clockOf(parts)}
        <span className="text-[14px] font-normal text-ink-faint">:{String(parts.second).padStart(2, '0')}</span>
      </p>

      <p className="mt-1.5 text-[12px] text-ink-soft">
        {dateFormatter(zone).format(new Date(instantMs))}
        {shift !== 0 && (
          <span className={clsx('ml-1.5 font-medium', shift > 0 ? 'text-accent' : 'text-warn')}>
            {shift > 0 ? `+${shift} day` : `${shift} day`}
          </span>
        )}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge>UTC{formatOffset(offset)}</Badge>
        <Badge>{zoneAbbreviation(instantMs, zone)}</Badge>
        {isDaylightSaving(instantMs, zone) ? (
          <Badge tone="warn">Daylight saving</Badge>
        ) : (
          <Badge tone="neutral">Standard time</Badge>
        )}
      </div>
    </div>
  );
}

export default function TimezoneConverter() {
  const [instantMs, setInstantMs] = useState(() => Date.now());
  const [sourceZone, setSourceZone] = useState(() => localZone());
  const [targets, setTargets] = useState<string[]>(() => {
    const local = localZone();
    return ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo'].filter(
      (zone) => zone !== local && isValidZone(zone),
    );
  });
  const [query, setQuery] = useState('');
  const [gapNotice, setGapNotice] = useState<string | null>(null);

  const zones = useMemo(() => allZones(), []);
  const zoneOptions = useMemo(
    () =>
      zones.map((zone) => ({
        value: zone,
        label: zoneRegion(zone) ? `${zoneCity(zone)} — ${zoneRegion(zone)}` : zoneCity(zone),
      })),
    [zones],
  );

  const sourceParts = zoneParts(instantMs, sourceZone);
  const sourceOffset = zoneOffsetMinutes(instantMs, sourceZone);
  const rows = useMemo(() => [sourceZone, ...targets.filter((zone) => zone !== sourceZone)], [sourceZone, targets]);
  const results = useMemo(() => searchZones(zones, query, instantMs), [zones, query, instantMs]);

  const dayStart = useMemo(
    () => wallToInstant({ ...zoneParts(instantMs, sourceZone), hour: 0, minute: 0, second: 0 }, sourceZone),
    [instantMs, sourceZone],
  );
  const columns = useMemo(
    () => Array.from({ length: 24 }, (_, index) => dayStart + index * 3_600_000),
    [dayStart],
  );
  const selectedColumn = Math.min(23, Math.max(0, Math.floor((instantMs - dayStart) / 3_600_000)));

  /** Move to an instant that was picked directly, so no clock time was rewritten. */
  const jumpTo = (ms: number) => {
    setInstantMs(ms);
    setGapNotice(null);
  };

  /** Move to a wall-clock time, saying so when that time does not exist. */
  const setWallTime = (parts: WallParts, zone: string) => {
    const resolution: WallResolution = resolveWallTime(parts, zone);
    setInstantMs(resolution.instantMs);
    setGapNotice(
      resolution.skippedMinutes > 0
        ? `Daylight saving skips ${clockOf(parts)} in ${zoneCity(zone)} on that date, so the time moved forward ${skipLabel(
            resolution.skippedMinutes,
          )} to ${clockOf(zoneParts(resolution.instantMs, zone))}.`
        : null,
    );
  };

  const changeSourceZone = (zone: string) => {
    const parts = zoneParts(instantMs, sourceZone);
    setSourceZone(zone);
    setWallTime(parts, zone);
  };

  const addTarget = (zone: string) => {
    setTargets((current) => (current.includes(zone) ? current : [...current, zone]));
    setQuery('');
  };

  const copyAll = () =>
    rows
      .map((zone) => {
        const parts = zoneParts(instantMs, zone);
        const shift = dayShift(instantMs, sourceZone, zone);
        return `${zoneCity(zone).padEnd(18)} ${clockOf(parts)}:${String(parts.second).padStart(2, '0')}  ${dateFormatter(
          zone,
        ).format(new Date(instantMs))}${shift ? ` (${shift > 0 ? '+' : ''}${shift} day)` : ''}  UTC${formatOffset(
          zoneOffsetMinutes(instantMs, zone),
        )}  ${zoneAbbreviation(instantMs, zone)}`;
      })
      .join('\n');

  return (
    <ToolShell
      main={
        <>
          <Section
            title="Source"
            description="One instant, read in the zone you choose"
            actions={
              <Button size="sm" variant="ghost" icon="RefreshCw" onClick={() => jumpTo(Date.now())}>
                Now
              </Button>
            }
          >
            <OptionsGrid cols={2}>
              <Field label="Time zone" hint="Changing this keeps the clock time and moves the instant">
                <Select
                  value={sourceZone}
                  onChange={(event) => changeSourceZone(event.target.value)}
                  options={zoneOptions}
                />
              </Field>
              <Field
                label="Date and time there"
                hint={`UTC${formatOffset(sourceOffset)} · ${zoneAbbreviation(instantMs, sourceZone)}`}
              >
                <Input
                  type="datetime-local"
                  step={1}
                  value={partsToLocalInput(sourceParts)}
                  onChange={(event) => {
                    const parts = localInputToParts(event.target.value);
                    if (parts) setWallTime(parts, sourceZone);
                  }}
                  className="font-mono"
                />
              </Field>
            </OptionsGrid>
            {gapNotice && (
              <Alert tone="warn" className="mt-3" title="That clock time does not exist">
                {gapNotice}
              </Alert>
            )}
            <p className="mt-2 text-[11.5px] text-ink-faint">
              That instant is{' '}
              <span className="font-mono text-ink-soft selectable">{new Date(instantMs).toISOString()}</span> in UTC.
            </p>
          </Section>

          <Section
            title={`In ${rows.length} zone${rows.length === 1 ? '' : 's'}`}
            actions={<CopyButton value={copyAll} label="Copy all" size="sm" variant="ghost" />}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {rows.map((zone) => (
                <ZoneCard
                  key={zone}
                  zone={zone}
                  instantMs={instantMs}
                  sourceZone={sourceZone}
                  onRemove={() => setTargets((current) => current.filter((entry) => entry !== zone))}
                />
              ))}
            </div>
            {targets.length === 0 && (
              <p className="mt-3 text-[12px] text-ink-faint">
                Add a zone from the panel on the right to compare it with the source.
              </p>
            )}
          </Section>

          <Section
            title="Meeting planner"
            description={`Every hour of ${dateFormatter(sourceZone).format(new Date(dayStart))} in ${zoneCity(
              sourceZone,
            )} — click an hour to jump to it`}
          >
            <div className="overflow-x-auto">
              <div className="min-w-[720px] space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-[130px] shrink-0" />
                  <div className="flex flex-1 gap-[2px]">
                    {columns.map((column, index) => (
                      <div key={column} className="flex-1 text-center text-[9.5px] tabular-nums text-ink-faint">
                        {index % 3 === 0 ? String(zoneParts(column, sourceZone).hour).padStart(2, '0') : ''}
                      </div>
                    ))}
                  </div>
                </div>

                {rows.map((zone) => (
                  <div key={zone} className="flex items-center gap-2">
                    <div className="w-[130px] shrink-0 truncate text-[12px] text-ink" title={zone}>
                      {zoneCity(zone)}
                      <span className="ml-1 text-[10.5px] text-ink-faint">
                        UTC{formatOffset(zoneOffsetMinutes(instantMs, zone))}
                      </span>
                    </div>
                    <div className="flex flex-1 gap-[2px]">
                      {columns.map((column, index) => {
                        const parts = zoneParts(column, zone);
                        const band = hourBand(parts.hour);
                        return (
                          <button
                            key={column}
                            type="button"
                            title={`${clockOf(parts)} in ${zoneCity(zone)}`}
                            onClick={() => jumpTo(column)}
                            className={clsx(
                              'flex-1 rounded-[3px] py-1 text-center text-[10.5px] font-medium tabular-nums transition-colors',
                              band === 'work'
                                ? 'bg-success-soft text-success'
                                : band === 'fringe'
                                  ? 'bg-warn-soft text-warn'
                                  : 'bg-ink/5 text-ink-faint',
                              index === selectedColumn && 'ring-2 ring-ink',
                              parts.hour === 0 && 'border-l border-line-strong',
                            )}
                          >
                            {String(parts.hour).padStart(2, '0')}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4 text-[11.5px] text-ink-faint">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-3.5 rounded-[3px] bg-success-soft" /> 09:00–18:00 working hours
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-3.5 rounded-[3px] bg-warn-soft" /> 07:00–09:00 and 18:00–21:00
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-3.5 rounded-[3px] bg-ink/5" /> outside the day
              </span>
            </div>
          </Section>
        </>
      }
      aside={
        <>
          <Section title="Add a time zone" description="Search by city, region or offset">
            <Input
              value={query}
              spellCheck={false}
              autoComplete="off"
              placeholder="Tokyo, Europe, +05:30…"
              onChange={(event) => setQuery(event.target.value)}
            />
            {query.trim() && (
              <div className="mt-2 overflow-hidden rounded-lg border border-line">
                {results.length === 0 ? (
                  <p className="px-3 py-2 text-[12px] text-ink-faint">No zone matches that.</p>
                ) : (
                  results.map((zone) => {
                    const already = rows.includes(zone);
                    return (
                      <button
                        key={zone}
                        type="button"
                        disabled={already}
                        onClick={() => addTarget(zone)}
                        className="flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-canvas disabled:opacity-40"
                      >
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                          {zoneCity(zone)}
                          {zoneRegion(zone) && <span className="text-ink-faint"> · {zoneRegion(zone)}</span>}
                        </span>
                        <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-ink-faint">
                          {clockOf(zoneParts(instantMs, zone))}
                        </span>
                        <Icon name={already ? 'Check' : 'Plus'} size={13} className="shrink-0 text-ink-faint" />
                      </button>
                    );
                  })
                )}
              </div>
            )}

            <p className="mt-3 text-[11px] uppercase tracking-wide text-ink-faint">Common</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {QUICK_ZONES.filter((zone) => !rows.includes(zone)).map((zone) => (
                <button
                  key={zone}
                  type="button"
                  onClick={() => addTarget(zone)}
                  className="rounded-lg border border-line bg-panel px-2.5 py-1 text-[12px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
                >
                  {zoneCity(zone)}
                </button>
              ))}
            </div>
            {targets.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                icon="Trash2"
                className="mt-3"
                onClick={() => setTargets([])}
              >
                Remove all targets
              </Button>
            )}
          </Section>

          <Section title="Jump to">
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: 'Now', apply: () => jumpTo(Date.now()) },
                {
                  label: '09:00 source',
                  apply: () =>
                    setWallTime({ ...zoneParts(instantMs, sourceZone), hour: 9, minute: 0, second: 0 }, sourceZone),
                },
                {
                  label: '14:00 source',
                  apply: () =>
                    setWallTime({ ...zoneParts(instantMs, sourceZone), hour: 14, minute: 0, second: 0 }, sourceZone),
                },
                { label: 'Tomorrow', apply: () => jumpTo(instantMs + 86_400_000) },
                { label: 'Next week', apply: () => jumpTo(instantMs + 7 * 86_400_000) },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={preset.apply}
                  className="rounded-lg border border-line bg-panel px-2.5 py-1 text-[12px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </Section>

          {isDaylightSaving(instantMs, sourceZone) && (
            <Alert tone="info" title="Daylight saving is in effect">
              {zoneCity(sourceZone)} is currently one step ahead of its standard offset. Rules differ by country, so a
              meeting fixed months ahead can shift by an hour for some of the people in it.
            </Alert>
          )}

          <Section title="Where the data comes from">
            <p className="flex items-start gap-1.5 text-[12px] leading-[1.65] text-ink-soft">
              <Icon name="Info" size={13} className="mt-[2px] shrink-0" />
              Offsets, abbreviations and daylight-saving rules come from the time-zone database built into macOS, so
              they follow every historical change rather than a fixed table.
            </p>
          </Section>
        </>
      }
    />
  );
}
