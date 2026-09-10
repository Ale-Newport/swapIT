import { useEffect, useMemo, useState } from 'react';
import { call } from '@/core/bridge';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import {
  ErrorDisplay,
  FileDropZone,
  OutputSettings,
  PresetRow,
  ResultPanel,
  ToolActions,
  ToolShell,
  useOutputSpec,
} from '@/components/tool';
import { Alert, Badge, Field, Icon, Section, Select, Slider, Spinner, Switch } from '@/components/ui';
import {
  describeAudio,
  formatClipLength,
  formatSpeed,
  MAX_SPEED,
  MIN_SPEED,
  resultingDuration,
  SLIDER_MAX,
  SLIDER_MIN,
  sliderToSpeed,
  speedToSlider,
} from './logic';

interface ProbedMedia {
  path: string;
  duration?: number | null;
}

const PRESETS = [0.25, 0.5, 0.75, 1.25, 1.5, 2, 4];

const FORMATS = [
  { value: '', label: 'Same as the input' },
  { value: 'mp4', label: 'MP4 (H.264)' },
  { value: 'mov', label: 'MOV (QuickTime)' },
  { value: 'mkv', label: 'MKV (Matroska)' },
  { value: 'webm', label: 'WebM (VP9)' },
];

const QUALITY = [
  { value: '18', label: 'High — larger file' },
  { value: '23', label: 'Balanced' },
  { value: '28', label: 'Small — softer detail' },
];

/** ffprobe each file separately so one unreadable video cannot blank the list. */
async function probeMany(
  paths: string[],
  onProgress: (done: number) => void,
  signal: { cancelled: boolean },
): Promise<Record<string, ProbedMedia>> {
  const found: Record<string, ProbedMedia> = {};
  let next = 0;
  let done = 0;
  const workers = Array.from({ length: Math.min(4, paths.length) }, async () => {
    while (next < paths.length && !signal.cancelled) {
      const path = paths[next++];
      try {
        const [info] = await call<ProbedMedia[]>('probe_media', { inputs: [path] });
        if (info) found[path] = info;
      } catch {
        /* an unreadable file simply has no known duration */
      }
      onProgress(++done);
    }
  });
  await Promise.all(workers);
  return found;
}

