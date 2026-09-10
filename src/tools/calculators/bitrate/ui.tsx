import { useState } from 'react';
import clsx from 'clsx';
import { ToolShell } from '@/components/tool';
import { Alert, Badge, Button, CopyButton, Field, Input, Section, Segmented, Select, Stat } from '@/components/ui';
import {
  BITRATE_FACTOR,
  DURATION_FACTOR,
  PRESETS,
  SIZE_FACTOR,
  bitrateFromSize,
  durationFromSize,
  formatBitrate,
  formatDurationLong,
  formatSize,
  formatSizeBinary,
  parseNonNegative,
  sizeFromBitrate,
  trim,
  type BitrateUnit,
  type DurationUnit,
  type SizeUnit,
} from './logic';

type Solve = 'size' | 'bitrate' | 'duration';

const BITRATE_UNITS = [
  { value: 'kbps', label: 'kbps' },
  { value: 'Mbps', label: 'Mbps' },
  { value: 'bps', label: 'bit/s' },
];

const DURATION_UNITS = [
  { value: 'seconds', label: 'seconds' },
  { value: 'minutes', label: 'minutes' },
  { value: 'hours', label: 'hours' },
];

const SIZE_UNITS = [
  { value: 'MB', label: 'MB' },
  { value: 'GB', label: 'GB' },
  { value: 'MiB', label: 'MiB' },
  { value: 'GiB', label: 'GiB' },
];

function AmountField({
  label,
  hint,
  value,
  onChange,
  unit,
  onUnitChange,
  units,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  unit: string;
  onUnitChange: (unit: string) => void;
  units: Array<{ value: string; label: string }>;
}) {
  const invalid = value.trim() !== '' && parseNonNegative(value) === null;
  return (
    <Field label={label} hint={hint} error={invalid ? 'Enter a number of zero or more' : undefined}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Input
            value={value}
            aria-label={label}
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => onChange(e.target.value)}
            className={clsx('font-mono', invalid && 'border-danger focus:border-danger')}
          />
        </div>
        <div className="w-[104px] shrink-0">
          <Select value={unit} onChange={(e) => onUnitChange(e.target.value)} options={units} aria-label={`${label} unit`} />
        </div>
      </div>
    </Field>
  );
}

