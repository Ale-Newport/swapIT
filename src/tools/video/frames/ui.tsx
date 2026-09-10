import { useEffect, useMemo, useState } from 'react';
import { call } from '@/core/bridge';
import { formatDuration } from '@/core/format';
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
  assetUrl,
  useOutputSpec,
} from '@/components/tool';
import { Alert, Badge, Field, Input, NumberInput, Section, Segmented, Slider, Switch } from '@/components/ui';
import { estimateFrames, rangeDuration, resolveRange, type FrameMode } from './logic';

interface ProbeStream {
  width: number | null;
  height: number | null;
  fps: number | null;
}
interface Probe {
  duration: number | null;
  video: ProbeStream | null;
}

export default function ExtractFrames() {
  const files = useToolFiles({ kinds: ['video'], filterName: 'Videos', multiple: false });
  const run = useToolRun('video/frames', 'Extract Frames');
  const { spec, update } = useOutputSpec();

  const [mode, setMode] = useState<FrameMode>('interval');
  const [interval, setInterval] = useState(1);
  const [count, setCount] = useState(12);
  const [format, setFormat] = useState('png');
  const [quality, setQuality] = useState(90);
  const [resize, setResize] = useState(false);
  const [width, setWidth] = useState(1280);
  const [startText, setStartText] = useState('');
  const [durationText, setDurationText] = useState('');

  const source = files.files[0] ?? null;
  const sourcePath = source?.path ?? null;

  const [probe, setProbe] = useState<Probe | null>(null);
  useEffect(() => {
    setProbe(null);
    if (!sourcePath) return;
    let alive = true;
    void call<Probe[]>('probe_media', { inputs: [sourcePath] })
      .then((infos) => {
        if (alive) setProbe(infos[0] ?? null);
      })
      .catch(() => {
        // Without ffprobe there is no length to preview against; extraction still runs.
      });
    return () => {
      alive = false;
    };
  }, [sourcePath]);

  const sourceDuration = probe?.duration ?? null;
  const sourceFps = probe?.video?.fps ?? null;
  const range = useMemo(
    () => resolveRange(startText, durationText, sourceDuration),
    [startText, durationText, sourceDuration],
  );

  const estimate = estimateFrames(mode, {
    durationSec: range.effective,
    sourceFps,
    interval,
    count,
  });

  const invalid =
    Boolean(range.startError || range.durationError) ||
    (mode === 'interval' && !(interval > 0)) ||
    (mode === 'count' && !(count >= 1));

  const produced = run.result?.results ?? [];
  const strip = produced.slice(0, 12);

  const execute = () => {
    if (!sourcePath || invalid) return;
    void run.execute({
      command: 'extract_frames',
      total: 1,
      inputs: [sourcePath],
      label: `Extract frames from ${source?.name ?? 'video'}`,
      args: {
        input: sourcePath,
        opts: {
          mode,
          interval: mode === 'interval' ? interval : undefined,
          count: mode === 'count' ? Math.round(count) : undefined,
          format,
          quality: format === 'jpg' ? quality : undefined,
          width: resize ? Math.round(width) : undefined,
          start: range.start > 0 ? range.start : undefined,
          duration: rangeDuration(mode, range) ?? undefined,
        },
        output: spec,
      },
    });
  };

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop a video here"
            hint="Frames are written into a new folder next to the video"
          />

          {source && (
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-faint">
              {sourceDuration !== null && <Badge>{formatDuration(sourceDuration)}</Badge>}
              {probe?.video?.width && probe.video.height && (
                <Badge>
                  {probe.video.width} × {probe.video.height}
                </Badge>
              )}
              {sourceFps && <Badge>{sourceFps.toFixed(sourceFps % 1 === 0 ? 0 : 2)} fps</Badge>}
              {estimate.frames !== null && (
                <span>
                  About {estimate.frames.toLocaleString()} image{estimate.frames === 1 ? '' : 's'} will be
                  written.
                </span>
              )}
            </div>
          )}

          {estimate.level !== 'ok' && estimate.frames !== null && (
            <Alert tone="warn" title={`About ${estimate.frames.toLocaleString()} images will be written`}>
              {estimate.level === 'huge'
                ? 'That is a very large batch: it takes a while and fills a single folder. '
                : 'They all land in one folder. '}
              A longer interval, a fixed number of frames or a shorter range keeps it manageable.
            </Alert>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}

          {produced.length > 0 && (
            <Section
              title={`${produced.length.toLocaleString()} frame${produced.length === 1 ? '' : 's'}`}
              description={strip.length < produced.length ? `Showing the first ${strip.length}` : undefined}
            >
              <div className="flex gap-2 overflow-x-auto pb-1">
                {strip.map((frame) => (
                  <figure key={frame.path} className="shrink-0">
                    <img
                      src={assetUrl(frame.path)}
                      alt={frame.name}
                      className="h-20 w-auto rounded border border-line bg-canvas object-contain"
                    />
                    <figcaption className="mt-1 max-w-[140px] truncate text-[11px] text-ink-faint">
                      {frame.name}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </Section>
          )}

          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} />}
        </>
      }
      aside={
        <>
          <Section title="Which frames">
            <div className="space-y-3">
              <Segmented
                value={mode}
                onChange={setMode}
                className="w-full"
                options={[
                  { value: 'interval', label: 'Every N s' },
                  { value: 'count', label: 'Fixed number' },
                  { value: 'all', label: 'Every frame' },
                ]}
              />
              {mode === 'interval' && (
                <Field label="One frame every" hint="Seconds between the stills that are saved.">
                  <div className="space-y-2">
                    <NumberInput
                      value={interval}
                      min={0.05}
                      max={3600}
                      step={0.5}
                      suffix="sec"
                      onValueChange={(v) => setInterval(Math.min(3600, Math.max(0.05, v)))}
                    />
                    <PresetRow
                      presets={[
                        { label: '0.5s', value: 0.5 },
                        { label: '1s', value: 1 },
                        { label: '5s', value: 5 },
                        { label: '10s', value: 10 },
                        { label: '30s', value: 30 },
                      ]}
                      active={interval}
                      onSelect={setInterval}
                    />
                  </div>
                </Field>
              )}
              {mode === 'count' && (
                <Field label="Number of frames" hint="Spread evenly across the clip.">
                  <NumberInput
                    value={count}
                    min={1}
                    max={2000}
                    step={1}
                    onValueChange={(v) => setCount(Math.min(2000, Math.max(1, Math.round(v))))}
                  />
                </Field>
              )}
              {mode === 'all' && (
                <p className="text-[11.5px] text-ink-faint">
                  Every single frame is written — {sourceFps ? `${sourceFps.toFixed(0)} per second of video` : 'often 24 to 60 per second of video'}.
                </p>
              )}
            </div>
          </Section>

          <Section title="Image format">
            <div className="space-y-3">
              <Segmented
                value={format}
                onChange={setFormat}
                className="w-full"
                options={[
                  { value: 'png', label: 'PNG — lossless' },
                  { value: 'jpg', label: 'JPG — smaller' },
                ]}
              />
              {format === 'jpg' && (
                <Field label={`Quality — ${quality}`} hint="Lower means smaller files.">
                  <Slider min={40} max={100} value={quality} onChange={setQuality} />
                </Field>
              )}
              <Field inline label="Resize frames" hint="Height follows the aspect ratio">
                <Switch checked={resize} onCheckedChange={setResize} />
              </Field>
              {resize && (
                <Field label="Width">
                  <NumberInput
                    value={width}
                    min={16}
                    max={7680}
                    step={10}
                    suffix="px"
                    onValueChange={(v) => setWidth(Math.min(7680, Math.max(16, Math.round(v))))}
                  />
                </Field>
              )}
            </div>
          </Section>

          <Section title="Part of the video" description="Leave empty for the whole thing">
            <div className="space-y-3">
              <Field
                label="Start at"
                hint={sourceDuration !== null ? `Video is ${formatDuration(sourceDuration)} long` : 'mm:ss or seconds'}
                error={range.startError}
              >
                <Input
                  value={startText}
                  placeholder="0:00"
                  spellCheck={false}
                  onChange={(e) => setStartText(e.target.value)}
                />
              </Field>
              <Field label="Length" error={range.durationError}>
                <Input
                  value={durationText}
                  placeholder="to the end"
                  spellCheck={false}
                  onChange={(e) => setDurationText(e.target.value)}
                />
              </Field>
            </div>
          </Section>

          <Section title="Where to save" description="A new folder is created for the frames">
            <OutputSettings spec={spec} onChange={update} showSuffix={false} showCollision={false} />
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label="Extract frames"
            icon="Images"
            disabled={files.isEmpty || invalid}
            disabledReason={files.isEmpty ? 'Add a video first.' : 'Fix the highlighted settings first.'}
          />
        </>
      }
    />
  );
}