export default function ChangeVideoSpeed() {
  const files = useToolFiles({ kinds: ['video'], filterName: 'Videos' });
  const run = useToolRun('video/speed', 'Change Video Speed');
  const { spec, update } = useOutputSpec();

  const [speed, setSpeed] = useState(2);
  const [keepAudio, setKeepAudio] = useState(true);
  const [format, setFormat] = useState('');
  const [crf, setCrf] = useState('23');

  const [probed, setProbed] = useState<Record<string, ProbedMedia>>({});
  const [probeDone, setProbeDone] = useState(0);
  const [probing, setProbing] = useState(false);

  const paths = files.paths;
  const pathKey = paths.join('|');
  useEffect(() => {
    if (paths.length === 0) {
      setProbed({});
      setProbing(false);
      return;
    }
    const signal = { cancelled: false };
    setProbing(true);
    setProbeDone(0);
    void probeMany(paths, setProbeDone, signal).then((map) => {
      if (signal.cancelled) return;
      setProbed(map);
      setProbing(false);
    });
    return () => {
      signal.cancelled = true;
    };
    // `paths` is a new array on every render; the joined key is what actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey]);

  const timing = useMemo(() => {
    const rows = files.files.map((f) => {
      const before = probed[f.path]?.duration ?? null;
      return { path: f.path, name: f.name, before, after: resultingDuration(before, speed) };
    });
    const known = rows.filter((r) => r.before !== null);
    return {
      rows,
      unknown: rows.length - known.length,
      totalBefore: known.reduce((sum, r) => sum + (r.before ?? 0), 0),
      totalAfter: known.reduce((sum, r) => sum + (r.after ?? 0), 0),
      hasKnown: known.length > 0,
    };
  }, [files.files, probed, speed]);

  const unchanged = Math.abs(speed - 1) < 0.0001;

  const execute = () =>
    void run.execute({
      command: 'process_video',
      total: files.files.length,
      inputs: files.paths,
      label: `Change ${files.files.length} video${files.files.length === 1 ? '' : 's'} to ${formatSpeed(speed)}`,
      args: {
        inputs: files.paths,
        ops: {
          format: format || undefined,
          speed,
          removeAudio: !keepAudio,
          crf: Number(crf),
        },
        output: spec,
      },
    });

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop videos here"
            hint="MP4, MOV, MKV, AVI, WebM — every file gets the same speed change"
            allowFolders
          />

          {!files.isEmpty && (
            <Section
              title="New length"
              description={
                probing
                  ? `Reading durations… ${probeDone} of ${files.files.length}`
                  : timing.hasKnown
                    ? `${formatClipLength(timing.totalBefore)} of footage becomes ${formatClipLength(timing.totalAfter)} at ${formatSpeed(speed)}`
                    : 'Durations could not be read from these files.'
              }
              actions={probing ? <Spinner /> : <Badge tone="accent">{formatSpeed(speed)}</Badge>}
            >
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                {timing.rows.slice(0, 8).map((row) => (
                  <li key={row.path} className="flex items-center gap-2.5 bg-panel px-3 py-2">
                    <Icon name="Video" size={14} className="shrink-0 text-ink-faint" />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink" title={row.path}>
                      {row.name}
                    </span>
                    <span className="shrink-0 text-[12px] text-ink-faint">{formatClipLength(row.before)}</span>
                    <Icon name="ArrowRight" size={13} className="shrink-0 text-ink-faint" />
                    <span className="shrink-0 text-[12px] font-medium text-ink">
                      {formatClipLength(row.after)}
                    </span>
                  </li>
                ))}
              </ul>
              {timing.rows.length > 8 && (
                <p className="mt-2 text-[11.5px] text-ink-faint">
                  …and {timing.rows.length - 8} more, all retimed the same way.
                </p>
              )}
              {timing.unknown > 0 && !probing && (
                <p className="mt-2 text-[11.5px] text-ink-faint">
                  {timing.unknown} file{timing.unknown === 1 ? '' : 's'} did not report a duration. They are still
                  processed — only the preview above is missing.
                </p>
              )}
            </Section>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} />}
        </>
      }
      aside={
        <>
          <Section title="Speed">
            <div className="space-y-3">
              <PresetRow
                presets={PRESETS.map((p) => ({
                  label: formatSpeed(p),
                  value: p,
                  hint: p < 1 ? 'Slow motion' : 'Faster playback',
                }))}
                active={speed}
                onSelect={setSpeed}
              />
              <Field
                label={`Custom — ${formatSpeed(speed)}`}
                hint={`Anywhere from ${formatSpeed(MIN_SPEED)} to ${formatSpeed(MAX_SPEED)}.`}
              >
                <Slider
                  min={SLIDER_MIN}
                  max={SLIDER_MAX}
                  step={0.01}
                  value={speedToSlider(speed)}
                  onChange={(pos) => setSpeed(sliderToSpeed(pos))}
                />
              </Field>
              <Field inline label="Keep the audio" hint="Turn off for a silent result">
                <Switch checked={keepAudio} onCheckedChange={setKeepAudio} />
              </Field>
              <Alert tone="info">{describeAudio(speed, keepAudio)}</Alert>
              {unchanged && (
                <Alert tone="warn">
                  1x leaves the timing alone. Pick another speed, or use the video converter if you only want to
                  re-encode.
                </Alert>
              )}
            </div>
          </Section>

          <Section title="Encoding">
            <div className="space-y-3">
              <Field label="Container">
                <Select value={format} onChange={(e) => setFormat(e.target.value)} options={FORMATS} />
              </Field>
              <Field label="Quality" hint="Retiming always re-encodes. Applies to H.264, H.265 and VP9 output.">
                <Select value={crf} onChange={(e) => setCrf(e.target.value)} options={QUALITY} />
              </Field>
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label={`Apply ${formatSpeed(speed)}`}
            icon="FastForward"
            disabled={files.isEmpty || unchanged}
            disabledReason={files.isEmpty ? 'Add at least one video first.' : 'Choose a speed other than 1x.'}
          />
        </>
      }
    />
  );
}