export default function BitrateCalculator() {
  const [solve, setSolve] = useState<Solve>('size');
  const [videoText, setVideoText] = useState('8000');
  const [videoUnit, setVideoUnit] = useState<BitrateUnit>('kbps');
  const [audioText, setAudioText] = useState('128');
  const [audioUnit, setAudioUnit] = useState<BitrateUnit>('kbps');
  const [durationText, setDurationText] = useState('10');
  const [durationUnit, setDurationUnit] = useState<DurationUnit>('minutes');
  const [sizeText, setSizeText] = useState('500');
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>('MB');

  const videoInput = parseNonNegative(videoText);
  const audioInput = parseNonNegative(audioText);
  const durationInput = parseNonNegative(durationText);
  const sizeInput = parseNonNegative(sizeText);

  const videoBps = videoInput === null ? null : videoInput * BITRATE_FACTOR[videoUnit];
  const audioBps = audioInput === null ? null : audioInput * BITRATE_FACTOR[audioUnit];
  const enteredSeconds = durationInput === null ? null : durationInput * DURATION_FACTOR[durationUnit];
  const enteredBytes = sizeInput === null ? null : sizeInput * SIZE_FACTOR[sizeUnit];

  // Resolve the three quantities according to what is being solved for.
  let totalBps: number | null = null;
  let seconds: number | null = null;
  let bytes: number | null = null;
  let solvedVideoBps: number | null = null;

  if (solve === 'size') {
    totalBps = videoBps !== null && audioBps !== null ? videoBps + audioBps : null;
    seconds = enteredSeconds;
    bytes = totalBps !== null && seconds !== null ? sizeFromBitrate(totalBps, seconds) : null;
    solvedVideoBps = videoBps;
  } else if (solve === 'duration') {
    totalBps = videoBps !== null && audioBps !== null ? videoBps + audioBps : null;
    bytes = enteredBytes;
    seconds = bytes !== null && totalBps !== null ? durationFromSize(bytes, totalBps) : null;
    solvedVideoBps = videoBps;
  } else {
    bytes = enteredBytes;
    seconds = enteredSeconds;
    totalBps = bytes !== null && seconds !== null ? bitrateFromSize(bytes, seconds) : null;
    solvedVideoBps = totalBps !== null && audioBps !== null ? totalBps - audioBps : null;
  }

  const videoOverrun = solve === 'bitrate' && solvedVideoBps !== null && solvedVideoBps < 0;
  const perMinuteBytes = totalBps === null ? null : sizeFromBitrate(totalBps, 60);
  const perHourBytes = totalBps === null ? null : sizeFromBitrate(totalBps, 3600);

  const formula = (): string => {
    if (solve === 'size') {
      if (totalBps === null || seconds === null) return 'bytes = total bitrate × seconds ÷ 8';
      return `(${formatBitrate(videoBps)} + ${formatBitrate(audioBps)}) = ${trim(totalBps, 0)} bit/s × ${trim(seconds, 2)} s ÷ 8 = ${trim(bytes ?? 0, 0)} bytes`;
    }
    if (solve === 'duration') {
      if (bytes === null || totalBps === null) return 'seconds = bytes × 8 ÷ total bitrate';
      return `${trim(bytes, 0)} bytes × 8 ÷ ${trim(totalBps, 0)} bit/s = ${trim(seconds ?? 0, 2)} s`;
    }
    if (bytes === null || seconds === null) return 'bitrate = bytes × 8 ÷ seconds';
    return `${trim(bytes, 0)} bytes × 8 ÷ ${trim(seconds, 2)} s = ${trim(totalBps ?? 0, 0)} bit/s`;
  };

  const summary = () => {
    if (totalBps === null || seconds === null || bytes === null) return '';
    return [
      `Total bitrate  ${formatBitrate(totalBps)}`,
      `Duration       ${formatDurationLong(seconds)}`,
      `File size      ${formatSize(bytes)} (${formatSizeBinary(bytes)})`,
      `Per minute     ${formatSize(perMinuteBytes)}`,
      `Per hour       ${formatSize(perHourBytes)}`,
    ].join('\n');
  };

  const resultCard = () => {
    if (solve === 'size') {
      return (
        <>
          <p className="text-[11px] uppercase tracking-wide text-ink-faint">Estimated file size</p>
          <p className="mt-1 text-[26px] font-semibold leading-tight text-ink selectable">{formatSize(bytes)}</p>
          <p className="mt-0.5 text-[12.5px] text-ink-faint">
            {bytes === null ? 'Fill in the bitrates and a duration' : `${formatSizeBinary(bytes)} as a file manager shows it`}
          </p>
        </>
      );
    }
    if (solve === 'duration') {
      return (
        <>
          <p className="text-[11px] uppercase tracking-wide text-ink-faint">How long it lasts</p>
          <p className="mt-1 text-[26px] font-semibold leading-tight text-ink selectable">
            {formatDurationLong(seconds)}
          </p>
          <p className="mt-0.5 text-[12.5px] text-ink-faint">
            {seconds === null ? 'Fill in a size and the bitrates' : `${trim(seconds, 2)} seconds exactly`}
          </p>
        </>
      );
    }
    return (
      <>
        <p className="text-[11px] uppercase tracking-wide text-ink-faint">Total bitrate available</p>
        <p className="mt-1 text-[26px] font-semibold leading-tight text-ink selectable">{formatBitrate(totalBps)}</p>
        <p className="mt-0.5 text-[12.5px] text-ink-faint">
          {totalBps === null
            ? 'Fill in a size and a duration'
            : videoOverrun
              ? 'The audio alone already exceeds this budget'
              : `Video gets ${formatBitrate(solvedVideoBps)} once audio takes ${formatBitrate(audioBps)}`}
        </p>
      </>
    );
  };

  return (
    <ToolShell
      main={
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented
              value={solve}
              onChange={setSolve}
              options={[
                { value: 'size', label: 'Solve file size' },
                { value: 'bitrate', label: 'Solve bitrate' },
                { value: 'duration', label: 'Solve duration' },
              ]}
            />
            <CopyButton size="sm" value={summary} label="Copy" disabled={!summary()} />
          </div>

          <Section title="Known values" description="The third quantity is calculated below">
            <div className="grid gap-3 sm:grid-cols-2">
              {solve !== 'bitrate' && (
                <AmountField
                  label="Video bitrate"
                  hint="0 for audio-only files"
                  value={videoText}
                  onChange={setVideoText}
                  unit={videoUnit}
                  onUnitChange={(u) => setVideoUnit(u as BitrateUnit)}
                  units={BITRATE_UNITS}
                />
              )}
              <AmountField
                label="Audio bitrate"
                hint={solve === 'bitrate' ? 'Subtracted from the total' : 'Added to the video bitrate'}
                value={audioText}
                onChange={setAudioText}
                unit={audioUnit}
                onUnitChange={(u) => setAudioUnit(u as BitrateUnit)}
                units={BITRATE_UNITS}
              />
              {solve !== 'duration' && (
                <AmountField
                  label="Duration"
                  value={durationText}
                  onChange={setDurationText}
                  unit={durationUnit}
                  onUnitChange={(u) => setDurationUnit(u as DurationUnit)}
                  units={DURATION_UNITS}
                />
              )}
              {solve !== 'size' && (
                <AmountField
                  label="File size"
                  hint="MB and GB are decimal; MiB and GiB are 1024-based"
                  value={sizeText}
                  onChange={setSizeText}
                  unit={sizeUnit}
                  onUnitChange={(u) => setSizeUnit(u as SizeUnit)}
                  units={SIZE_UNITS}
                />
              )}
            </div>

            {solve !== 'bitrate' && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2">
                <span className="text-[12px] text-ink-soft">Total bitrate</span>
                <Badge tone="accent">{formatBitrate(totalBps)}</Badge>
                <span className="text-[11.5px] text-ink-faint">
                  video {formatBitrate(videoBps)} + audio {formatBitrate(audioBps)}
                </span>
              </div>
            )}
          </Section>

          <Section title="Result">
            <div className="rounded-lg border border-line bg-canvas px-4 py-3.5">{resultCard()}</div>

            {videoOverrun && (
              <Alert tone="warn" className="mt-3" title="Audio does not fit">
                {formatBitrate(audioBps)} of audio is more than the {formatBitrate(totalBps)} the size and duration
                allow. Lower the audio bitrate or accept a bigger file.
              </Alert>
            )}

            <p className="mt-3 font-mono text-[11.5px] leading-[1.7] text-ink-faint selectable">{formula()}</p>

            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <Stat label="Per minute" value={formatSize(perMinuteBytes)} hint={formatSizeBinary(perMinuteBytes)} />
              <Stat label="Per hour" value={formatSize(perHourBytes)} hint={formatSizeBinary(perHourBytes)} />
              <Stat
                label="Bytes per second"
                value={totalBps === null ? '—' : trim(totalBps / 8, 0)}
                hint="bitrate ÷ 8"
              />
              <Stat
                label="Total"
                value={bytes === null ? '—' : `${trim(bytes, 0)} B`}
                hint={seconds === null ? undefined : `over ${trim(seconds, 2)} s`}
              />
            </div>
          </Section>
        </>
      }
      aside={
        <>
          <Section title="Preset targets" description="Sets the video and audio bitrates">
            <div className="space-y-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  title={p.note}
                  onClick={() => {
                    setVideoUnit('kbps');
                    setAudioUnit('kbps');
                    setVideoText(String(p.videoKbps));
                    setAudioText(String(p.audioKbps));
                    if (solve === 'bitrate') setSolve('size');
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-left transition-colors hover:border-line-strong hover:bg-canvas"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-medium text-ink">{p.label}</span>
                    <span className="block truncate text-[11px] text-ink-faint">{p.note}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-ink-soft">
                    {p.videoKbps ? `${p.videoKbps / 1000 >= 1 ? `${p.videoKbps / 1000}M` : `${p.videoKbps}k`}+` : ''}
                    {p.audioKbps}k
                  </span>
                </button>
              ))}
            </div>
          </Section>

          <Section title="Reset">
            <Button
              size="sm"
              icon="RotateCcw"
              onClick={() => {
                setVideoText('8000');
                setVideoUnit('kbps');
                setAudioText('128');
                setAudioUnit('kbps');
                setDurationText('10');
                setDurationUnit('minutes');
                setSizeText('500');
                setSizeUnit('MB');
              }}
            >
              Back to defaults
            </Button>
          </Section>

          <Section title="Worth knowing">
            <ul className="space-y-2 text-[11.5px] leading-[1.6] text-ink-faint">
              <li>
                The eight in every formula is bits per byte. A 1 Mbps stream writes 125 kB every second, not 1 MB.
              </li>
              <li>
                These figures describe constant bitrate. Variable-bitrate encoders spend more on complex shots and
                less on simple ones, so a real file lands near the average but rarely on it.
              </li>
              <li>
                Container overhead — MP4 headers, timestamps, index tables — adds roughly 0.5 to 2% on top.
              </li>
            </ul>
          </Section>
        </>
      }
    />
  );
}
